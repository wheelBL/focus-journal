import {EventEmitter} from 'node:events';
export const harness={windows:[],handlers:new Map(),events:new Map(),autoAudio:true};
export const ipcMain={handle:(name,fn)=>harness.handlers.set(name,fn),on:(name,fn)=>harness.events.set(name,fn),removeHandler:name=>harness.handlers.delete(name)};
export const screen={getCursorScreenPoint:()=>({x:-800,y:50}),getDisplayNearestPoint:()=>({workArea:{x:-1920,y:0,width:1920,height:1040}})};
export class BrowserWindow extends EventEmitter{
 visible=false;destroyed=false;focused=false;bounds={x:0,y:0,width:520,height:370};messages=[];
 constructor(options){super();this.options=options;this.top=options.alwaysOnTop;harness.windows.push(this);this.webContents=new EventEmitter();this.webContents.mainFrame={};this.webContents.setWindowOpenHandler=()=>{};this.webContents.send=(name,state)=>{this.messages.push(structuredClone({name,state}));if(state?.cue&&harness.autoAudio)harness.events.get('reminder:audio-result')?.({sender:this.webContents,senderFrame:this.webContents.mainFrame},state.cue.id);};}
 async loadFile(file,options){this.file=file;this.query=options.query;this.emit('ready-to-show');}
 isDestroyed(){return this.destroyed;}isVisible(){return this.visible;}isFocused(){return this.focused;}isAlwaysOnTop(){return this.top;}
 setBounds(bounds){this.bounds=bounds;}getBounds(){return this.bounds;}setAlwaysOnTop(top,level){this.top=top;this.level=level;}
 show(){this.visible=true;}focus(){this.focused=true;}
 showInactive(){this.visible=true;this.focused=false;this.top=false;}hide(){this.visible=false;}
 destroy(){this.destroyed=true;this.visible=false;this.emit('closed');}
}

export const shortcuts=new Map();export const globalShortcut={register:(key,fn)=>{if(shortcuts.has(key))return false;shortcuts.set(key,fn);return true;},unregister:key=>shortcuts.delete(key),isRegistered:key=>shortcuts.has(key)};
