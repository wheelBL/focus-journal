import {BrowserWindow,ipcMain,screen} from 'electron';
import {existsSync,readFileSync} from 'node:fs';
import path from 'node:path';
import type {JournalService} from '../core/service';
import {FloatingVisibility,floatingIds,selectFloatingTimer,restKey,floatingReadout,floatingTime,type FloatingTimerAction,type FloatingTimerState} from '../core/floating-timer';
import {timerBounds,parseTimerPosition,type TimerPosition,FLOATING_HEIGHT} from './floating-timer-bounds';
import {atomicWrite} from './sync-storage';

export class FloatingTimerWindow {
 private win:BrowserWindow|null=null;
 private loading:Promise<void>|null=null;
 private disposed=false;
 private visibility=new FloatingVisibility();
 private state:FloatingTimerState={timers:[],rest:null,breakMinutes:5,selectedId:null,expanded:false};
 private position:TimerPosition|null=null;
 private applied:TimerPosition|null=null;
 private savePosition:ReturnType<typeof setTimeout>|null=null;
 private mainChanged=()=>{this.visibility.mainChanged();this.state.expanded=false;this.sync();};
 private displayChanged=()=>{this.place();this.sync();};
 constructor(private service:JournalService,private main:BrowserWindow,private changed:()=>void,private reminderVisible:()=>boolean,
  private icon:string,private file:string,private openJournal:()=>void,private openSession:(id:string)=>void,private log:(event:string,details?:unknown)=>void){
  try{if(existsSync(file))this.position=parseTimerPosition(JSON.parse(readFileSync(file,'utf8')));}catch{/* A stale window position must never block starting the app. */}
  const trusted=(event:Electron.IpcMainInvokeEvent)=>{if(!this.win||event.sender!==this.win.webContents||event.senderFrame!==this.win.webContents.mainFrame)throw new Error('无效的计时签请求。');};
  ipcMain.handle('floating-timer:snapshot',event=>{trusted(event);this.read();return this.state;});
  ipcMain.handle('floating-timer:action',(event,action:FloatingTimerAction,id?:string)=>{trusted(event);this.perform(action,id);});
  main.on('show',this.mainChanged);main.on('hide',this.mainChanged);main.on('minimize',this.mainChanged);main.on('restore',this.mainChanged);
  screen.on('display-removed',this.displayChanged);screen.on('display-metrics-changed',this.displayChanged);
 }
 private read(){const source=this.service.floatingTimerSnapshot();this.state={...this.state,...source,selectedId:selectFloatingTimer(source,this.state.selectedId)};}
 private visible(){return this.visibility.visible(this.state,this.main.isVisible()&&!this.main.isMinimized(),this.reminderVisible());}
 open(){this.visibility.open();this.sync();}
 tooltip(){this.read();if(!this.state.selectedId)return '专注记 · 点击打开工作日志';const view=floatingReadout(this.state),count=this.state.timers.length;return `专注记 · ${view.title.slice(0,36)}\n${view.label} ${view.value}${count>1?` · ${count} 项计时`:''}`;}
 private hide(){this.visibility.hide(this.state);this.state.expanded=false;this.win?.hide();}
 private place(){
  const win=this.win;if(!win||win.isDestroyed())return;
  const area=(this.position?screen.getDisplayNearestPoint(this.position):screen.getDisplayMatching(this.main.getBounds())).workArea;
  const count=floatingIds(this.state).length;
  const height=this.state.expanded?Math.min(520,300+(count>1?42+Math.min(count,4)*42:0)):FLOATING_HEIGHT;
  const bounds=timerBounds(area,this.position,height);this.applied=bounds;
  const current=win.getBounds();if(['x','y','width','height'].some(k=>current[k as keyof typeof current]!==bounds[k as keyof typeof bounds]))win.setBounds(bounds);
 }
 private async ensure(){
  if(this.disposed)return;if(this.loading)return this.loading;if(this.win&&!this.win.isDestroyed())return;
  const win=this.win=new BrowserWindow({width:320,height:64,show:false,title:'专注记 · 屏边计时签',frame:false,transparent:true,backgroundColor:'#00000000',hasShadow:false,resizable:false,minimizable:false,maximizable:false,fullscreenable:false,skipTaskbar:true,alwaysOnTop:true,icon:this.icon,
   webPreferences:{preload:path.join(__dirname,'floating-timer-preload.cjs'),sandbox:true,contextIsolation:true,nodeIntegration:false,backgroundThrottling:false,focusOnNavigation:false}});
  win.webContents.setWindowOpenHandler(()=>({action:'deny'}));win.webContents.on('will-navigate',e=>e.preventDefault());
  win.on('page-title-updated',e=>e.preventDefault());
  win.on('close',e=>{if(!this.disposed){e.preventDefault();this.hide();}});
  win.on('move',()=>{
   if(this.disposed||win.isDestroyed())return;const {x,y}=win.getBounds();if(x===this.applied?.x&&y===this.applied?.y)return;
   this.position={x,y};if(this.savePosition)clearTimeout(this.savePosition);
   this.savePosition=setTimeout(()=>{this.savePosition=null;if(this.disposed||win.isDestroyed())return;this.place();this.position={x:win.getBounds().x,y:win.getBounds().y};this.persistPosition();},150);
  });
  win.webContents.on('render-process-gone',(_e,details)=>{this.log('floating-renderer-exit',details);win.destroy();this.win=null;this.loading=null;});
  win.on('closed',()=>{if(this.win===win)this.win=null;});
  this.loading=win.loadFile(path.join(__dirname,'../dist/client/index.html'),{query:{panel:'floating-timer'}}).catch(e=>{if(!win.isDestroyed())win.destroy();throw e;}).finally(()=>{this.loading=null;});
  return this.loading;
 }
 sync(){
  if(this.disposed)return;this.read();
  if(!this.visible()){this.win?.hide();return;}
  void this.ensure().then(()=>{
   // Window load is asynchronous. Recheck minimize/restore, hide, quit and alerts after it finishes.
   if(this.disposed)return;this.read();const win=this.win;if(!win||win.isDestroyed())return;
   if(!this.visible()){win.hide();return;}
   this.place();win.webContents.send('floating-timer:changed',this.state);
   if(!win.isVisible()){win.showInactive();win.setAlwaysOnTop(true,'floating');}
  }).catch(e=>this.log('floating-window-error',String(e)));
 }
 private perform(action:FloatingTimerAction,id?:string){
  this.read();
  if(action==='hide'){this.hide();return;}
  if(action==='expand'||action==='collapse'){this.state.expanded=action==='expand';this.sync();return;}
  if(action==='open'){this.openJournal();return;}
  if(action==='select'){
   if(typeof id!=='string'||!floatingIds(this.state).includes(id))throw new Error('这个计时已经结束。');
   this.state.selectedId=id;this.sync();return;
  }
  if(['pause','resume','stop','stop-rest'].includes(action)){
   const timer=this.state.timers.find(t=>t.sessionId===id);if(!timer)throw new Error('这个计时已经结束，请查看当前状态。');
   if((action==='pause'&&timer.paused)||(action==='resume'&&!timer.paused))throw new Error('计时状态已变化，请重试。');
   this.service.execute({meta:{source:'user',entry:'floating.timer'},type:`focus.${action==='stop-rest'?'stop':action}`,payload:{sessionId:id,rest:action==='stop-rest'}});
   this.changed();this.sync();return;
  }
  const rest=this.state.rest;
  if(action==='review'){
   if(!rest||id!==restKey(rest)||!rest.sessionId)throw new Error('这段投入记录已变化。');this.openSession(rest.sessionId);return;
  }
  const commands={'rest-start':'break.start','rest-finish':'break.finish','rest-continue':'break.continue','rest-stop':'break.stop'} as const;
  if(!Object.hasOwn(commands,action))throw new Error('计时签操作无效。');
  if(!rest||id!==restKey(rest))throw new Error('休息状态已变化，请查看当前计时。');
  const command=commands[action as keyof typeof commands];
  if(action==='rest-start'&&rest.phase==='running'||action==='rest-finish'&&rest.phase!=='running'||action==='rest-continue'&&rest.phase!=='ready')throw new Error('休息状态已变化，请重试。');
  this.service.execute({type:command});this.changed();this.sync();
 }
 private persistPosition(){try{if(this.position)atomicWrite(this.file,JSON.stringify(this.position));}catch(e){this.log('floating-position-error',String(e));}}
 dispose(){
  if(this.savePosition){clearTimeout(this.savePosition);this.savePosition=null;this.persistPosition();}
  this.disposed=true;this.main.removeListener('show',this.mainChanged);this.main.removeListener('hide',this.mainChanged);this.main.removeListener('minimize',this.mainChanged);this.main.removeListener('restore',this.mainChanged);
  screen.removeListener('display-removed',this.displayChanged);screen.removeListener('display-metrics-changed',this.displayChanged);
  for(const channel of ['floating-timer:snapshot','floating-timer:action'])ipcMain.removeHandler(channel);
  this.win?.destroy();this.win=null;
 }
}
