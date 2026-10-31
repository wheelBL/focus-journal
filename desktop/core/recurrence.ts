import {localDate,shiftDate,type Recurrence,type Task,type JournalState} from './types';
import {day} from './validation';
import {isEvent,isNote} from './item-kind';

const ordinal=(date:string)=>Date.parse(`${date}T00:00:00Z`)/86400000;
export const dateDistance=(from:string,to:string)=>ordinal(to)-ordinal(from);
export function recurrenceBase(item:Task,now:string){return isEvent(item)?localDay(item.eventAt!):item.plannedDate??(item.dueAt?localDay(item.dueAt):localDate(now));}
export function localDay(value:string){return value.length===10?value:localDate(value);}
function monthDate(anchor:string,months:number){
 const d=new Date(`${anchor}T12:00:00`),date=d.getDate();d.setDate(1);d.setMonth(d.getMonth()+months);
 d.setDate(Math.min(date,new Date(d.getFullYear(),d.getMonth()+1,0).getDate()));return localDate(d);
}
export function validateRecurrence(value:unknown):Recurrence {
 const r=value as Recurrence;
 if(!r||!['calendar','completion'].includes(r.mode)||!['day','week','month','year'].includes(r.unit)||!Number.isInteger(r.interval)||r.interval<1||r.interval>365||!Array.isArray(r.weekdays)||r.weekdays.some(d=>!Number.isInteger(d)||d<0||d>6)||new Set(r.weekdays).size!==r.weekdays.length)throw new Error('请选择有效的重复方式和 1–365 的间隔。');
 day(r.anchor);if(r.until!==null){day(r.until);if(r.until<r.anchor)throw new Error('重复结束日不能早于首次日期。');}
 if(r.mode==='calendar'&&r.unit==='week'&&!r.weekdays.length)throw new Error('请至少选择一周中的一天。');
 if(r.reminderOffsetMs!==undefined&&(!Number.isFinite(r.reminderOffsetMs)||Math.abs(r.reminderOffsetMs)>366*86400000))throw new Error('重复提醒与事件的间隔不能超过一年。');
 return {...r,weekdays:[...r.weekdays].sort((a,b)=>a-b)};
}
/** Find the first calendar occurrence strictly after the local date, without scanning past days. */
export function nextOccurrence(rule:Recurrence,after:string):string|null {
 const anchor=rule.anchor;
 let next:string;
 if(rule.mode==='completion'){
  next=rule.unit==='month'||rule.unit==='year'?monthDate(after,rule.interval*(rule.unit==='year'?12:1)):shiftDate(after,rule.interval*(rule.unit==='week'?7:1));
 }else if(rule.unit==='day'){
  const step=Math.max(0,Math.floor(dateDistance(anchor,after)/rule.interval)+1);next=shiftDate(anchor,step*rule.interval);
 }else if(rule.unit==='week'){
  const monday=shiftDate(anchor,-((new Date(`${anchor}T12:00:00`).getDay()+6)%7)),week=Math.max(0,Math.floor(dateDistance(monday,after)/7)),block=Math.floor(week/rule.interval)*rule.interval;
  const offsets=rule.weekdays.map(d=>(d+6)%7).sort((a,b)=>a-b);
  next='';
  for(let attempt=0;attempt<2&&!next;attempt++)for(const offset of offsets){const candidate=shiftDate(monday,(block+attempt*rule.interval)*7+offset);if(candidate>=anchor&&candidate>after){next=candidate;break;}}
 }else{
  const step=rule.interval*(rule.unit==='year'?12:1),a=new Date(`${anchor}T12:00:00`),b=new Date(`${after}T12:00:00`);
  let periods=Math.max(0,Math.floor(((b.getFullYear()-a.getFullYear())*12+b.getMonth()-a.getMonth())/step));
  next=monthDate(anchor,periods*step);if(next<=after)next=monthDate(anchor,++periods*step);
 }
 return !/^\d{4}-\d{2}-\d{2}$/.test(next)||rule.until&&next>rule.until?null:next;
}
export function recurrenceDates(rule:Recurrence,from:string,to:string):string[]{
 const result:string[]=[];let next=nextOccurrence(rule,shiftDate(from,-1));
 while(next&&next<=to&&result.length<512){result.push(next);next=nextOccurrence(rule,next);}return result;
}
/** Preserve date precision and wall-clock time, including across DST. */
export function shiftOccurrence(value:string|null|undefined,days:number):string|null {
 if(!value)return null;if(value.length===10)return shiftDate(value,days);
 const d=new Date(value);d.setDate(d.getDate()+days);return d.toISOString();
}
export function configureRecurrence(task:Task,value:unknown,now:string){
 if(value===null){task.recurrence=null;return;}
 if(isNote(task)||task.status!=='open'||task.deletedAt||task.archived)throw new Error('请为未完成事项或事件设置重复。');
 const rule=validateRecurrence(value);
 if(isEvent(task)&&rule.mode!=='calendar')throw new Error('事件按固定日历重复。');
 if(isEvent(task)){
  if(rule.anchor!==localDay(task.eventAt!))throw new Error('事件的首次日期请在事件时间中修改。');
  if(task.reminder&&rule.reminderOffsetMs===undefined)rule.reminderOffsetMs=Date.parse(task.reminder.at)-Date.parse(task.eventAt!.length===10?`${task.eventAt}T00:00:00`:task.eventAt!);
 }else if(!task.plannedDate&&!task.dueAt)task.plannedDate=rule.anchor;
 task.recurrence=rule;
 if(isEvent(task)&&task.reminder&&rule.reminderOffsetMs!==undefined){
  validateRecurrence(rule);
  if(task.reminder.state==='dismissed')advanceEventReminder(task,now);
  else{
   const occurrenceDay=localDate(Date.parse(task.reminder.at)-rule.reminderOffsetMs),validDay=nextOccurrence(rule,shiftDate(occurrenceDay,-1));
   if(validDay&&validDay!==occurrenceDay)task.reminder={at:shiftOccurrence(task.reminder.at,dateDistance(occurrenceDay,validDay))!,state:'scheduled',snoozedUntil:null};
   if(!validDay){task.reminder.state='dismissed';task.reminder.snoozedUntil=null;}
  }
 }
}
/** A completed occurrence keeps all its evidence. Only its successor is a new item. */
export function generateTaskSuccessors(before:JournalState,after:JournalState,now:string){
 const previous=new Map(before.tasks.map(t=>[t.id,t]));
 for(const task of [...after.tasks]){
  if(!task.recurrence||task.itemType==='event'||task.status!=='done'||!['open','handed-off'].includes(previous.get(task.id)?.status??'')||task.recurrenceNextId||task.deletedAt)continue;
  const base=recurrenceBase(task,now),cutoff=task.recurrence.mode==='completion'?localDate(now):[base,localDate(now)].sort().at(-1)!;
  const next=nextOccurrence(task.recurrence,cutoff);if(!next)continue;
  const offset=dateDistance(base,next),id=cryptoId(task.id,next);
  // Deterministic identity makes retries and snapshot reconciliation idempotent.
  if(after.tasks.some(t=>t.id===id)){task.recurrenceNextId=id;continue;}
  let parent=task.parentId??null;
  while(parent){const p=after.tasks.find(t=>t.id===parent);if(!p||p.status!=='open'||p.deletedAt||p.archived)parent=p?.parentId??null;else break;}
  const successor:Task={...structuredClone(task),id,parentId:parent,order:task.order??0,status:'open',ownership:null,completionBy:undefined,startedAt:null,completedAt:null,createdAt:now,updatedAt:now,deletedAt:null,focusDate:null,reviewSchedule:null,recurrencePreviousId:task.id,recurrenceNextId:null,plannedDate:shiftOccurrence(task.plannedDate,offset),dueAt:shiftOccurrence(task.dueAt,offset),reminder:task.reminder?{at:shiftOccurrence(task.reminder.at,offset)!,state:'scheduled',snoozedUntil:null}:null};
  // Fixed monthly/yearly anchors remain the original day (Jan 31 → Feb 28 → Mar 31).
  after.tasks.push(successor);task.recurrenceNextId=id;
 }
}
function cryptoId(id:string,date:string){
 // A stable, bounded occurrence ID; no dependency on Node in the shared date engine.
 let a=2166136261,b=5381;for(const c of `${id}\n${date}`){a=Math.imul(a^c.charCodeAt(0),16777619);b=Math.imul(b,33)^c.charCodeAt(0);}
 return `repeat-${(a>>>0).toString(16)}-${(b>>>0).toString(16)}-${date}`;
}
export function recurringEvents(tasks:Task[],from:string,to:string):Task[]{
 const result:Task[]=[];
 for(const task of tasks){
  if(!isEvent(task)||task.deletedAt||task.archived||!task.eventAt)continue;
  if(!task.recurrence){result.push(task);continue;}
  const duration=task.eventEnd?Math.max(1,Math.ceil((Date.parse(task.eventEnd)-Date.parse(task.eventAt))/86400000)):0;
  for(const date of recurrenceDates(task.recurrence,shiftDate(from,-duration),to)){
   const offset=dateDistance(localDay(task.eventAt),date);
   const occurrence={...task,eventAt:shiftOccurrence(task.eventAt,offset),eventEnd:shiftOccurrence(task.eventEnd,offset)};
   const start=Date.parse(occurrence.eventAt!.length===10?`${occurrence.eventAt}T00:00:00`:occurrence.eventAt!),end=occurrence.eventEnd?Date.parse(occurrence.eventEnd):start+(occurrence.eventAt!.length===10?86400000:30*60000);
   if(start<Date.parse(`${shiftDate(to,1)}T00:00:00`)&&end>Date.parse(`${from}T00:00:00`))result.push(occurrence);
  }
 }
 return result;
}
export function advanceEventReminder(task:Task,now:string){
 const rule=task.recurrence;if(!isEvent(task)||!rule||!task.reminder||rule.reminderOffsetMs===undefined)return;
 const base=task.eventAt!,offset=rule.reminderOffsetMs;
 const after=shiftDate(localDate(Date.parse(now)-offset),-1);
 let date=nextOccurrence(rule,after);
 for(let i=0;date&&i<3;i++){
  const at=new Date(Date.parse(shiftOccurrence(base.length===10?new Date(`${base}T00:00:00`).toISOString():base,dateDistance(localDay(base),date))!)+offset).toISOString();
  if(at>now){task.reminder={at,state:'scheduled',snoozedUntil:null};return;}date=nextOccurrence(rule,date);
 }
 task.reminder.state='dismissed';task.reminder.snoozedUntil=null;
}
export function recurrenceLabel(rule:Recurrence){
 const units={day:'天',week:'周',month:'个月',year:'年'};
 const days=['日','一','二','三','四','五','六'];
 return `${rule.mode==='completion'?'完成后每隔':'每'} ${rule.interval} ${units[rule.unit]}${rule.mode==='calendar'&&rule.unit==='week'?` · 周${rule.weekdays.map(d=>days[d]).join('、')}`:''}${rule.until?` · 至 ${rule.until}`:''}`;
}
