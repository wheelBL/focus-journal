import {useCallback,useSyncExternalStore} from 'react';

const eventName='journal:content-scope';
const memory=new Map<string,string|null>();
const key=(dataPath:string)=>`journal.content-scope.${dataPath}`;
export function readContentScope(dataPath:string):string|null{
 try{const value=window.localStorage.getItem(key(dataPath));if(value!==null){const parsed=JSON.parse(value);return typeof parsed==='string'?parsed:null;}}catch{}
 return memory.get(dataPath)??null;
}
export function hasContentScope(dataPath:string){try{if(window.localStorage.getItem(key(dataPath))!==null)return true;}catch{}return memory.has(dataPath);}
export function setContentScope(dataPath:string,value:string|null){
 memory.set(dataPath,value);try{window.localStorage.setItem(key(dataPath),JSON.stringify(value));}catch{}
 window.dispatchEvent(new CustomEvent(eventName,{detail:{dataPath}}));
}
/** Shared range only. Each module keeps its own selection, drafts, filters and reading position. */
export function useContentScope(dataPath:string){
 const subscribe=useCallback((notify:()=>void)=>{const changed=(event:Event)=>{if(event.type==='storage'||(event as CustomEvent).detail?.dataPath===dataPath)notify();};window.addEventListener(eventName,changed);window.addEventListener('storage',changed);return()=>{window.removeEventListener(eventName,changed);window.removeEventListener('storage',changed);};},[dataPath]);
 const snapshot=useCallback(()=>readContentScope(dataPath),[dataPath]);
 const scopeId=useSyncExternalStore(subscribe,snapshot,snapshot);
 const setScopeId=useCallback((value:string|null)=>setContentScope(dataPath,value),[dataPath]);
 return {scopeId,setScopeId};
}
