import {EventEmitter} from 'node:events';
export const harness={windows:[],handlers:new Map(),gate:null};
export const ipcMain={handle:(name,fn)=>harness.handlers.set(name,fn),removeHandler:name=>harness.handlers.delete(name)};
export const screen=Object.assign(new EventEmitter(),{getDisplayNearestPoint:()=>({workArea:{x:-1920,y:0,width:1920,height:1040}}),getDisplayMatching:()=>({workArea:{x:-1920,y:0,width:1920,height:1040}})});
export class BrowserWindow extends EventEmitter {
 visible=false;destroyed=false;focused=false;minimized=false;messages=[];
 constructor(options={}){super();this.options=options;this.top=options.alwaysOnTop;this.bounds={x:0,y:0,width:options.width??1000,height:options.height??700};harness.windows.push(this);this.webContents=new EventEmitter();this.webContents.mainFrame={};this.webContents.setWindowOpenHandler=()=>{};this.webContents.send=(name,state)=>this.messages.push(structuredClone({name,state}));}
 async loadFile(file,options){this.query=options.query;if(harness.gate)await harness.gate;}
 isDestroyed(){return this.destroyed;}isVisible(){return this.visible;}isMinimized(){return this.minimized;}isFocused(){return this.focused;}isAlwaysOnTop(){return this.top;}
 setBounds(bounds){this.bounds={...bounds};this.emit('move');}getBounds(){return this.bounds;}
 setAlwaysOnTop(top){this.top=top;}showInactive(){this.visible=true;this.focused=false;}hide(){const was=this.visible;this.visible=false;if(was)this.emit('hide');}
 show(){this.visible=true;this.emit('show');}minimize(){this.minimized=true;this.emit('minimize');}restore(){this.minimized=false;this.show();this.emit('restore');}
 destroy(){this.visible=false;this.destroyed=true;this.emit('closed');}
}
