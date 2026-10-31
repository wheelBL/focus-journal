import {contextBridge,ipcRenderer} from 'electron';
import type {AiAssistantBridge} from '../core/ai-assistant-types';
export function exposeAI(){const api:AiAssistantBridge={
 status:()=>ipcRenderer.invoke('ai:status'),configure:input=>ipcRenderer.invoke('ai:configure',input),clearKey:()=>ipcRenderer.invoke('ai:clear-key'),test:()=>ipcRenderer.invoke('ai:test'),
 context:scope=>ipcRenderer.invoke('ai:context',scope),get:()=>ipcRenderer.invoke('ai:get'),generate:input=>ipcRenderer.invoke('ai:generate',input),cancel:()=>ipcRenderer.invoke('ai:cancel'),apply:input=>ipcRenderer.invoke('ai:apply',input),
 onChanged:callback=>{const listener=(_event:unknown,state:Awaited<ReturnType<AiAssistantBridge['get']>>)=>callback(state);ipcRenderer.on('ai:changed',listener);return()=>ipcRenderer.removeListener('ai:changed',listener);}
};contextBridge.exposeInMainWorld('journalAI',api);}
