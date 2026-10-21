import type {CSSProperties} from 'react';
import type {JournalState} from '../core/types';

export const calendarPalette=Array.from({length:24},(_,i)=>{
 const hue=Math.round((i*137.508+213)%360);
 return {hue,accent:`hsl(${hue}, 58%, 38%)`,fill:`hsl(${hue}, 64%, 95%)`,text:`hsl(${hue}, 52%, 25%)`};
});
export const unassignedCalendarColor={accent:'#727b89',fill:'#f0f2f5',text:'#424b59'};
export type CalendarColorBook=Record<string,number>;
function hash(text:string){let n=2166136261;for(const c of text)n=Math.imul(n^c.charCodeAt(0),16777619);return n>>>0;}

/** Identity owns color. Source, title, position, selected date and visible layers never enter the key. */
export function calendarItemColors(state:Pick<JournalState,'tasks'|'sessions'>,saved:unknown={}){
 const book:CalendarColorBook={},counts=Array(calendarPalette.length).fill(0);
 if(saved&&typeof saved==='object'&&!Array.isArray(saved))for(const [key,value] of Object.entries(saved)){
  if(key.startsWith('item:')&&key.length<200&&Number.isInteger(value)&&value>=0&&value<calendarPalette.length){book[key]=value;counts[value]++;}
 }
 const tasks=new Map(state.tasks.map(t=>[t.id,t])),keys=new Map<string,string>();
 const identity=(id:string):string=>{
  if(keys.has(id))return keys.get(id)!;
  const chain:string[]=[],seen=new Set<string>();let current=id;
  while(!keys.has(current)&&!seen.has(current)){
   chain.push(current);seen.add(current);const previous=tasks.get(current)?.recurrencePreviousId;
   if(!previous||!tasks.has(previous))break;current=previous;
  }
  const key=keys.get(current)??`item:${current}`;for(const member of chain)keys.set(member,key);return key;
 };
 const ids=new Set(state.sessions.flatMap(s=>s.taskId?[s.taskId]:[]));
 for(const task of state.tasks)if(task.reminder||task.eventAt)ids.add(task.id);
 // Saved assignments never get rebalanced. New identities use a least-used color to avoid needless collisions.
 for(const key of [...new Set([...ids].map(identity))].sort()){
  if(Object.hasOwn(book,key))continue;
  const start=hash(key)%calendarPalette.length,minimum=Math.min(...counts),used=calendarPalette.filter((_,i)=>counts[i]>minimum);
  const distance=(i:number)=>used.length?Math.min(...used.map(c=>{const d=Math.abs(c.hue-calendarPalette[i].hue);return Math.min(d,360-d);})):0;
  const candidates=Array.from({length:calendarPalette.length},(_,i)=>(start+i)%calendarPalette.length).filter(i=>counts[i]===minimum);
  const chosen=candidates.reduce((best,i)=>distance(i)>distance(best)?i:best,candidates[0]);
  book[key]=chosen;counts[chosen]++;
 }
 return {book,changed:JSON.stringify(book)!==JSON.stringify(saved),color:(id:string|null)=>{
  if(id===null)return unassignedCalendarColor;
  const key=identity(id);return calendarPalette[book[key]??hash(key)%calendarPalette.length];
 }};
}
export function calendarColorStyle(color:typeof unassignedCalendarColor):CSSProperties{
 return {'--calendar-color':color.accent,'--calendar-fill':color.fill,'--calendar-text':color.text} as CSSProperties;
}
