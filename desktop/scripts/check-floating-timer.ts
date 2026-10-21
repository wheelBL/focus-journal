import {app,BrowserWindow,ipcMain,screen} from 'electron';
import {mkdirSync,readFileSync,writeFileSync,existsSync} from 'node:fs';
import path from 'node:path';
import {JournalService} from '../core/service';
import {emptyState,type JournalState} from '../core/types';
import {FloatingTimerWindow} from '../electron/floating-timer-window';
import {ReminderWindow} from '../electron/reminder-window';

// Isolated native Electron, real IPC/input/renderer, simulated time and no production profile/tray.
const root=process.cwd(),version=JSON.parse(readFileSync('package.json','utf8')).version;
const output=path.join(root,`qa-evidence/release-${version}/floating-timer`);mkdirSync(output,{recursive:true});
const dataDir=path.join(root,`qa-data/floating-${version}`);mkdirSync(dataDir,{recursive:true});app.setPath('userData',dataDir);app.disableHardwareAcceleration();
class Store{path='isolated floating QA';state=emptyState();load(){return structuredClone(this.state);}save(s:JournalState){this.state=structuredClone(s);}close(){}}
let now=Date.parse('2026-10-21T10:00:00+08:00');const service=new JournalService(new Store(),{now:()=>now,monotonic:()=>now},true);
service.execute({type:'reminder.settings',payload:{settings:{sound:false,volume:60,repeatSeconds:30}}});
const add=(title:string)=>service.execute({type:'task.save',payload:{title,parentId:null}}).state.tasks.at(-1)!.id;
const task=add('梳理接口与验证方案'),other=add('第二件事项');
let main:BrowserWindow,manager:FloatingTimerWindow,reminders:ReminderWindow;
const failures:string[]=[],checks:string[]=[],logs:unknown[]=[],geometry:unknown[]=[];
const delay=(ms:number)=>new Promise(r=>setTimeout(r,ms));
const run=(code:string,win:BrowserWindow)=>win.webContents.executeJavaScript(code);
async function until(check:()=>boolean|Promise<boolean>,message:string){for(let i=0;i<100;i++){if(await check())return;await delay(40);}throw Error(message);}
function check(ok:boolean,name:string){if(!ok)throw Error(name);checks.push(name);}
async function ready(win:BrowserWindow,selector:string){await until(()=>run(`!!document.querySelector(${JSON.stringify(selector)})`,win),selector);await run('document.fonts.ready',win);await delay(60);}
async function pointer(win:BrowserWindow,selector:string){await ready(win,selector);const p=await run(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});e.scrollIntoView({block:'nearest'});const r=e.getBoundingClientRect();return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)};})()`,win);win.webContents.sendInputEvent({type:'mouseMove',...p});win.webContents.sendInputEvent({type:'mouseDown',button:'left',clickCount:1,...p});win.webContents.sendInputEvent({type:'mouseUp',button:'left',clickCount:1,...p});await delay(100);}
async function button(win:BrowserWindow,label:string){await run(`(()=>{const b=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(label)});if(!b)throw Error('Missing '+${JSON.stringify(label)});b.dataset.qaClick='yes';})()`,win);await pointer(win,'[data-qa-click=yes]');await run(`document.querySelector('[data-qa-click=yes]')?.removeAttribute('data-qa-click')`,win);}
async function capture(win:BrowserWindow,name:string){writeFileSync(path.join(output,name+'.png'),(await win.webContents.capturePage()).toPNG());const g=await run(`({width:innerWidth,height:innerHeight,dpr:devicePixelRatio,overflow:document.documentElement.scrollWidth>innerWidth+1,buttons:[...document.querySelectorAll('button')].filter(e=>e.getBoundingClientRect().width).map(e=>({text:e.textContent,rect:JSON.parse(JSON.stringify(e.getBoundingClientRect()))}))})`,win);geometry.push({name,...g});check(!g.overflow,`${name}: no horizontal overflow`);}
const floating=()=>BrowserWindow.getAllWindows().find(w=>w.getTitle()==='专注记 · 屏边计时签');
const reminder=()=>BrowserWindow.getAllWindows().find(w=>w.getTitle()==='专注记 · 到时提醒');
function changed(){main?.webContents.send('journal:changed');reminders?.sync();manager?.sync();}
async function advance(ms:number){now+=ms;service.tick();changed();await delay(150);}
async function execute(type:string,payload?:Record<string,unknown>){const result=service.execute({type,payload});changed();await delay(100);return result;}
async function mainCheck(){try{
 await app.whenReady();ipcMain.handle('journal:snapshot',()=>service.snapshot());ipcMain.handle('journal:clock',()=>service.clockSnapshot());ipcMain.handle('journal:command',(_e,c)=>{const result=service.execute(c);changed();return result;});
 ipcMain.handle('journal:capture-preferences',()=>({shortcut:'',registered:false}));ipcMain.handle('sync:status',()=>({configured:false,phase:'idle'}));ipcMain.handle('journal:window',(_e,action)=>{if(action==='minimize')main.minimize();});
 main=new BrowserWindow({show:false,width:1060,height:720,title:'专注记 · 隔离验证',webPreferences:{preload:path.join(root,'dist-electron/preload.cjs'),sandbox:true,contextIsolation:true,nodeIntegration:false,backgroundThrottling:false}});
 const show=()=>{main.restore();main.show();};
 reminders=new ReminderWindow(service,changed,path.join(root,'assets/icon.png'),(event,detail)=>logs.push({event,detail}),()=>show(),()=>show(),reveal=>{if(reveal||main.isVisible()&&!main.isMinimized())show();},()=>manager?.sync());
 manager=new FloatingTimerWindow(service,main,changed,()=>reminders.isPresenting(),path.join(root,'assets/icon.png'),path.join(dataDir,'position.json'),show,()=>show(),(event,detail)=>logs.push({event,detail}));
 app.on('web-contents-created',(_e,web)=>web.on('console-message',(_e,level,message)=>{if(level>=3)failures.push(message);}));
 await main.webContents.session.clearStorageData({storages:['localstorage']});await main.loadFile(path.join(root,'dist/client/index.html'));main.show();await ready(main,'.today-page');
 main.restore();main.show();await delay(200);
 const first=(await execute('focus.start',{taskId:task})).timer!.sessionId;await advance(17*60000+42000);logs.push({beforeMinimize:BrowserWindow.getAllWindows().map(w=>({title:w.getTitle(),visible:w.isVisible(),minimized:w.isMinimized(),url:w.webContents.getURL()}))});check(!floating()?.isVisible(),'Main visible keeps strip hidden');
 main.minimize();await until(()=>!!floating()?.isVisible(),'Strip did not appear on minimize');let strip=floating()!;await ready(strip,'.floating-toggle');check(!strip.isFocused()&&strip.isAlwaysOnTop(),'Minimize shows inactive topmost strip');await capture(strip,'compact');
 check((await run(`document.querySelector('time').textContent`,strip))==='07:18','Remaining time matches shared clock');
 await pointer(strip,'.floating-toggle');await ready(strip,'.floating-controls');await capture(strip,'expanded');await button(strip,'暂停');await advance(12000);check(service.snapshot().timer!.paused,'Pause uses shared timer');check(service.snapshot().timer!.durationMs===1062000,'Pause excludes elapsed idle time');await capture(strip,'paused');
 await button(strip,'恢复');await execute('focus.start',{taskId:other});check((await run('window.floatingTimer.snapshot()',strip)).selectedId===first,'Another timer does not change displayed identity');await capture(strip,'multiple');
 check(await run(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent.includes('结束并休息')).disabled`,strip),'Rest disabled while another timer runs');
 await pointer(strip,'.floating-switcher button:nth-child(2)');check((await run('window.floatingTimer.snapshot()',strip)).selectedId!==first,'Explicit timer selection works');await button(strip,'暂停');check(service.snapshot().timers.find(t=>t.sessionId===first)!.paused===false,'Selected pause preserves other timer');
 await pointer(strip,'.floating-switcher button:first-child');await advance(8*60000);await until(()=>!!reminder()?.isVisible(),'Target reminder missing');check(!strip.isVisible(),'Target reminder replaces calm strip');check(!reminder()!.isFocused(),'Target reminder does not steal focus');
 await ready(reminder()!,'.reminder-item');await button(reminder()!,'继续，本次不再提醒');await until(()=>strip.isVisible(),'Strip did not return after reminder');await capture(strip,'overtime');check((await run(`document.querySelector('.floating-readout>span').textContent`,strip))==='超时','Overtime label is explicit');
 await button(strip,'结束并休息 5 分钟');check(main.isMinimized(),'Rest starts without opening main window');await capture(strip,'rest');check(service.snapshot().state.settings.rest?.phase==='running','Rest is running');
 await advance(300000);await until(()=>!!reminder()?.isVisible(),'Welcome card missing');check(!strip.isVisible(),'Welcome reminder replaces strip');await button(reminder()!,'暂不开始');await until(()=>strip.isVisible(),'Welcome strip missing');await capture(strip,'welcome');check(service.snapshot().timers.every(t=>t.paused),'Rest never auto starts focus');
 await button(strip,'继续专注');check(service.snapshot().timers.some(t=>t.taskId===task&&!t.paused),'Explicit continue resumes original task');
 await button(strip,'隐藏计时签');await advance(1000);check(!strip.isVisible(),'Hidden strip stays hidden after clock tick');main.restore();main.minimize();await delay(120);check(!strip.isVisible(),'Deliberate hide survives main restore/minimize');manager.open();await until(()=>strip.isVisible(),'Manual show failed');check((await run('window.floatingTimer.snapshot()',strip)).expanded===false,'Manual show restores collapsed form');
 main.restore();await delay(150);check(!strip.isVisible(),'Main restore hides strip');main.hide();await until(()=>strip.isVisible(),'Tray hide did not show strip');
 const area=screen.getPrimaryDisplay().workArea;strip.setPosition(area.x+100,area.y+100);await until(()=>existsSync(path.join(dataDir,'position.json')),'Position file missing');await delay(180);check(existsSync(path.join(dataDir,'position.json')),'Position is persisted');
 manager.dispose();manager=new FloatingTimerWindow(service,main,changed,()=>reminders.isPresenting(),path.join(root,'assets/icon.png'),path.join(dataDir,'position.json'),show,()=>show(),()=>{});manager.sync();await until(()=>!!floating()?.isVisible(),'Recreated strip missing');strip=floating()!;check(Math.abs(strip.getBounds().x-(area.x+100))<=1,'Position restored across window manager restart');
 await execute('task.save',{id:task,title:'很长的事项名称用于检查计时签标题省略而不挤压剩余时间与展开按钮'.repeat(3)});await ready(strip,'.floating-toggle');await capture(strip,'long-title');
 await pointer(strip,'.floating-toggle');strip.webContents.sendInputEvent({type:'keyDown',keyCode:'Escape'});strip.webContents.sendInputEvent({type:'keyUp',keyCode:'Escape'});await delay(120);check(!(await run('window.floatingTimer.snapshot()',strip)).expanded,'Escape collapses controls');
 check(service.snapshot().state.sessions.find(s=>s.id===first)!.durationMs===1542000,'Original effort excludes pause and rest');
 }catch(e){failures.push(String(e));console.error(e);}
 finally{manager?.dispose();reminders?.dispose();main?.destroy();service.shutdown();const remaining=BrowserWindow.getAllWindows().length;if(remaining)failures.push(`${remaining} windows left`);writeFileSync(path.join(output,'results.json'),JSON.stringify({checks,failures,geometry,logs,remainingWindows:remaining,productionDataTouched:false},null,2));console.log(JSON.stringify({checks:checks.length,failures,output,remainingWindows:remaining}));app.exit(failures.length?1:0);}
}
void mainCheck();
