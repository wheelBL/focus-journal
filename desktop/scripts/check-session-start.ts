import {app,BrowserWindow,ipcMain} from 'electron';
import {mkdirSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import {JournalService} from '../core/service';
import {emptyState,type JournalState} from '../core/types';

const root=process.cwd(),output=path.join(root,'qa-evidence/release-0.22.0/session-start');
mkdirSync(output,{recursive:true});app.setPath('userData',path.join(root,'qa-data/session-start-native'));app.disableHardwareAcceleration();
class Store{path='isolated start time QA';state=emptyState();load(){return structuredClone(this.state);}save(s:JournalState){this.state=structuredClone(s);}close(){}}
let time=Date.parse('2026-10-22T14:00:00+08:00');
const service=new JournalService(new Store(),{now:()=>time,monotonic:()=>time},true);
service.execute({type:'task.save',payload:{title:'核对交付说明',parentId:null}});
let win:BrowserWindow;const checks:string[]=[],errors:string[]=[];
const run=(s:string)=>win.webContents.executeJavaScript(s),delay=(ms:number)=>new Promise(r=>setTimeout(r,ms));
async function settle(){await run('document.fonts.ready');await run('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');}
async function until(s:string){for(let i=0;i<80;i++){if(await run(s)){await settle();return;}await delay(40);}throw Error(`Missing ${s}`);}
async function click(selector:string){
 await until(`!!document.querySelector(${JSON.stringify(selector)})`);
 await run(`document.querySelector(${JSON.stringify(selector)}).scrollIntoView({block:'center'})`);await settle();
 const p=await run(`(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)};})()`);
 for(const type of ['mouseDown','mouseUp'] as const)win.webContents.sendInputEvent({type,button:'left',clickCount:1,...p});await delay(90);await settle();
}
async function button(text:string){await run(`(()=>{const b=[...document.querySelectorAll('button')].find(e=>e.textContent.trim()===${JSON.stringify(text)});if(!b)throw Error('Missing button '+${JSON.stringify(text)});b.dataset.qaTarget='yes';})()`);await click('[data-qa-target=yes]');await run(`document.querySelector('[data-qa-target=yes]')?.removeAttribute('data-qa-target')`);}
async function capture(name:string){writeFileSync(path.join(output,name+'.png'),(await win.webContents.capturePage()).toPNG());}
function check(ok:boolean,label:string){if(!ok)throw Error(label);checks.push(label);}
async function main(){try{
 await app.whenReady();
 ipcMain.handle('journal:snapshot',()=>service.snapshot());ipcMain.handle('journal:clock',()=>service.clockSnapshot());
 ipcMain.handle('journal:command',(_e,c)=>{const result=service.execute(c);win.webContents.send('journal:changed');return result;});
 ipcMain.handle('journal:capture-preferences',()=>({shortcut:'',registered:false}));ipcMain.handle('journal:window',()=>{});
 ipcMain.handle('sync:status',()=>({configured:false,phase:'idle'}));ipcMain.handle('local-api:status',()=>({enabled:false,port:17642,access:'read',running:false,baseUrl:null,hasToken:false,error:null}));
 win=new BrowserWindow({show:false,width:1280,height:900,frame:false,webPreferences:{preload:path.join(root,'dist-electron/preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true,offscreen:true,backgroundThrottling:false}});
 win.webContents.on('console-message',(_e,level,message)=>{if(level>=3)errors.push(message);});
 await win.webContents.session.clearStorageData({storages:['localstorage']});await win.loadFile(path.join(root,'dist/client/index.html'));await until(`!!document.querySelector('.today-page')`);
 await button('先计时');const id=service.snapshot().timer!.sessionId;
 await click('.today-page [aria-label="调整开始时间 未关联事项"]');await button('40 分钟前');await capture('01-edit-start');
 check(await run(`document.querySelector('.session-start-preview').textContent.includes('40 分钟')&&document.querySelector('.session-start-reminder').textContent.includes('25 分钟')`),'选择40分钟前，预览投入40分钟和后续25分钟提醒');
 win.setContentSize(900,640);await settle();await capture('02-edit-start-compact');
 check(await run(`(()=>{const r=document.querySelector('dialog').getBoundingClientRect();return document.documentElement.scrollWidth<=innerWidth+1&&r.left>=0&&r.right<=innerWidth+1&&r.top>=0&&r.bottom<=innerHeight+1;})()`),'900×640弹窗完整且无横向溢出');
 await button('取消');check(service.snapshot().timer!.durationMs===0,'取消不修改记录');
 win.setContentSize(1280,900);await settle();await click('.today-page [aria-label="调整开始时间 未关联事项"]');await button('40 分钟前');await button('保存并继续计时');await until(`!document.querySelector('dialog')`);
 check(service.snapshot().state.sessions.length===1&&service.snapshot().timer!.sessionId===id&&service.snapshot().timer!.durationMs===2400000,'实际指针保存同一记录并补入40分钟');
 await until(`document.querySelector('.unassigned-timer .focus-status').textContent.includes('25:00')`);await capture('03-continued-timer');
 check(service.tick().length===0,'补入时间不会触发过期提醒');
 await button('暂停');await click('.today-page [aria-label="调整开始时间 未关联事项"]');await capture('04-paused-start');
 check(await run(`document.querySelector('.session-start-reminder').textContent.includes('仍保持暂停')`),'暂停时明确恢复后再计算提醒');await button('取消');await button('恢复专注');
 time+=1500000;check(service.tick().length===1&&service.snapshot().timer!.durationMs===3900000,'继续25分钟后累计65分钟，只提醒不停止');win.webContents.send('journal:changed');
 await until(`document.querySelector('.unassigned-timer .focus-status').textContent.includes('目标时间已到')`);await capture('05-target-reached');
 await button('结束并补充事项');check(service.snapshot().state.sessions[0].durationMs===3900000&&service.snapshot().timers.length===0,'结束保存完整65分钟，保留补充事项流程');
 }catch(e){errors.push(String(e));console.error(e);}finally{
  writeFileSync(path.join(output,'results.json'),JSON.stringify({checks,errors},null,2));console.log(JSON.stringify({output,checks,errors}));win?.destroy();service.shutdown();app.exit(errors.length?1:0);
 }}
void main();
