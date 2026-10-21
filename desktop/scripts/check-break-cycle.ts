import {app,BrowserWindow,ipcMain} from 'electron';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import {JournalService} from '../core/service';
import {ReminderWindow} from '../electron/reminder-window';
import {emptyState,type JournalState} from '../core/types';

// Fake elapsed time, real Electron renderer/IPC/pointer actions, no production profile or tray.
const root=process.cwd(),version=JSON.parse(readFileSync('package.json','utf8')).version;
const output=path.join(root,`qa-evidence/release-${version}/break-cycle`);mkdirSync(output,{recursive:true});
app.setPath('userData',path.join(root,`qa-data/break-renderer-${version}`));app.disableHardwareAcceleration();
class Store{path='isolated break QA';state=emptyState();load(){return structuredClone(this.state);}save(s:JournalState){this.state=structuredClone(s);}close(){}}
let time=Date.parse('2026-10-20T10:00:00+08:00'),mono=0;
const service=new JournalService(new Store(),{now:()=>time,monotonic:()=>mono},true);
service.seedTreeDemo();service.execute({type:'reminder.settings',payload:{settings:{sound:false,volume:60,repeatSeconds:30}}});
let main:BrowserWindow,reminders:ReminderWindow;
const failures:string[]=[],logs:any[]=[],metrics:any[]=[];
const delay=(ms:number)=>new Promise(r=>setTimeout(r,ms));
const run=(code:string,win=main)=>win.webContents.executeJavaScript(code);
async function until(check:()=>boolean|Promise<boolean>,message:string){for(let i=0;i<100;i++){if(await check())return;await delay(40);}throw Error(message);}
async function ready(selector:string,win=main){await until(()=>run(`!!document.querySelector(${JSON.stringify(selector)})`,win),`Missing ${selector}`);await run('document.fonts.ready',win);await delay(60);}
async function pointer(selector:string,win=main){
 await ready(selector,win);const p=await run(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});e.scrollIntoView({block:'nearest'});const r=e.getBoundingClientRect();return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)};})()`,win);
 const z=win.webContents.getZoomFactor();p.x=Math.round(p.x*z);p.y=Math.round(p.y*z);
 win.webContents.sendInputEvent({type:'mouseMove',...p});await delay(50);
 win.webContents.sendInputEvent({type:'mouseDown',button:'left',clickCount:1,...p});win.webContents.sendInputEvent({type:'mouseUp',button:'left',clickCount:1,...p});await delay(100);
}
async function textButton(label:string,win=main){
 await run(`(()=>{const b=Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim()===${JSON.stringify(label)});if(!b)throw Error('Missing button');b.dataset.qaClick='yes';})()`,win);
 await pointer('[data-qa-click="yes"]',win);await run(`document.querySelector('[data-qa-click="yes"]')?.removeAttribute('data-qa-click')`,win);
}
async function capture(file:string,win=main){for(let i=0;i<3;i++){try{writeFileSync(path.join(output,file),(await win.webContents.capturePage()).toPNG());return;}catch(e){if(i===2)throw e;await delay(200);}}}
const changed=()=>{main?.webContents.send('journal:changed');reminders?.sync();};
async function advance(ms:number){time+=ms;mono+=ms;service.tick();changed();await delay(100);}
async function matrix(phase:string){
 for(const page of ['今日','事项','日历','回顾','设置']){
  await run(`document.querySelector('.nav-item[aria-label="${page}"]').click()`);await delay(100);
  for(const [w,h,z] of [[1487,1058,1],[900,640,1.25],[1060,720,1.5]]){
   main.setContentSize(w,h);main.webContents.setZoomFactor(z);await delay(100);
   const m=await run(`(()=>{const b=document.querySelector('.break-bar'),r=b.getBoundingClientRect(),s=document.querySelector('.shell').getBoundingClientRect(),visible=e=>{const a=e.getBoundingClientRect();return a.left>=0&&a.right<=innerWidth+1&&a.top>=0&&a.bottom<=innerHeight+1;};return {width:innerWidth,height:innerHeight,overflow:document.documentElement.scrollWidth>innerWidth+1,barVisible:visible(b),shellBelowBar:s.top>=r.bottom-1,buttonsVisible:Array.from(b.querySelectorAll('button')).every(visible),barHeight:r.height,text:b.textContent};})()`);
   metrics.push({page,phase,w,h,z,...m});if(m.overflow||!m.barVisible||!m.shellBelowBar||!m.buttonsVisible)failures.push(`${phase}/${page}/${w}/${z} clipped`);
   if(page==='事项'||page==='今日')await capture(`${phase}-${page}-${w}-${z}.png`);
  }
 }
 main.setContentSize(1060,720);main.webContents.setZoomFactor(1);await delay(150);
}
async function reminderWindow(){await until(()=>BrowserWindow.getAllWindows().some(w=>w!==main&&w.isVisible()),'Reminder did not appear');const card=BrowserWindow.getAllWindows().find(w=>w!==main&&w.isVisible())!;await ready('.reminder-item',card);return card;}
async function check(){try{
 await app.whenReady();
 ipcMain.handle('journal:snapshot',()=>service.snapshot());ipcMain.handle('journal:clock',()=>service.clockSnapshot());
 ipcMain.handle('journal:command',(_e,c)=>{const result=service.execute(c);changed();return result;});
 ipcMain.handle('journal:capture-preferences',()=>({shortcut:'',registered:false}));ipcMain.handle('journal:window',()=>{});ipcMain.handle('sync:status',()=>({configured:false,phase:'idle'}));
 main=new BrowserWindow({show:false,width:1060,height:720,frame:false,webPreferences:{preload:path.join(root,'dist-electron/preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true,offscreen:true,backgroundThrottling:false}});
 main.webContents.on('console-message',(_e,level,message)=>{if(level>=3)failures.push(message);});
 reminders=new ReminderWindow(service,changed,path.join(root,'assets/icon.png'),(event,detail)=>logs.push({event,detail}),()=>{},()=>{},()=>{});
 await main.webContents.session.clearStorageData({storages:['localstorage']});await main.loadFile(path.join(root,'dist/client/index.html'));await ready('.today-page');
 const taskId='design',first=service.execute({type:'focus.start',payload:{taskId}}).timer!.sessionId;changed();await advance(25*60000);
 const target=await reminderWindow();if(!target.isAlwaysOnTop()||target.isFocused())failures.push('Target card focus/topmost policy');
 await capture('target-reminder.png',target);await textButton('结束并休息 5 分钟',target);
 await until(()=>service.snapshot().state.settings.rest?.phase==='running','End and rest did not commit');await ready('[aria-label="休息剩余时间"]');
 if(await run(`document.querySelector('[aria-label="休息剩余时间"]').textContent`)!=='05:00')failures.push('Initial countdown was not five minutes');
 await matrix('running');await advance(60000);
 if(await run(`document.querySelector('[aria-label="休息剩余时间"]').textContent`)!=='04:00')failures.push('Countdown did not update');
 await main.webContents.reload();await ready('.break-bar');if(!await run(`document.querySelector('.break-bar').textContent.includes('04:00')`))failures.push('Countdown lost after reload');
 await advance(240000);const welcome=await reminderWindow();await capture('welcome-reminder.png',welcome);
 if(!welcome.isAlwaysOnTop()||welcome.isFocused())failures.push('Welcome card focus/topmost policy');
 if(service.snapshot().timers.length||service.snapshot().state.sessions.find(r=>r.id===first)!.durationMs!==25*60000)failures.push('Rest counted as work or started automatically');
 await matrix('ready');await textButton('继续专注',welcome);
 await until(()=>service.snapshot().timers.length===1,'Continue did not start');if(service.snapshot().timer!.taskId!==taskId||service.snapshot().timer!.durationMs!==0)failures.push('Wrong continuation');
 await until(()=>!welcome.isVisible(),'Welcome did not close');await run(`document.querySelector('.nav-item[aria-label="今日"]').click()`);await ready('.focus-area');await capture('continued-focus.png');
 service.execute({type:'focus.stop',payload:{sessionId:service.snapshot().timer!.sessionId}});changed();await pointer('.quick-timer-start');await ready('.unassigned-timer');await advance(60000);await pointer('.unassigned-timer .stop-for-break');await until(()=>service.snapshot().state.settings.rest?.phase==='running','Unnamed rest did not start');await advance(300000);
 const freeWelcome=await reminderWindow();await textButton('暂不开始',freeWelcome);await until(()=>!freeWelcome.isVisible(),'Dismiss did not hide reminder');
 if(service.snapshot().state.settings.rest?.phase!=='ready'||service.snapshot().timers.length)failures.push('Dismiss lost welcome or auto-started');
 await capture('unnamed-welcome-later.png');
 writeFileSync(path.join(output,'results.json'),JSON.stringify({cases:metrics.length,failures,metrics,logs,firstSession:service.snapshot().state.sessions.find(r=>r.id===first),sessions:service.snapshot().state.sessions.length},null,2));
 console.log(JSON.stringify({cases:metrics.length,failures,output}));
 }catch(e){failures.push(String(e));console.error(e);writeFileSync(path.join(output,'failure.json'),JSON.stringify({failures,logs,metrics},null,2));}
 finally{reminders?.dispose();main?.destroy();service.shutdown();app.exit(failures.length?1:0);}
}
void check();
