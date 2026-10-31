import type {BrowserWindow,BrowserWindowConstructorOptions,MenuItemConstructorOptions} from 'electron';
export function configureCompanionWindow(window:Pick<BrowserWindow,'setVisibleOnAllWorkspaces'>,platform:NodeJS.Platform){
 if(platform==='darwin')window.setVisibleOnAllWorkspaces(true,{visibleOnFullScreen:true});
}
export function mainWindowChrome(platform:NodeJS.Platform):BrowserWindowConstructorOptions{
 return platform==='darwin'?{titleBarStyle:'hidden',trafficLightPosition:{x:14,y:14}}:{titleBarStyle:'hidden',titleBarOverlay:{color:'#2C323B',symbolColor:'#E4E9F1',height:44}};
}
export function applicationMenu(platform:NodeJS.Platform,name:string,edit:(action:'undo'|'redo')=>void=()=>{}):MenuItemConstructorOptions[]|null{
 if(platform!=='darwin')return null;
 return [{label:name,submenu:[{role:'about'},{type:'separator'},{role:'hide'},{role:'hideOthers'},{role:'unhide'},{type:'separator'},{role:'quit'}]},
  {label:'文件',submenu:[{role:'close'}]},
  {label:'编辑',submenu:[{label:'撤销',accelerator:'CommandOrControl+Z',click:()=>edit('undo')},{label:'重做文字编辑',accelerator:'CommandOrControl+Shift+Z',click:()=>edit('redo')},{type:'separator'},{role:'cut'},{role:'copy'},{role:'paste'},{role:'pasteAndMatchStyle'},{role:'selectAll'}]},
  {label:'显示',submenu:[{role:'resetZoom'},{role:'zoomIn'},{role:'zoomOut'},{type:'separator'},{role:'togglefullscreen'}]},
  {role:'windowMenu',label:'窗口'}];
}
