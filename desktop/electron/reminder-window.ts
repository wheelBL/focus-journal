import {BrowserWindow,ipcMain,screen} from 'electron';
import path from 'node:path';
import {performance} from 'node:perf_hooks';
import {JournalService} from '../core/service';
import {pendingReminders,reminderSettings,validateReminderSettings,ReminderCadence,reminderBounds} from '../core/reminders';
import type {ReminderAction,ReminderSettings,ReminderWindowState} from '../core/types';

export class ReminderWindow{
 private window:BrowserWindow|null=null;
 private loading:Promise<void>|null=null;
 private disposed=false;
 private cadence=new ReminderCadence();
 private mode:'sound'|'card'|null=null;
 private previewSettings:ReminderSettings|null=null;
 private previewUntil=0;
 private cueId=0;
 private state:ReminderWindowState={alerts:[],settings:{sound:true,volume:60,repeatSeconds:30},preview:false,cue:null};
 private awaiting=new Map<number,{resolve:()=>void;reject:(e:Error)=>void;timeout:ReturnType<typeof setTimeout>}>();
 constructor(private service:JournalService,private changed:()=>void,private icon:string,private log:(event:string,details?:unknown)=>void,private openItem:(id:string)=>void=()=>{},private openSession:(id:string)=>void=()=>{},private openJournal:(reveal?:boolean)=>void=()=>{},private presentationChanged:()=>void=()=>{}){
  const trusted=(event:Electron.IpcMainInvokeEvent|Electron.IpcMainEvent)=>{if(!this.window||event.sender!==this.window.webContents||event.senderFrame!==this.window.webContents.mainFrame)throw new Error('无效的提醒窗口请求。');};
  ipcMain.handle('reminder:snapshot',event=>{trusted(event);return this.state;});
  ipcMain.handle('reminder:action',(event,action:ReminderAction,sessionId?:string)=>{
   trusted(event);if(!['stop','stop-rest','continue','restart-break','choose','snooze','dismiss','open','close-preview'].includes(action))throw new Error('提醒操作无效。');
   if(this.mode){this.endPreview();return;}
   if(action==='close-preview')return;
   const alert=this.service.reminderSnapshot().alerts.find(a=>a.sessionId===sessionId);if(!alert)throw new Error('这个提醒已经处理。');
   if(alert.kind==='break'){
    if(!['continue','restart-break','dismiss','choose'].includes(action))throw new Error('休息提醒操作无效。');
    this.service.execute({meta:{source:'user',entry:'reminder.card'},type:action==='continue'?'break.continue':action==='restart-break'?'break.start':'break.acknowledge'});this.changed();
    if(action!=='dismiss')this.openJournal(action==='choose');return;
   }
   if(alert.kind==='task'){
    if(!['snooze','dismiss','open'].includes(action))throw new Error('事项提醒不是运行中的计时器。');
    this.service.execute({type:action==='snooze'?'item-reminder.snooze':'item-reminder.dismiss',payload:{id:alert.taskId}});this.changed();if(action==='open'&&alert.taskId)this.openItem(alert.taskId);return;
   }
   if(!['stop','stop-rest','snooze','dismiss'].includes(action))throw new Error('提醒操作无效。');
   const ending=action==='stop'||action==='stop-rest';
   this.service.execute({type:ending?'focus.stop':`reminder.${action}`,payload:{sessionId,rest:action==='stop-rest'}});this.changed();
   if(action==='stop')this.openSession(alert.sessionId);else if(action==='stop-rest')this.openJournal();
  });
  ipcMain.on('reminder:audio-result',(event,id:unknown,error:unknown)=>{
   trusted(event);if(typeof id!=='number')return;
   const message=typeof error==='string'?error.slice(0,250):undefined;
   this.log(message?'reminder-audio-error':'reminder-audio-playing',{cueId:id,error:message});
   const pending=this.awaiting.get(id);if(pending){clearTimeout(pending.timeout);this.awaiting.delete(id);message?pending.reject(new Error(message)):pending.resolve();}
  });
 }
 private async ensure(){
  if(this.disposed)return;if(this.loading)return this.loading;if(this.window&&!this.window.isDestroyed())return;
  const win=this.window=new BrowserWindow({width:520,height:370,show:false,title:'专注记 · 到时提醒',frame:false,resizable:false,minimizable:false,maximizable:false,skipTaskbar:true,alwaysOnTop:true,backgroundColor:'#FFFFFF',icon:this.icon,webPreferences:{preload:path.join(__dirname,'reminder-preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true,backgroundThrottling:false,autoplayPolicy:'no-user-gesture-required',focusOnNavigation:false}});
  win.webContents.setWindowOpenHandler(()=>({action:'deny'}));win.webContents.on('will-navigate',event=>event.preventDefault());
  win.on('page-title-updated',event=>event.preventDefault());
  win.on('close',event=>{if(this.disposed)return;event.preventDefault();try{if(this.mode)this.endPreview();else{this.service.execute({type:'reminder.snooze-all'});this.changed();}}catch(e){this.log('reminder-close-error',String(e));}});
  win.webContents.on('render-process-gone',(_event,details)=>{this.log('reminder-renderer-exit',details);win.destroy();this.window=null;this.loading=null;this.cadence.clear();});
  win.on('closed',()=>{if(this.window===win)this.window=null;});
  this.loading=win.loadFile(path.join(__dirname,'../dist/client/index.html'),{query:{panel:'reminder'}}).catch(error=>{if(!win.isDestroyed())win.destroy();this.cadence.clear();throw error;}).finally(()=>{this.loading=null;});
  return this.loading;
 }
 sync(){
  if(this.disposed)return;
  const actual=this.service.reminderSnapshot().alerts;
  if(!actual.length&&!this.mode&&!this.window){this.cadence.clear();return;}
  void this.ensure().then(()=>this.render()).catch(e=>this.log('reminder-window-error',String(e)));
 }
 isPresenting(){return this.mode==='card'||this.service.reminderSnapshot().alerts.length>0;}
 private render(){
  const win=this.window;if(this.disposed||!win||win.isDestroyed())return;
  const snapshot=this.service.reminderSnapshot(),actual=snapshot.alerts;
  if(actual.length||this.mode==='sound'&&performance.now()>=this.previewUntil){this.mode=null;this.previewSettings=null;}
  const preview=!!this.mode,settings=preview?this.previewSettings!:snapshot.settings;
  const alerts=this.mode==='card'?[{sessionId:'preview',taskId:'preview',title:'把手头这一段工作收个尾',durationMs:27*60000,targetMinutes:25,breakMinutes:5,canRest:true}]:actual;
  let cue=this.state.cue;
  if(!settings.sound||!settings.volume||!alerts.length&&this.mode!=='sound')cue=null;
  if(!preview&&this.cadence.next(performance.now(),actual,settings))cue={id:++this.cueId,volume:settings.volume};
  this.state={alerts,settings,preview,cue};
  if(!!alerts.length!==win.isVisible())this.presentationChanged();
  if(alerts.length){
   const bounds=reminderBounds(screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea,alerts.length,alerts[0]?.kind);
   if(!win.isVisible()){win.setBounds(bounds);win.showInactive();win.setAlwaysOnTop(true,'pop-up-menu');this.log('reminder-visible',{preview,count:alerts.length,alwaysOnTop:win.isAlwaysOnTop(),focused:win.isFocused()});}
   else {const current=win.getBounds();if(current.height!==bounds.height)win.setBounds({...bounds,x:current.x,y:Math.min(current.y,bounds.y)});}
  }else if(win.isVisible())win.hide();
  win.webContents.send('reminder:changed',this.state);
 }
 async preview(value:unknown,mode:unknown){
  const settings=validateReminderSettings(value);if(mode!=='sound'&&mode!=='card')throw new Error('预览方式无效。');
  if(this.service.reminderSnapshot().alerts.length)throw new Error('请先处理当前到时提醒，再试听或预览。');
  await this.ensure();if(this.disposed)return;
  // Recheck after the asynchronous window load; a real target always takes priority.
  if(this.service.reminderSnapshot().alerts.length)throw new Error('有事项刚刚到时，请先处理提醒。');
  this.mode=mode;this.previewSettings=settings;this.previewUntil=performance.now()+2500;
  const cue=settings.sound&&settings.volume>0?{id:++this.cueId,volume:settings.volume}:null;
  this.state={...this.state,cue};
  const played=cue?new Promise<void>((resolve,reject)=>{
   const timeout=setTimeout(()=>{this.awaiting.delete(cue.id);reject(new Error('未能确认声音播放，请检查输出设备后重试。'));},5000);
   this.awaiting.set(cue.id,{resolve,reject,timeout});
  }):Promise.resolve();
  this.render();await played;
 }
 private endPreview(){this.mode=null;this.previewSettings=null;this.state.cue=null;this.render();}
 dispose(){
  this.disposed=true;this.cadence.clear();for(const p of this.awaiting.values()){clearTimeout(p.timeout);p.reject(new Error('应用已退出。'));}this.awaiting.clear();this.window?.destroy();this.window=null;
 }
}
