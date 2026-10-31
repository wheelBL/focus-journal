import {app,BrowserWindow,ipcMain} from 'electron';
import {mkdirSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import {JournalService} from '../core/service';
import {emptyState,type JournalState} from '../core/types';

const root=process.cwd(),before=process.argv.includes('--before');
const output=path.join(root,'design-audits/2026-10-22-session-exits',before?'before':'after');
mkdirSync(output,{recursive:true});
app.setPath('userData',path.join(root,`qa-data/session-exits-${before?'before':'after'}`));
app.disableHardwareAcceleration();
class Store{path='isolated session exits QA';state=emptyState();load(){return structuredClone(this.state);}save(s:JournalState){this.state=structuredClone(s);}close(){}}
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
 await button('先计时');time+=300000;await button('暂停');time+=60000;await button('恢复专注');time+=120000;await button('结束并补充事项');
 const record=service.snapshot().state.sessions.find(s=>s.taskId===null)!;
 check(record.durationMs===420000&&record.segments.length===2,'结束保留原始时段并扣除暂停');
 await capture('01-assignment');
 if(!before){
  await button('放弃这段投入');await capture('02-discard-confirm');await button('返回补充');
  check(!!await run(`document.querySelector('[aria-label="这段时间做了什么"]')`),'取消放弃返回原表单');
 }
 await button('稍后补充');await click('.unassigned-queue summary');await capture('03-pending-queue');
 if(!before){
  await button('放弃投入');await button('确认放弃投入');await until(`!document.querySelector('dialog')`);
  check(!service.snapshot().state.sessions.some(s=>s.id===record.id)&&service.snapshot().state.deletedSessions.length===1,'放弃从累计与待补充移除');
  await button('已删除投入 (1)');await capture('04-trash');await button('恢复');
  const restored=service.snapshot().state.sessions.find(s=>s.id===record.id)!;
  check(restored.durationMs===record.durationMs&&JSON.stringify(restored.segments)===JSON.stringify(record.segments),'恢复保留原记录及全部时段');
  await button('关闭');await until(`!!document.querySelector('.unassigned-queue')`);
  win.setContentSize(900,640);await settle();await click('.unassigned-queue summary');await button('补充事项');await capture('05-assignment-compact');
  check(!await run('document.documentElement.scrollWidth>innerWidth+1'),'窄窗口无横向溢出');
  await button('稍后补充');win.setContentSize(1280,900);await settle();
 }
 await button('补记时间');await capture('06-manual-entry');await button('取消');
 check(!await run(`!!document.querySelector('dialog')`),'手动补记取消不保存');
 }catch(e){errors.push(String(e));console.error(e);}finally{
  writeFileSync(path.join(output,'results.json'),JSON.stringify({before,checks,errors},null,2));
  console.log(JSON.stringify({output,checks,errors}));win?.destroy();service.shutdown();app.exit(errors.length?1:0);
 }}
void main();
