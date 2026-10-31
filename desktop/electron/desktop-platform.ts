import type {BrowserWindowConstructorOptions,MenuItemConstructorOptions} from 'electron';
export function mainWindowChrome(platform:NodeJS.Platform):BrowserWindowConstructorOptions{
 return platform==='darwin'?{titleBarStyle:'hidden',trafficLightPosition:{x:14,y:14}}:{titleBarStyle:'hidden',titleBarOverlay:{color:'#2C323B',symbolColor:'#E4E9F1',height:44}};
}
export function applicationMenu(platform:NodeJS.Platform,name:string):MenuItemConstructorOptions[]|null{
 if(platform!=='darwin')return null;
 return [{label:name,submenu:[{role:'about'},{type:'separator'},{role:'hide'},{role:'hideOthers'},{role:'unhide'},{type:'separator'},{role:'quit'}]},
  {label:'文件',submenu:[{role:'close'}]},
  {label:'编辑',submenu:[{role:'undo'},{role:'redo'},{type:'separator'},{role:'cut'},{role:'copy'},{role:'paste'},{role:'pasteAndMatchStyle'},{role:'selectAll'}]},
  {label:'显示',submenu:[{role:'resetZoom'},{role:'zoomIn'},{role:'zoomOut'},{type:'separator'},{role:'togglefullscreen'}]},
  {role:'windowMenu',label:'窗口'}];
}
