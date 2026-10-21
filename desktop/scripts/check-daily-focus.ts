import {app,BrowserWindow,ipcMain} from 'electron';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import {JournalService} from '../core/service';
import {emptyState,type JournalState} from '../core/types';

const root=process.cwd(),version=JSON.parse(readFileSync('package.json','utf8')).version;
const output=path.join(root,`qa-evidence/release-${version}/daily-focus`);mkdirSync(output,{recursive:true});
app.setPath('userData',path.join(root,`qa-data/daily-focus-${version}`));app.disableHardwareAcceleration();
class Store{path='isolated daily focus QA';state=emptyState();load(){return structuredClone(this.state);}save(s:JournalState){this.state=structuredClone(s);}close(){}}
let time=Date.parse('2026-10-20T10:00:00+08:00');
const service=new JournalService(new Store(),{now:()=>time,monotonic:()=>time},true);
const add=(title:string,parentId:string|null=null,dueAt:string|null=null)=>service.execute({type:'task.save',payload:{title,parentId,dueAt}}).state.tasks.at(-1)!.id;
const urgent=add('核对到期事项',null,'2026-10-19'),parent=add('产品方案'),other=add('整理参考资料',parent),focus=add('完成方案初稿与关键交互说明',parent),paused=add('等待资料后再校对'),done=add('整理需求反馈');
service.execute({type:'outline.patch',payload:{id:parent,field:'isProject',value:true}});
for(const id of [paused,done])service.execute({type:'item.focus',payload:{id,date:'2026-10-20'}});
service.execute({type:'item.change',payload:{id:paused,action:'pause'}});
service.execute({type:'task.status',payload:{id:done,status:'done'}});
let win:BrowserWindow;const failures:string[]=[],checks:any[]=[];
const delay=(ms:number)=>new Promise(r=>setTimeout(r,ms)),run=(s:string)=>win.webContents.executeJavaScript(s);
async function until(s:string,message=s){for(let i=0;i<80;i++){if(await run(s))return;await delay(40);}throw Error(message);}
const changed=()=>win.webContents.send('journal:changed');
async function click(selector:string){
 await until(`!!document.querySelector(${JSON.stringify(selector)})`);
 await run('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
 const p=await run(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});e.scrollIntoView({block:'nearest'});const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`),z=win.webContents.getZoomFactor(),point={x:Math.round(p.x*z),y:Math.round(p.y*z)};
 win.webContents.sendInputEvent({type:'mouseMove',...point});win.webContents.sendInputEvent({type:'mouseDown',button:'left',clickCount:1,...point});win.webContents.sendInputEvent({type:'mouseUp',button:'left',clickCount:1,...point});await delay(120);
}
async function button(text:string){await run(`(()=>{const b=[...document.querySelectorAll('button')].find(e=>e.textContent.trim()===${JSON.stringify(text)});if(!b)throw Error('missing button');b.dataset.qaClick='yes';})()`);await click('[data-qa-click=yes]');await run(`document.querySelector('[data-qa-click=yes]')?.removeAttribute('data-qa-click')`);}
async function capture(name:string){for(let i=0;i<3;i++){try{writeFileSync(path.join(output,name),(await win.webContents.capturePage()).toPNG());return;}catch(e){if(i===2)throw e;await delay(150);}}}
async function check(){try{
 await app.whenReady();ipcMain.handle('journal:snapshot',()=>service.snapshot());ipcMain.handle('journal:clock',()=>service.clockSnapshot());ipcMain.handle('journal:command',(_e,c)=>{const result=service.execute(c);changed();return result;});
 ipcMain.handle('journal:capture-preferences',()=>({shortcut:'',registered:false}));ipcMain.handle('journal:window',()=>{});ipcMain.handle('sync:status',()=>({configured:false,phase:'idle'}));
 win=new BrowserWindow({show:false,width:1487,height:1058,frame:false,webPreferences:{preload:path.join(root,'dist-electron/preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true,offscreen:true,backgroundThrottling:false}});
 win.webContents.on('console-message',(_e,level,message)=>{if(level>=3)failures.push(message);});
 await win.webContents.session.clearStorageData({storages:['localstorage']});await win.loadFile(path.join(root,'dist/client/index.html'));await until(`!!document.querySelector('.today-page')`);await run('document.fonts.ready');
 await click('.nav-item[aria-label="事项"]');await click(`[data-outline-id="${focus}"] .tree-title .editable-value`);
 await click('[aria-label="加入今日重点 完成方案初稿与关键交互说明"]');await until(`!!document.querySelector('[data-outline-id="${focus}"] .daily-focus-badge')`);
 const first=await run(`document.querySelector('.outline-row[aria-level="1"]').dataset.outlineId`);if(first!==parent)throw Error('Focused branch was not promoted');
 for(const [width,height,zoom] of [[1487,1058,1],[900,640,1.25],[1060,720,1.5]]){
  win.setContentSize(width,height);win.webContents.setZoomFactor(zoom);await delay(180);
  const result=await run(`(()=>{const row=document.querySelector('[data-outline-id="${focus}"]'),badge=row.querySelector('.daily-focus-badge'),title=row.querySelector('.editable-value'),b=badge.getBoundingClientRect(),t=title.getBoundingClientRect();return {overflow:document.documentElement.scrollWidth>innerWidth+1,rowHeight:row.getBoundingClientRect().height,badgeVisible:b.width>8&&b.height>8,titleWidth:t.width};})()`);
  checks.push({page:'items',width,height,zoom,...result});if(result.overflow||result.rowHeight!==32||!result.badgeVisible||result.titleWidth<50)failures.push('Focus marker layout');await capture(`items-${width}-${zoom}.png`);
 }
 win.setContentSize(1487,1058);win.webContents.setZoomFactor(1);await delay(100);await click('.nav-item[aria-label="今日"]');
 await until(`!!document.querySelector('[data-focus-id="${focus}"]')`);await click('[aria-label="开始计时 完成方案初稿与关键交互说明"]');await until(`document.querySelector('[data-focus-id="${focus}"]').textContent.includes('专注中')`);
 if(service.snapshot().timers[0]?.taskId!==focus)throw Error('Direct focus start chose wrong item');
 for(const [width,height,zoom] of [[1487,1058,1],[900,640,1.25],[1060,720,1.5]]){
  win.setContentSize(width,height);win.webContents.setZoomFactor(zoom);await delay(180);
  await run(`document.querySelector('[aria-label="今日重点清单"]').scrollIntoView({block:'center'})`);
  const result=await run(`(()=>{const panel=document.querySelector('[aria-label="今日重点清单"]'),rows=panel.querySelectorAll('[data-focus-id]');return {overflow:document.documentElement.scrollWidth>innerWidth+1,progress:panel.textContent.includes('已完成 1 / 3'),openCount:rows.length,pausedDisabled:panel.querySelector('[aria-label="开始计时 等待资料后再校对"]').disabled};})()`);
  checks.push({page:'today',width,height,zoom,...result});if(result.overflow||!result.progress||result.openCount!==2||!result.pausedDisabled)failures.push('Daily queue layout or status');await capture(`today-${width}-${zoom}.png`);
 }
 win.setContentSize(1487,1058);win.webContents.setZoomFactor(1);await delay(100);
 service.execute({type:'focus.stop',payload:{taskId:focus,complete:true}});changed();await until(`document.querySelector('[aria-label="今日重点清单"]').textContent.includes('已完成 2 / 3')`);
 await click('.nav-item[aria-label="事项"]');await run(`(()=>{const b=[...document.querySelectorAll('[aria-label="事项视图"] button')].find(e=>e.querySelector('span')?.textContent==='今日重点');b.dataset.qaClick='focus-view';})()`);await click('[data-qa-click="focus-view"]');await until(`!document.querySelector('[data-outline-id="${parent}"]')`);
 win.webContents.reload();await until(`!!document.querySelector('[data-outline-id="${paused}"]')`);
 if(await run(`!!document.querySelector('[data-outline-id="${focus}"]')`))throw Error('Completed item reappeared after reload');
 time=Date.parse('2026-10-21T00:00:00+08:00');changed();await until(`!document.querySelector('[data-outline-id="${paused}"]')`);
 writeFileSync(path.join(output,'results.json'),JSON.stringify({cases:checks.length,failures,checks,flows:['pointer star and ancestor promotion','stable 32px geometry','direct start in daily queue','running focus retained','completed progress','paused start disabled','focus view reload','midnight expiry']},null,2));console.log(JSON.stringify({cases:checks.length,failures,output}));
 }catch(e){failures.push(String(e));console.error(e);const screen=win?await run(`({location:localStorage.getItem('journal.location'),text:document.body.innerText.slice(0,3500),active:document.querySelector('.nav-item.selected')?.getAttribute('aria-label')})`):null;if(win)await capture('failure.png');writeFileSync(path.join(output,'failure.json'),JSON.stringify({failures,checks,screen,pins:service.snapshot().state.tasks.filter(t=>t.focusDate).map(t=>({title:t.title,focusDate:t.focusDate,status:t.status})),now:service.snapshot().now},null,2));}
 finally{win?.destroy();service.shutdown();app.exit(failures.length?1:0);}
}
void check();
