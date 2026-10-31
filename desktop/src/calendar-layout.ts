import {recurringEvents} from '../core/recurrence';
import {shiftDate,localDate,type Session,type JournalState,type Task} from '../core/types';
import {scheduledItems,reminderTime} from '../core/item-reminders';

export interface CalendarBlock {session:Session; index:number; top:number; height:number; lane:number; lanes:number}
// Geometry and lane assignment use actual intervals. Tiny entries get accessible
// labels outside the grid; hit-area sizing must never invent time or concurrency.
export function partition<T extends {top:number;height:number;lane:number;lanes:number}>(entries:T[]):T[]{
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
export interface CalendarSessionDay {totalMs:number;unknown:Session[];entries:CalendarEntry[]}
export interface CalendarRangeDay extends CalendarSessionDay {done:number;reminders:Task[];events:Task[]}

/** Parse each historical segment once. Day boundaries preserve local-midnight/DST semantics. */
export function calendarSessionDays(sessions:Session[],dates:string[],timed=true){
 const days=new Map<string,CalendarSessionDay>(dates.map(date=>[date,{totalMs:0,unknown:[],entries:[]}]));
 if(!dates.length)return days;
 const bounds=dates.map(date=>({date,start:Date.parse(`${date}T00:00:00`),end:Date.parse(`${shiftDate(date,1)}T00:00:00`)})),from=bounds[0].start,to=bounds.at(-1)!.end;
 for(const session of sessions){
  if(!session.segments.length){const day=days.get(session.date);if(day){day.totalMs+=session.durationMs;day.unknown.push(session);}continue;}
  session.segments.forEach((segment,index)=>{
   const start=Date.parse(segment.start),end=Date.parse(segment.end);
   if(end<=start){const day=days.get(localDate(start));if(day)day.totalMs+=segment.durationMs;return;}
   if(end<=from||start>=to)return;
   for(const bound of bounds){
    const left=Math.max(start,bound.start),right=Math.min(end,bound.end);if(right<=left)continue;
    const day=days.get(bound.date)!;day.totalMs+=segment.durationMs*(right-left)/(end-start);
    if(timed)day.entries.push({kind:'effort',session,index,top:(left-bound.start)/(bound.end-bound.start)*1152,height:(right-left)/(bound.end-bound.start)*1152,lane:0,lanes:1});
   }
  });
 }
 return days;
}

/** A visible range shares recurrence expansion, eligibility and historical effort aggregation. */
export function calendarRange(state:JournalState,dates:string[],visible:CalendarEntry['kind'][]=['effort','reminder','event'],timed=true){
 const sessions=calendarSessionDays(state.sessions,dates,timed&&visible.includes('effort')),result=new Map<string,CalendarRangeDay>();
 if(!dates.length)return result;
 const reminders=visible.includes('reminder')?scheduledItems(state):[],events=visible.includes('event')?recurringEvents(state.tasks,dates[0],dates.at(-1)!):[];
 const completed=new Map<string,number>();for(const task of state.tasks)if(task.completedAt){const date=localDate(task.completedAt);completed.set(date,(completed.get(date)??0)+1);}
 for(const date of dates){
  const day=sessions.get(date)!,from=Date.parse(`${date}T00:00:00`),to=Date.parse(`${shiftDate(date,1)}T00:00:00`),dayReminders=reminders.filter(task=>localDate(reminderTime(task)!)===date);
  if(timed){
   for(const task of dayReminders){const at=reminderTime(task)!;day.entries.push({kind:'reminder',task,at,top:(Date.parse(at)-from)/(to-from)*1152,height:0,lane:0,lanes:1});}
   for(const task of events){
    if(task.eventAt?.length===10)continue;
    const begin=Date.parse(task.eventAt!),finish=task.eventEnd?Date.parse(task.eventEnd):begin+30*60000;if(finish<=from||begin>=to)continue;
    day.entries.push({kind:'event',task,at:task.eventAt!,top:(Math.max(begin,from)-from)/(to-from)*1152,height:(Math.min(finish,to)-Math.max(begin,from))/(to-from)*1152,lane:0,lanes:1});
   }
   partition(day.entries);
  }
  result.set(date,{...day,done:completed.get(date)??0,reminders:dayReminders,events:events.filter(task=>(task.eventAt!.length===10?task.eventAt:localDate(task.eventAt!))===date)});
 }
 return result;
}
// Reminders are points, not blocks of invented duration.
export function calendarEntries(state:JournalState,date:string,visible:CalendarEntry['kind'][]=['effort','reminder','event']):CalendarEntry[]{
 return calendarRange(state,[date],visible).get(date)!.entries;
}
export function calendarReminderInput(date:string,y:number,height:number){
 const minute=Math.max(0,Math.min(1425,Math.floor(y/Math.max(1,height)*1440/15)*15));
 return `${date}T${String(Math.floor(minute/60)).padStart(2,'0')}:${String(minute%60).padStart(2,'0')}`;
}
