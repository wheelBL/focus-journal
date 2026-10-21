import {emptyFilter,validateFilter} from '../core/filters';
import type {ItemFilter,JournalState} from '../core/types';
import {rulesFor} from '../core/filter-rules';
export interface TreeWorkspace {selected:string|null;retained:string|null;filter:ItemFilter;activeView:string;collapsed:string[];showDetails:boolean;scrollTop:number;layout?:'tree'|'flat';detailTab?:'details'|'records'|'review'}
export function readLocal<T>(key:string,fallback:T):T{try{return JSON.parse(window.localStorage.getItem(key)??'null')??fallback;}catch{return fallback;}}
export function writeLocal(key:string,value:unknown){try{window.localStorage.setItem(key,JSON.stringify(value));}catch{/* Persistence is optional when storage is unavailable. */}}
export function readTree(key:string,state:JournalState):TreeWorkspace|null{
 const value=readLocal<any>(key,null);if(!value||typeof value!=='object')return null;
 const ids=new Set(state.tasks.map(t=>t.id));let filter=emptyFilter(),activeView=state.views.find(v=>v.id===value.activeView);
 try{filter=validateFilter(value.filter,state);}catch{
  // A removed tag/scope can invalidate an old draft. Recover the saved view, never label All Items as that view.
  try{if(!activeView)throw Error();filter=validateFilter(activeView.filter,state);}catch{activeView=undefined;}
 }
 if(filter.scopeId&&!ids.has(filter.scopeId))filter.scopeId=null;
 // Upgrade only the old unfiltered default. Saved views and later explicit choices retain their meaning.
 if(!value.completedDefaultVersion&&!activeView&&filter.view==='all'&&!rulesFor(filter).children.length)filter={...filter,showDone:false,rules:undefined};
 return {selected:ids.has(value.selected)?value.selected:null,retained:null,filter,activeView:activeView?.id??'',collapsed:Array.isArray(value.collapsed)?value.collapsed.filter((id:unknown)=>typeof id==='string'&&ids.has(id)):[],showDetails:value.showDetails!==false,scrollTop:typeof value.scrollTop==='number'&&Number.isFinite(value.scrollTop)?Math.max(0,value.scrollTop):0,layout:value.layout==='flat'?'flat':'tree',detailTab:['details','records','review'].includes(value.detailTab)?value.detailTab:'details'};
}
