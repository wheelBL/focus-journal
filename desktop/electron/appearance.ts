import {app,BrowserWindow,ipcMain,nativeTheme} from 'electron';
import {existsSync,readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {atomicWrite} from './sync-storage';
import {defaultAppearance,parseAppearance,type Appearance} from '../core/appearance';

/** Owns device persistence, native captions and broadcasts to the app's windows. */
export class AppearanceController {
 private value:Appearance={...defaultAppearance};
 private main:BrowserWindow|null=null;
 constructor(private file:string,private entry:string){
  try{if(existsSync(file))this.value=parseAppearance(JSON.parse(readFileSync(file,'utf8')));}catch{/* Fall back without touching journal data. */}
  nativeTheme.themeSource=this.value.theme;
  const trusted=(event:Electron.IpcMainInvokeEvent,write=false)=>{
   const window=BrowserWindow.fromWebContents(event.sender);
   if(!window||event.senderFrame!==event.sender.mainFrame||event.sender.getURL().split('?')[0]!==pathToFileURL(this.entry).href||(write&&window!==this.main))throw new Error('无效的外观请求。');
  };
  ipcMain.handle('appearance:get',event=>{trusted(event);return this.value;});
  ipcMain.handle('appearance:set',(event,input:unknown)=>{
   trusted(event,true);const next=parseAppearance(input);
   try{atomicWrite(this.file,JSON.stringify(next));}catch{throw new Error('外观设置未保存，请检查数据文件夹权限后重试。');}
   this.value=next;nativeTheme.themeSource=next.theme;this.update();return this.value;
  });
  app.on('browser-window-created',this.created);
  nativeTheme.on('updated',this.update);
 }
 private style(window:BrowserWindow){
  if(window.isDestroyed())return;
  // Preserve the floating timer's transparent, rounded outer area.
  if(window.getBackgroundColor()!=='#00000000')window.setBackgroundColor(nativeTheme.shouldUseDarkColors?'#26282D':'#FFFFFF');
  if(window===this.main)window.setTitleBarOverlay({color:nativeTheme.shouldUseDarkColors?'#26282D':'#FFFFFF',symbolColor:nativeTheme.shouldUseDarkColors?'#E2E6ED':'#4C535F',height:44});
 }
 private created=(_event:Electron.Event,window:BrowserWindow)=>{
  this.style(window);window.webContents.on('did-finish-load',()=>{if(!window.isDestroyed()){this.style(window);window.webContents.send('appearance:changed',this.value);}});
 };
 private update=()=>{for(const window of BrowserWindow.getAllWindows()){this.style(window);window.webContents.send('appearance:changed',this.value);}};
 setMain(window:BrowserWindow){this.main=window;this.style(window);}
 dispose(){app.off('browser-window-created',this.created);nativeTheme.off('updated',this.update);ipcMain.removeHandler('appearance:get');ipcMain.removeHandler('appearance:set');}
}
