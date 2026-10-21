import {app,BrowserWindow,globalShortcut,ipcMain} from 'electron';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {JournalService} from '../core/service';
import {emptyState,type JournalState} from '../core/types';
import {CaptureShortcut} from '../electron/capture-shortcut';

// Real renderer/preload/IPC, kept offscreen even when the Windows desktop is locked.
const root=process.cwd(),version=JSON.parse(readFileSync('package.json','utf8')).version;
const output=path.join(root,`qa-evidence/release-${version}/capture`);mkdirSync(output,{recursive:true});
app.setPath('userData',path.join(root,'qa-data',`capture-renderer-${version}`));app.disableHardwareAcceleration();
class Store{path='isolated capture renderer';state=emptyState();load(){return structuredClone(this.state);}save(s:JournalState){this.state=structuredClone(s);}close(){}}
const service=new JournalService(new Store());let win:BrowserWindow,closed=0,shortcut:CaptureShortcut;
const run=(code:string)=>win.webContents.executeJavaScript(code);
const until=async(code:string)=>{for(let i=0;i<100;i++){if(await run(code))return;await new Promise(r=>setTimeout(r,30));}throw new Error(`Capture check failed: ${code}`);};
const key=(keyCode:string)=>{win.webContents.sendInputEvent({type:'keyDown',keyCode});win.webContents.sendInputEvent({type:'keyUp',keyCode});};
async function main(){try{
 await app.whenReady();
 shortcut=new CaptureShortcut(globalShortcut,()=>{},()=>{});shortcut.configure('Ctrl+Alt+F12');assert.equal(globalShortcut.isRegistered('Ctrl+Alt+F12'),true);
 win=new BrowserWindow({show:false,frame:false,width:660,height:440,webPreferences:{offscreen:true,backgroundThrottling:false,preload:path.join(root,'dist-electron/capture-preload.cjs'),sandbox:true,nodeIntegration:false,contextIsolation:true}});
 const errors:string[]=[];win.webContents.on('console-message',(_e,level,message)=>{if(level>=3)errors.push(message);});
 const trusted=(event:Electron.IpcMainInvokeEvent)=>assert.ok(event.sender===win.webContents&&event.senderFrame===win.webContents.mainFrame);
 ipcMain.handle('capture:snapshot',event=>{trusted(event);return service.snapshot();});
 ipcMain.handle('capture:save',(event,c)=>{trusted(event);assert.equal(c.type,'capture.create');assert.ok(!c.payload.start);return service.execute(c);});
 ipcMain.handle('capture:close',event=>{trusted(event);closed++;});
 await win.webContents.session.clearStorageData({storages:['localstorage']});
 await win.loadFile(path.join(root,'dist/client/index.html'),{query:{panel:'capture'}});
 await until(`document.activeElement?.getAttribute('aria-label')==='快速添加事项名称'`);
 await win.webContents.insertText('- 保留的草稿 %资料');key('Escape');await until(`localStorage.getItem('journal.capture.draft')==='- 保留的草稿 %资料'`);assert.equal(service.snapshot().state.tasks.length,0);assert.equal(closed,1);
 await win.webContents.reload();await until(`document.querySelector('textarea')?.value==='- 保留的草稿 %资料'`);key('Enter');await until(`document.querySelector('textarea')?.value===''`);
 assert.equal(service.snapshot().state.tasks[0].itemType,'note');assert.equal(service.snapshot().state.tasks[0].title,'保留的草稿');assert.equal(closed,2);
 await win.webContents.insertText('找不到归属 #不存在');key('Enter');await until(`Array.from(document.querySelectorAll('[role="alert"]')).some(e=>e.textContent.includes('归属'))`);assert.equal(service.snapshot().state.tasks.length,1);assert.equal(await run(`document.querySelector('textarea').value`),'找不到归属 #不存在');
 await run(`(()=>{const e=document.querySelector('textarea');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(e,'o 明天14:00-15:00 讨论 明天13:50提醒 %工作');e.dispatchEvent(new Event('input',{bubbles:true}));e.focus();})()`);
 await until(`document.querySelector('.capture-clean-title')?.textContent==='保存名称：讨论'`);
 writeFileSync(path.join(output,'preview.png'),(await win.webContents.capturePage()).toPNG());
 for(const [width,height,zoom] of [[660,440,1],[480,300,1.25],[660,440,1.5]]){
  win.setContentSize(width,height);win.webContents.setZoomFactor(zoom);await new Promise(r=>setTimeout(r,120));
  assert.ok(await run(`document.documentElement.scrollWidth<=innerWidth+1`),'Capture window overflows');
  await run(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='修改预览')?.click()`);
  await run(`new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))`);
  assert.ok(await run(`document.querySelector('.capture-panel main').scrollHeight>=document.querySelector('.capture-panel main').clientHeight`));
  writeFileSync(path.join(output,`${width}x${height}-${zoom}.png`),(await win.webContents.capturePage()).toPNG());
 }
 await run(`document.querySelector('textarea').focus()`);key('Enter');await until(`document.querySelector('textarea').value===''`);
 const state=service.snapshot().state;assert.equal(state.tasks[1].itemType,'event');assert.ok(state.tasks[1].reminder);assert.equal(state.sessions.length,0);assert.equal(closed,3);assert.deepEqual(errors,[]);
 shortcut.dispose();assert.equal(globalShortcut.isRegistered('Ctrl+Alt+F12'),false);
 writeFileSync(path.join(output,'result.json'),JSON.stringify({registeredAndDisposed:true,actualSystemKeyPress:false,draftRetainedAcrossReload:true,errorRetained:true,noteAndEventSaved:true,effortFabricated:false,viewportCases:3,errors},null,2));console.log('Capture renderer, preload, draft, validation, events and shortcut registration passed.');
 }finally{shortcut?.dispose();win?.destroy();service.shutdown();app.quit();}}
main().catch(error=>{console.error(error);process.exitCode=1;app.exit(1);});
