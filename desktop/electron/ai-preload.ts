import {contextBridge,ipcRenderer} from 'electron';
import type {AiAssistantBridge} from '../core/ai-assistant-types';
export function exposeAI(){const api:AiAssistantBridge={
 listModels:input=>ipcRenderer.invoke('ai:list-models',input),cancelModels:()=>ipcRenderer.invoke('ai:cancel-models'),
 status:()=>ipcRenderer.invoke('ai:status'),configure:input=>ipcRenderer.invoke('ai:configure',input),clearKey:()=>ipcRenderer.invoke('ai:clear-key'),test:()=>ipcRenderer.invoke('ai:test'),
 context:(scope,purpose)=>ipcRenderer.invoke('ai:context',scope,purpose),get:()=>ipcRenderer.invoke('ai:get'),generate:input=>ipcRenderer.invoke('ai:generate',input),cancel:()=>ipcRenderer.invoke('ai:cancel'),reset:()=>ipcRenderer.invoke('ai:reset'),selectConversation:id=>ipcRenderer.invoke('ai:select-conversation',id),editSuggestion:input=>ipcRenderer.invoke('ai:edit-suggestion',input),undoSuggestion:input=>ipcRenderer.invoke('ai:undo-suggestion',input),apply:input=>ipcRenderer.invoke('ai:apply',input),
 onChanged:callback=>{const listener=(_event:unknown,state:Awaited<ReturnType<AiAssistantBridge['get']>>)=>callback(state);ipcRenderer.on('ai:changed',listener);return()=>ipcRenderer.removeListener('ai:changed',listener);}
};contextBridge.exposeInMainWorld('journalAI',api);}
