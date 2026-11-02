import {useCallback,useEffect,useRef,useState} from 'react';
import type {JournalState,Task} from '../core/types';
import {outlineIndex,outlinePath,branchIds} from '../core/outline';
import {contentGroups} from '../core/content-workspace';
import {readLocal,writeLocal} from './workspace-state';

/** Write at the edit boundary so a module unmount never drops a draft. */
export function useContentMemory<T>(key:string,initial:T){
 const [value,setValue]=useState<T>(()=>readLocal(key,initial));
 const current=useRef(value);
 useEffect(()=>{const sync=(event:Event)=>{if((event as CustomEvent).detail===key){current.current=readLocal(key,current.current);setValue(current.current);}};window.addEventListener('journal:content-memory',sync);return()=>window.removeEventListener('journal:content-memory',sync);},[key]);
 const update=useCallback((next:T|((previous:T)=>T))=>{const previous=readLocal(key,current.current),result=typeof next==='function'?(next as (p:T)=>T)(previous):next;current.current=result;writeLocal(key,result);setValue(result);window.dispatchEvent(new CustomEvent('journal:content-memory',{detail:key}));},[key]);
 return [value,update] as const;
}

/** A saved cache follows the journal; an unsaved field survives external changes. */
export function useContentDraft<T extends object>(key:string,source:T,fields:readonly (keyof T)[]){
 type Stored=T&{__base?:Partial<T>};
 const initial={...source,__base:Object.fromEntries(fields.map(field=>[field,source[field]]))} as Stored;
 const [stored,setStored]=useContentMemory<Stored>(key,initial);
 const equal=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
 const reconcile=(previous:Stored):Stored=>{
  const next={...previous};const base:Partial<T>={...previous.__base};
  for(const field of fields){
   // Legacy drafts have no base: preserve differing text rather than guess it was saved.
   if(!previous.__base||!(field in previous.__base)){base[field]=source[field];continue;}
   if(equal(previous[field],previous.__base[field])||equal(previous[field],source[field])){next[field]=source[field];base[field]=source[field];}
  }
  next.__base=base;return next;
 };
 const draft=reconcile(stored),serialized=JSON.stringify(draft);
 useEffect(()=>{if(serialized!==JSON.stringify(stored))setStored(draft);},[serialized]);
 const update=(next:T|((previous:T)=>T))=>setStored(previous=>({...previous,...(typeof next==='function'?(next as (p:T)=>T)(previous):next)}));
 const saved=(value:Partial<T>)=>setStored(previous=>{const next={...previous};const base:Partial<T>={...previous.__base};for(const field of fields)if(field in value){if(equal(previous[field],draft[field]))next[field]=value[field] as T[keyof T];base[field]=value[field];}return {...next,__base:base};});
 const conflict=fields.some(field=>!equal(draft[field],draft.__base?.[field])&&!equal(source[field],draft.__base?.[field])&&!equal(draft[field],source[field]));
 return [draft as T,update,saved,conflict] as const;
}

export function useContentMounted(){const mounted=useRef(true);useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);return mounted;}
export function scopeItems(state:JournalState,scopeId:string|null){const index=outlineIndex(state),ids=scopeId?branchIds(index,scopeId):null;return state.tasks.filter(t=>(!ids||ids.has(t.id))&&outlinePath(index,t.id).every(n=>{const item=n.record as Task;return !item.deletedAt&&!item.archived;}));}
export function itemPath(state:JournalState,id:string){return outlinePath(outlineIndex(state),id).map(n=>n.title).join(' / ');}
export function groupChoices(state:JournalState,excludeInbox=false){const index=outlineIndex(state),excluded=excludeInbox?branchIds(index,'inbox'):new Set<string>();return contentGroups(state).filter(t=>!excluded.has(t.id)&&t.status==='open').map(t=>({id:t.id,path:itemPath(state,t.id)}));}
export function useContentLocate(module:'notes'|'reminders',select:(id:string)=>void){useEffect(()=>{try{const value=JSON.parse(window.sessionStorage.getItem('journal-content-locate')??'null');if(value?.module===module&&typeof value.id==='string'){window.sessionStorage.removeItem('journal-content-locate');select(value.id);}}catch{}},[]);}
