import {BrowserWindow,globalShortcut,ipcMain} from 'electron';
import {existsSync,readFileSync} from 'node:fs';
import path from 'node:path';
import {atomicWrite} from './sync-storage';
import {CaptureShortcut} from './capture-shortcut';
import type {JournalService} from '../core/service';
import type {Command} from '../core/types';
export class CaptureWindow {
 private win:BrowserWindow|null=null;
 private shortcuts:CaptureShortcut;
 constructor(private service:JournalService,private changed:()=>void,private icon:string,file:string,demo:boolean){
  this.shortcuts=new CaptureShortcut(globalShortcut,()=>this.open(),key=>atomicWrite(file,JSON.stringify({shortcut:key})));
  let shortcut=demo?'':'Ctrl+Alt+Space';try{if(existsSync(file))shortcut=JSON.parse(readFileSync(file,'utf8')).shortcut;}catch{}
  try{this.shortcuts.configure(shortcut,false);}catch{this.shortcuts.configure('',false);}
  const trusted=(event:Electron.IpcMainInvokeEvent)=>{if(!this.win||event.sender!==this.win.webContents||event.senderFrame!==this.win.webContents.mainFrame)throw new Error('无效的快速记录请求。');};
  ipcMain.handle('capture:snapshot',event=>{trusted(event);return this.service.snapshot();});
  ipcMain.handle('capture:save',(event,command:Command)=>{trusted(event);if(command?.type!=='capture.create'||command.payload?.start)throw new Error('快速窗口只保存记录。');const result=this.service.execute(command);this.changed();return result;});
  ipcMain.handle('capture:close',event=>{trusted(event);this.win?.hide();});
 }
 preferences(){return this.shortcuts.preferences();}
 configure(value:unknown){return this.shortcuts.configure(value);}
 open(){
  if(this.win&&!this.win.isDestroyed()){this.win.show();this.win.focus();this.win.webContents.send('capture:opened');return;}
  this.win=new BrowserWindow({title:'专注记 · 快速记录',width:660,height:440,minWidth:480,minHeight:300,show:false,frame:false,alwaysOnTop:true,skipTaskbar:true,icon:this.icon,backgroundColor:'#FFFFFF',webPreferences:{preload:path.join(__dirname,'capture-preload.cjs'),sandbox:true,contextIsolation:true,nodeIntegration:false}});
  const win=this.win;win.webContents.setWindowOpenHandler(()=>({action:'deny'}));win.webContents.on('will-navigate',e=>e.preventDefault());
  win.on('close',e=>{e.preventDefault();win.hide();});win.once('ready-to-show',()=>{win.show();win.focus();});
  void win.loadFile(path.join(__dirname,'../dist/client/index.html'),{query:{panel:'capture'}});
 }
 dispose(){this.shortcuts.dispose();if(this.win&&!this.win.isDestroyed())this.win.destroy();this.win=null;for(const channel of ['capture:snapshot','capture:save','capture:close'])ipcMain.removeHandler(channel);}
}
