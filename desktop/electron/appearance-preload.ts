import {contextBridge,ipcRenderer} from 'electron';
import type {Appearance} from '../core/appearance';
export function exposeAppearance(){
 contextBridge.exposeInMainWorld('journalAppearance',{
  get:()=>ipcRenderer.invoke('appearance:get'),
  set:async(value:Appearance)=>{try{return await ipcRenderer.invoke('appearance:set',value);}catch(e){throw new Error((e as Error).message.replace(/^Error invoking remote method '[^']+': (?:Error: )?/,''));}},
  onChanged:(listener:(value:Appearance)=>void)=>{const receive=(_event:unknown,value:Appearance)=>listener(value);ipcRenderer.on('appearance:changed',receive);return()=>ipcRenderer.removeListener('appearance:changed',receive);}
 });
}
