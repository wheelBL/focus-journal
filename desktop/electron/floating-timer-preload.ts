import {contextBridge,ipcRenderer} from 'electron';
async function invoke(channel:string,...args:unknown[]){try{return await ipcRenderer.invoke(channel,...args);}catch(e){throw new Error((e instanceof Error?e.message:String(e)).replace(/^Error invoking remote method '[^']+': (?:Error: )?/,''));}}
contextBridge.exposeInMainWorld('floatingTimer',{
 snapshot:()=>invoke('floating-timer:snapshot'),action:(action:unknown,id:unknown)=>invoke('floating-timer:action',action,id),
 onChanged:(callback:(value:unknown)=>void)=>{const listener=(_event:unknown,value:unknown)=>callback(value);ipcRenderer.on('floating-timer:changed',listener);return()=>ipcRenderer.removeListener('floating-timer:changed',listener);}
});
import {exposeAppearance} from './appearance-preload';
exposeAppearance();
