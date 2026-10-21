import type {CapturePreferences} from '../core/types';
export interface ShortcutPort {register(key:string,open:()=>void):boolean;unregister(key:string):void;isRegistered(key:string):boolean}
/** Register the replacement first, so a conflict cannot disable the working shortcut. */
export class CaptureShortcut {
 private state:CapturePreferences={shortcut:'',registered:false};
 constructor(private port:ShortcutPort,private open:()=>void,private save:(key:string)=>void){}
 preferences(){return {...this.state};}
 configure(value:unknown,persist=true){
  if(typeof value!=='string'||value.length>80)throw new Error('快捷键无效。');
  const key=value.trim();if(key&&!/^(?:(?:Ctrl|Control|CommandOrControl|Alt|Shift|Super)\+){1,4}(?:[A-Z0-9]|F(?:[1-9]|1[0-9]|2[0-4])|Space)$/i.test(key))throw new Error('请输入带修饰键的组合，例如 Ctrl+Alt+Space。');
  const old=this.state.shortcut;
  if(key===old&&(!key||this.port.isRegistered(key)))return this.preferences();
  if(key&&!this.port.register(key,this.open)){if(!persist)this.state={shortcut:key,registered:false,error:'快捷键已被占用，请在设置中更换；仍可从托盘打开。'};else throw new Error('快捷键已被其他应用占用，原快捷键保持。');return this.preferences();}
  try{if(persist)this.save(key);}catch(e){if(key)this.port.unregister(key);throw new Error('快捷键设置未能保存，原设置保持。');}
  if(old&&old!==key&&this.port.isRegistered(old))this.port.unregister(old);
  this.state={shortcut:key,registered:!!key};return this.preferences();
 }
 dispose(){if(this.state.shortcut&&this.port.isRegistered(this.state.shortcut))this.port.unregister(this.state.shortcut);}
}
