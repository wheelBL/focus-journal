import {app,BrowserWindow,ipcMain} from 'electron';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import {JournalService} from '../core/service';
import {emptyState,type JournalState} from '../core/types';

const root=process.cwd(),version=JSON.parse(readFileSync('package.json','utf8')).version;
const output=path.join(root,`qa-evidence/release-${version}/execution`);mkdirSync(output,{recursive:true});
app.setPath('userData',path.join(root,`qa-data/execution-${version}`));app.disableHardwareAcceleration();
class Store{path='isolated execution QA';state=emptyState();load(){return structuredClone(this.state);}save(s:JournalState){this.state=structuredClone(s);}close(){}}
let time=Date.parse('2026-10-19T22:00:00+08:00');
const service=new JournalService(new Store(),{now:()=>time,monotonic:()=>time},true);
const add=(title:string)=>service.execute({type:'task.save',payload:{title,parentId:null}}).state.tasks.at(-1)!.id;
const task=add('梳理接口与验证方案'),other=add('撰写本周交付记录'),closed=add('已经完成的校验');
service.execute({type:'task.status',payload:{id:closed,status:'done'}});
service.execute({type:'item.focus',payload:{id:task,date:'2026-10-19'}});
service.execute({type:'item.focus',payload:{id:other,date:'2026-10-19'}});
for(const [start,end] of [['20:30','20:31'],['20:40','21:17']])service.execute({type:'calendar.save',payload:{mode:'effort',taskId:task,start:`2026-10-19T${start}`,end:`2026-10-19T${end}`,summary:'核对输入边界，完成验证记录。'}});
const short=service.snapshot().state.sessions[0].id,long=service.snapshot().state.sessions[1].id;
service.execute({type:'item-reminder.set',payload:{id:other,at:'2026-10-19T21:30'}});
service.execute({type:'task.select',payload:{id:other}});
let win:BrowserWindow;const failures:string[]=[],checks:any[]=[];
const run=(s:string)=>win.webContents.executeJavaScript(s),delay=(ms:number)=>new Promise(r=>setTimeout(r,ms));
async function settle(){await run('document.fonts.ready');await run('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');}
async function until(s:string){for(let i=0;i<80;i++){if(await run(s)){await settle();return;}await delay(40);}throw Error(`Missing ${s}`);}
async function pointer(selector:string,button:'left'|'right'='left'){
 await until(`!!document.querySelector(${JSON.stringify(selector)})`);
 await run(`document.querySelector(${JSON.stringify(selector)}).scrollIntoView({block:'center'})`);await settle();
 const p=await run(`(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`),z=win.webContents.getZoomFactor(),point={x:Math.round(p.x*z),y:Math.round(p.y*z)};
 win.webContents.sendInputEvent({type:'mouseMove',...point});win.webContents.sendInputEvent({type:'mouseDown',button,clickCount:1,...point});win.webContents.sendInputEvent({type:'mouseUp',button,clickCount:1,...point});await delay(100);await settle();
}
async function button(text:string){await run(`(()=>{const b=[...document.querySelectorAll('button')].find(e=>e.textContent.trim()===${JSON.stringify(text)});if(!b)throw Error('missing button '+${JSON.stringify(text)});b.dataset.qaClick='yes';})()`);await pointer('[data-qa-click=yes]');await run(`document.querySelector('[data-qa-click=yes]')?.removeAttribute('data-qa-click')`);}
async function capture(name:string){writeFileSync(path.join(output,name),(await win.webContents.capturePage()).toPNG());}
async function main(){try{
 await app.whenReady();ipcMain.handle('journal:snapshot',()=>service.snapshot());ipcMain.handle('journal:clock',()=>service.clockSnapshot());ipcMain.handle('journal:command',(_e,c)=>{const result=service.execute(c);win.webContents.send('journal:changed');return result;});
 ipcMain.handle('journal:capture-preferences',()=>({shortcut:'',registered:false}));ipcMain.handle('journal:window',()=>{});ipcMain.handle('sync:status',()=>({configured:false,phase:'idle'}));ipcMain.handle('local-api:status',()=>({enabled:false,port:17642,access:'read',running:false,baseUrl:null,hasToken:false,error:null}));
 win=new BrowserWindow({show:false,width:1487,height:1058,frame:false,webPreferences:{preload:path.join(root,'dist-electron/preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true,offscreen:true,backgroundThrottling:false}});
 win.webContents.on('console-message',(_e,level,message)=>{if(level>=3)failures.push(message);});await win.webContents.session.clearStorageData({storages:['localstorage']});await win.loadFile(path.join(root,'dist/client/index.html'));await until(`!!document.querySelector('.today-page')`);
 for(const [width,height,zoom] of [[1487,1058,1],[2560,1392,1],[900,640,1.25],[1060,720,1.5]]){
  win.setContentSize(width,height);win.webContents.setZoomFactor(zoom);await settle();await run(`document.querySelector('.main').scrollTop=0`);
  const result=await run(`(()=>{const e=document.querySelector('.today-execution-grid').getBoundingClientRect(),h=document.querySelector('.today-history').getBoundingClientRect();return {overflow:document.documentElement.scrollWidth>innerWidth+1,executionBeforeHistory:e.top<h.top,progressRows:document.querySelectorAll('[data-progress-id="${task}"]').length};})()`);
  checks.push({page:'today',width,height,zoom,...result});if(result.overflow||!result.executionBeforeHistory||result.progressRows!==1)failures.push('Today execution layout');await capture(`today-${width}-${zoom}.png`);
 }
 win.setContentSize(1487,1058);win.webContents.setZoomFactor(1);await pointer('.nav-item[aria-label="事项"]');await until(`!!document.querySelector('[aria-label="显示已完成"]')`);
 if(await run(`document.querySelector('[aria-label="显示已完成"]').checked||!!document.querySelector('[data-outline-id="${closed}"]')`))failures.push('Default completed visibility');
 await pointer('.nav-item[aria-label="今日"]');await pointer(`[aria-label="开始计时 撰写本周交付记录"]`);if(!service.snapshot().timers.some(r=>r.taskId===other))failures.push('Focus pointer start');time+=60000;service.execute({type:'focus.pause',payload:{taskId:other}});win.webContents.send('journal:changed');await pointer(`[aria-label="恢复计时 撰写本周交付记录"]`);if(service.snapshot().timers[0].paused)failures.push('Focus pointer resume');service.execute({type:'focus.stop',payload:{taskId:other}});service.execute({type:'break.stop'});win.webContents.send('journal:changed');
 await pointer('.nav-item[aria-label="日历"]');
 for(const mode of ['day','week']){
 win.setContentSize(1487,1058);win.webContents.setZoomFactor(1);await settle();await button(mode==='day'?'日视图':'周视图');
 if(await run(`document.querySelectorAll('.day-column').length`)!==(mode==='day'?1:7))failures.push('Calendar mode did not switch');
 for(const [width,height,zoom] of [[1487,1058,1],[900,640,1.25],[1060,720,1.5]]){
  win.setContentSize(width,height);win.webContents.setZoomFactor(zoom);await settle();
  for(const scale of [48,72,96]){
   await run(`(()=>{const s=document.querySelector('[aria-label="时间刻度"]');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(s,${JSON.stringify(String(scale))});s.dispatchEvent(new Event('change',{bubbles:true}));})()`);await settle();await run(`document.querySelector('.calendar-scroll').scrollTop=19.8*${scale}`);await settle();
   const geometry=await run(`(()=>{const a=document.querySelector('.calendar-event[data-session-id="${short}"]'),b=document.querySelector('.calendar-event[data-session-id="${long}"]'),x=a.getBoundingClientRect(),y=b.getBoundingClientRect();return {gap:y.top-x.bottom,sameLane:Math.abs(x.left-y.left)<1,shortHeight:x.height,longHeight:y.height,color:a.style.getPropertyValue('--calendar-color')===b.style.getPropertyValue('--calendar-color'),overflow:document.documentElement.scrollWidth>innerWidth+1};})()`);
   checks.push({page:'calendar',mode,width,height,zoom,scale,...geometry});if(geometry.gap<=0||!geometry.sameLane||!geometry.color||geometry.overflow||geometry.shortHeight>2)failures.push('Exact interval geometry');
  }
  await capture(`calendar-${mode}-${width}-${zoom}.png`);
 }
 }
 win.setContentSize(1487,1058);win.webContents.setZoomFactor(1);await settle();
 await pointer('.calendar-compact-list summary');await until(`document.querySelector('.calendar-compact-list').open`);
 await pointer(`.calendar-compact-entry[data-session-id="${short}"]`,'right');await until(`!!document.querySelector('dialog[aria-label="这段投入"]')`);await button('删除投入记录');await button('确认删除投入');await until(`!document.querySelector('dialog')`);
 if(service.snapshot().state.sessions.some(s=>s.id===short))failures.push('Delete pointer did not remove effort');
 await button('已删除投入 (1)');await pointer(`[aria-label="恢复投入 梳理接口与验证方案"]`);if(!service.snapshot().state.sessions.some(s=>s.id===short))failures.push('Restore pointer lost effort');await pointer('dialog [aria-label="关闭"]');
 await win.webContents.reload();await until(`!!document.querySelector('.calendar-page')`);if(!await run(`!!document.querySelector('.calendar-event[data-session-id="${short}"]')`))failures.push('Restored effort missing after reload');
 await pointer('.calendar-compact-list summary');await pointer(`.calendar-compact-entry[data-calendar-kind="reminder"]`,'right');await until(`!!document.querySelector('dialog[aria-label="日历操作"]')`);await button('移除提醒');if(service.snapshot().state.tasks.find(t=>t.id===other)!.reminder!==null)failures.push('Remove reminder pointer');
 const results={cases:checks.length,failures,checks,flows:['default hides completed','focus start/resume','Today evidence grouping','exact interval geometry','compact entry context actions','delete and restore','reload retains evidence','remove reminder preserves item']};writeFileSync(path.join(output,'results.json'),JSON.stringify(results,null,2));console.log(JSON.stringify({cases:checks.length,failures,output}));
 }catch(e){failures.push(String(e));writeFileSync(path.join(output,'failure.json'),JSON.stringify({failures,checks}));console.error(e);}finally{win?.destroy();service.shutdown();app.exit(failures.length?1:0);}
}
void main();
