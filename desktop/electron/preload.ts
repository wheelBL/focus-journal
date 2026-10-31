import { contextBridge, ipcRenderer } from 'electron';
async function invoke(channel:string,...args:unknown[]){
  try{return await ipcRenderer.invoke(channel,...args);}
  catch(error){const message=error instanceof Error?error.message:String(error);throw new Error(message.replace(/^Error invoking remote method '[^']+': (?:Error: )?/,''));}
}
contextBridge.exposeInMainWorld('journal',{
  usage:{record:(value:unknown)=>invoke('usage:record',value),snapshot:()=>invoke('usage:snapshot'),configure:(enabled:boolean)=>invoke('usage:configure',enabled),clear:(kind:string)=>invoke('usage:clear',kind),feedback:(id:string,rating:string,note:string)=>invoke('usage:feedback',id,rating,note),export:()=>invoke('usage:export')},
  localApi:{status:()=>invoke('local-api:status'),configure:(settings:unknown)=>invoke('local-api:configure',settings),token:()=>invoke('local-api:token'),rotateToken:()=>invoke('local-api:rotate-token')},
  capture:{open:()=>invoke('journal:capture-open'),preferences:()=>invoke('journal:capture-preferences'),configure:(value:string)=>invoke('journal:capture-configure',value)},
  sync:{status:()=>invoke('sync:status'),configure:(input:unknown)=>invoke('sync:configure',input),disconnect:()=>invoke('sync:disconnect'),test:()=>invoke('sync:test'),run:()=>invoke('sync:run'),resolve:(id:string,choice:string)=>invoke('sync:resolve',id,choice),onChanged:(callback:(status:unknown)=>void)=>{const listener=(_event:unknown,status:unknown)=>callback(status);ipcRenderer.on('sync:changed',listener);return()=>ipcRenderer.removeListener('sync:changed',listener);}},
  previewReminder:(settings:unknown,mode:unknown)=>invoke('journal:reminder-preview',settings,mode),
  snapshot:()=>invoke('journal:snapshot'),clock:()=>invoke('journal:clock'),
  command:(command:unknown)=>invoke('journal:command',command),
  exportData:(format:string)=>invoke('journal:export',format),
  importData:()=>invoke('journal:import'),
  openDataFolder:()=>invoke('journal:folder'),
  windowAction:(action:string)=>invoke('journal:window',action),
  onOpenItem:(callback:(id:string)=>void)=>{const listener=(_event:unknown,id:string)=>callback(id);ipcRenderer.on('journal:open-item',listener);return()=>ipcRenderer.removeListener('journal:open-item',listener);},
  onOpenSession:(callback:(id:string)=>void)=>{const listener=(_event:unknown,id:string)=>callback(id);ipcRenderer.on('journal:open-session',listener);return()=>ipcRenderer.removeListener('journal:open-session',listener);},
  onChanged:(callback:()=>void)=>{const listener=()=>callback();ipcRenderer.on('journal:changed',listener);return()=>ipcRenderer.removeListener('journal:changed',listener);}
});
import {exposeAppearance} from './appearance-preload';
exposeAppearance();

import {exposeAI} from './ai-preload';
exposeAI();
