import {app,BrowserWindow,ipcMain} from 'electron';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import {JournalService} from '../core/service';
import {emptyState,type JournalState} from '../core/types';
import {emptyFilter} from '../core/filters';
import {condition,group,relative,withRules} from '../core/filter-rules';

const root=process.cwd(),version=JSON.parse(readFileSync('package.json','utf8')).version;
const output=path.join(root,`qa-evidence/release-${version}/filter-calendar`);mkdirSync(output,{recursive:true});
app.setPath('userData',path.join(root,`qa-data/filter-calendar-${version}`));app.disableHardwareAcceleration();
class Store{path='isolated filter and calendar QA';state=emptyState();load(){return structuredClone(this.state);}save(s:JournalState){this.state=structuredClone(s);}close(){}}
let time=Date.parse('2026-10-20T10:00:00+08:00');
const service=new JournalService(new Store(),{now:()=>time,monotonic:()=>time},true);
const add=(title:string,parentId:string|null=null,dueAt:string|null=null)=>service.execute({type:'task.save',payload:{title,parentId,dueAt}}).state.tasks.at(-1)!.id;
const parent=add('仅含已闭环事项的父项'),closed=add('本周已闭环',parent,'2026-10-23'),pendingParent=add('本周推进的项目'),pending=add('待办子事项',pendingParent,'2026-10-24'),other=add('独立的本周事项',null,'2026-10-25');
service.execute({type:'task.status',payload:{id:closed,status:'done'}});
service.execute({type:'view.save',payload:{name:'本周需完成',filter:withRules(emptyFilter(),group([condition('dueAt','before',relative('next-week'))]))}});
const a=add('阅读与整理'),b=add('撰写方案'),c=add('评审改动');
service.execute({type:'focus.start',payload:{taskId:a}});time+=25*60000;service.execute({type:'focus.stop',payload:{taskId:a}});
service.execute({type:'break.stop'});
for(const [taskId,start,end] of [[a,'09:00','09:45'],[b,'09:00','10:00'],[c,'10:30','11:00']]){time=Date.parse('2026-10-20T12:00:00+08:00');service.execute({type:'calendar.save',payload:{mode:'effort',taskId,start:`2026-10-20T${start}`,end:`2026-10-20T${end}`}});}
service.execute({type:'item-reminder.set',payload:{id:a,at:'2026-10-20T11:30'}});
service.execute({type:'calendar.save',payload:{mode:'event',title:'团队交流',start:'2026-10-20T12:00',end:'2026-10-20T12:45'}});
const event=service.snapshot().state.tasks.at(-1)!.id;service.execute({type:'item-reminder.set',payload:{id:event,at:'2026-10-20T11:45'}});
let win:BrowserWindow;const failures:string[]=[],checks:any[]=[];
const delay=(ms:number)=>new Promise(r=>setTimeout(r,ms)),run=(s:string)=>win.webContents.executeJavaScript(s);
async function until(s:string,message=s){for(let i=0;i<80;i++){if(await run(s))return;await delay(40);}throw Error(message);}
const changed=()=>win.webContents.send('journal:changed');
async function click(selector:string){
 await until(`!!document.querySelector(${JSON.stringify(selector)})`);
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
 await click('.nav-item[aria-label="事项"]');await until(`!!document.querySelector('[aria-label="常用视图"]')`);
 await run(`(()=>{const s=document.querySelector('[aria-label="常用视图"]');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(s,${JSON.stringify(service.snapshot().state.views[0].id)});s.dispatchEvent(new Event('change',{bubbles:true}));})()`);
 await until(`!!document.querySelector('.closed-filter-hint')`);await capture('date-view-includes-closed.png');
 await button('只看未完成');await until(`!document.querySelector('[data-outline-id="${parent}"]')`);await button('更新当前视图');
 win.webContents.reload();await until(`!!document.querySelector('[aria-label="显示已完成"]')`);
 if(await run(`document.querySelector('[aria-label="显示已完成"]').checked||!!document.querySelector('[data-outline-id="${parent}"]')`))failures.push('Saved open-only view did not survive reload');
 for(const [width,height,zoom] of [[1487,1058,1],[900,640,1.25],[1060,720,1.5]]){
  win.setContentSize(width,height);win.webContents.setZoomFactor(zoom);await delay(120);
  const result=await run(`({overflow:document.documentElement.scrollWidth>innerWidth+1,parentContext:document.querySelector('[data-outline-id="${pendingParent}"]').textContent.includes('父级路径'),matchVisible:!!document.querySelector('[data-outline-id="${pending}"]')})`);
  checks.push({page:'items',width,height,zoom,...result});if(result.overflow||!result.parentContext||!result.matchVisible)failures.push('Filtered tree layout');
  await capture(`open-only-${width}-${zoom}.png`);
 }
 win.setContentSize(1487,1058);win.webContents.setZoomFactor(1);await delay(100);await click('[aria-label="完成待办子事项"]');await until(`!document.querySelector('[data-outline-id="${pendingParent}"]')`);
 if(!await run(`!!document.querySelector('[data-outline-id="${other}"]')`))failures.push('Unrelated match disappeared');
 await click('.nav-item[aria-label="日历"]');await until(`!!document.querySelector('.calendar-event')`);
 const readColors=()=>run(`(()=>{const result={};for(const e of document.querySelectorAll('.calendar-event[data-item-id]')){const c=getComputedStyle(e),id=e.dataset.itemId;(result[id]??=[]).push({background:c.backgroundColor,color:c.color,border:c.borderLeftColor,style:c.borderLeftStyle,manual:e.classList.contains('manual'),reminder:e.classList.contains('calendar-reminder')});}return result;})()`);
 const colors=await readColors();for(const id of [a,event]){if(new Set(colors[id].map((c:any)=>c.border)).size!==1||new Set(colors[id].map((c:any)=>c.background)).size!==1)failures.push('Same identity rendered with different source colors');}
 if(new Set([a,b,c,event].map(id=>colors[id][0].border)).size!==4)failures.push('Unnecessary identity color collision');
 if(!colors[a].some((c:any)=>c.reminder&&c.style==='dashed'))failures.push('Reminder lost type distinction');
 for(const [width,height,zoom] of [[1487,1058,1],[900,640,1.25],[1060,720,1.5]]){
  win.setContentSize(width,height);win.webContents.setZoomFactor(zoom);await delay(120);await run(`document.querySelector('.calendar-scroll').scrollTop=8*48`);
  const overflow=await run('document.documentElement.scrollWidth>innerWidth+1');checks.push({page:'calendar',width,height,zoom,overflow});if(overflow)failures.push('Calendar layout');
  await capture(`calendar-colors-${width}-${zoom}.png`);
 }
 writeFileSync(path.join(output,'results.json'),JSON.stringify({cases:checks.length,failures,checks,colors,flows:['date-only explanation','open-only pointer action','save and reload','completion removes last context branch','timed/manual/reminder color identity','distinct items','responsive tree and calendar']},null,2));
 console.log(JSON.stringify({cases:checks.length,failures,output}));
 }catch(e){failures.push(String(e));console.error(e);writeFileSync(path.join(output,'failure.json'),JSON.stringify({failures,checks}));}
 finally{win?.destroy();service.shutdown();app.exit(failures.length?1:0);}
}
void check();
