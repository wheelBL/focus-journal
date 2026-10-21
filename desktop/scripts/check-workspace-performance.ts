import {app,BrowserWindow,ipcMain} from 'electron';
import {mkdirSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {JournalService} from '../core/service';
import {emptyState,type JournalState} from '../core/types';

const root=process.cwd(),output=path.resolve(process.env.JOURNAL_QA_OUTPUT??'qa-evidence/optimization-0.13/round-2-before');mkdirSync(output,{recursive:true});
app.setPath('userData',path.join(root,'qa-data','workspace-performance'));app.disableHardwareAcceleration();
const count=1500,state=emptyState(),at='2026-10-20T06:00:00.000Z';
for(let i=0;i<count;i++)state.tasks.push({id:`perf-${i}`,title:`事项 ${i}`,description:'记录内容',parentId:'inbox',projectId:'inbox',order:i,itemType:'task',status:'open',createdAt:at,startedAt:null,completedAt:null,plannedDate:null,dueAt:null,estimateMinutes:null,outcome:'',nextAction:''});
for(let i=0;i<6000;i++)state.sessions.push({id:`session-${i}`,taskId:`perf-${i%count}`,date:'2026-10-19',start:null,end:null,status:'ended',targetMinutes:25,segments:[],durationMs:60000,manual:true,summary:'',reminded:false,recovered:false,updatedAt:at});
class Store{path='isolated performance fixture';load(){return structuredClone(state);}save(_s:JournalState){}close(){}}
const service=new JournalService(new Store(),{now:()=>Date.parse(at),monotonic:()=>0},true);let win:BrowserWindow;
const run=(code:string)=>win.webContents.executeJavaScript(code);
async function settle(){await run(`new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))`);}
async function until(selector:string){for(let i=0;i<100;i++){if(await run(`!!document.querySelector(${JSON.stringify(selector)})`)){await settle();return;}await new Promise(r=>setTimeout(r,30));}throw new Error(`Missing ${selector}`);}
async function main(){try{
 await app.whenReady();ipcMain.handle('journal:snapshot',()=>service.snapshot());ipcMain.handle('journal:clock',()=>service.clockSnapshot());ipcMain.handle('journal:command',(_e,c)=>service.execute(c));ipcMain.handle('journal:window',()=>{});ipcMain.handle('sync:status',()=>({configured:false,phase:'idle'}));
 win=new BrowserWindow({show:false,width:1060,height:720,frame:false,webPreferences:{preload:path.join(root,'dist-electron/preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true,offscreen:true,backgroundThrottling:false}});
 await win.webContents.session.clearStorageData({storages:['localstorage']});await win.loadFile(path.join(root,'dist/client/index.html'));win.webContents.setZoomFactor(1);await until('.today-page');
 const samples=[];
 for(let n=0;n<3;n++){
  const start=Date.now();await run(`Array.from(document.querySelectorAll('.page-heading button')).find(b=>b.textContent==='新增事项')?.click() ?? window.dispatchEvent(new KeyboardEvent('keydown',{key:'n',ctrlKey:true,bubbles:true}))`);await until('dialog input');const opened=Date.now()-start;
  const typingStart=Date.now();await run(`(()=>{const e=document.querySelector('dialog input');e.focus();Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,'迅速记录');e.dispatchEvent(new Event('input',{bubbles:true}));})()`);await settle();const typing=Date.now()-typingStart;
  const options=await run(`document.querySelector('.capture-options select').options.length`);assert.equal(options,count+2);samples.push({openMs:opened,typeMs:typing});
  if(n===0)writeFileSync(path.join(output,'new-item.png'),(await win.webContents.capturePage()).toPNG());await run(`document.querySelector('dialog [aria-label="关闭"]').click()`);await settle();
 }
 const result={items:count,records:6000,samples,medianOpenMs:samples.map(s=>s.openMs).sort((a,b)=>a-b)[1],medianTypeMs:samples.map(s=>s.typeMs).sort((a,b)=>a-b)[1]};writeFileSync(path.join(output,'modal-performance.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
 }finally{win?.destroy();service.shutdown();app.quit();}}
main().catch(error=>{console.error(error);app.exit(1);});
