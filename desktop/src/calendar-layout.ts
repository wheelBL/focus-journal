import {recurringEvents} from '../core/recurrence';
import {shiftDate,localDate,type Session,type JournalState,type Task} from '../core/types';
import {scheduledItems,reminderTime} from '../core/item-reminders';

export interface CalendarBlock {session:Session; index:number; top:number; height:number; lane:number; lanes:number}
// Geometry and lane assignment use actual intervals. Tiny entries get accessible
// labels outside the grid; hit-area sizing must never invent time or concurrency.
function partition<T extends {top:number;height:number;lane:number;lanes:number}>(entries:T[]):T[]{
 entries.sort((a,b)=>a.top-b.top||b.height-a.height);
 let group:T[]=[],ends:number[]=[],bottom=0;
 const finish=()=>{for(const entry of group)entry.lanes=ends.length;};
 for(const entry of entries){
  if(entry.top>=bottom){finish();group=[];ends=[];}
  let lane=ends.findIndex(end=>end<=entry.top);if(lane<0)lane=ends.length;
  entry.lane=lane;ends[lane]=entry.top+Math.max(0.000001,entry.height);bottom=Math.max(...ends);group.push(entry);
 }
 finish();return entries;
}
export function calendarBlocks(sessions:Session[],date:string):CalendarBlock[]{
 const dayStart=new Date(`${date}T00:00:00`).getTime();
 const dayEnd=new Date(`${shiftDate(date,1)}T00:00:00`).getTime();
 const blocks:CalendarBlock[]=[];
 for(const session of sessions)session.segments.forEach((seg,index)=>{
  const start=Math.max(dayStart,Date.parse(seg.start)),end=Math.min(dayEnd,Date.parse(seg.end));
  if(end<=start)return;
  const top=(start-dayStart)/(dayEnd-dayStart)*1152;
  blocks.push({session,index,top,height:(end-start)/(dayEnd-dayStart)*1152,lane:0,lanes:1});
 });
 return partition(blocks);
}

export type CalendarEntry = (CalendarBlock & {kind:'effort'}) | ({kind:'reminder'}|{kind:'event'}) & {task:Task;at:string;top:number;height:number;lane:number;lanes:number};
// Reminders are points, not blocks of invented duration.
export function calendarEntries(state:JournalState,date:string,visible:CalendarEntry['kind'][]=['effort','reminder','event']):CalendarEntry[]{
 const entries:CalendarEntry[]=calendarBlocks(state.sessions,date).map(b=>({...b,kind:'effort'}));
 for(const task of scheduledItems(state)){
  const at=reminderTime(task)!;if(localDate(at)!==date)continue;
  const from=Date.parse(`${date}T00:00:00`),to=Date.parse(`${shiftDate(date,1)}T00:00:00`),top=(Date.parse(at)-from)/(to-from)*1152;
  entries.push({kind:'reminder',task,at,top,height:0,lane:0,lanes:1});
 }
 for(const task of recurringEvents(state.tasks,date,date).filter(t=>t.eventAt?.length!==10)){
  const begin=Date.parse(task.eventAt!),finish=task.eventEnd?Date.parse(task.eventEnd):begin+30*60000,from=Date.parse(`${date}T00:00:00`),to=Date.parse(`${shiftDate(date,1)}T00:00:00`);
  if(finish<=from||begin>=to)continue;
  const top=(Math.max(begin,from)-from)/(to-from)*1152,height=(Math.min(finish,to)-Math.max(begin,from))/(to-from)*1152;
  entries.push({kind:'event',task,at:task.eventAt!,top,height,lane:0,lanes:1});
 }
 for(let i=entries.length-1;i>=0;i--)if(!visible.includes(entries[i].kind))entries.splice(i,1);
 return partition(entries);
}
export function calendarReminderInput(date:string,y:number,height:number){
 const minute=Math.max(0,Math.min(1425,Math.floor(y/Math.max(1,height)*1440/15)*15));
 return `${date}T${String(Math.floor(minute/60)).padStart(2,'0')}:${String(minute%60).padStart(2,'0')}`;
}
