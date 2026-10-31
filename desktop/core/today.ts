import {isInformation} from './item-kind';
import {blockedReason} from './item-state';
import {itemSorter} from './item-order';
import {outlineIndex} from './outline';
import {isDeadlineOverdue} from './deadlines';
import {localDate,sessionMsOnDate,type JournalState,type Session,type Task} from './types';

export function todayCandidates(state:JournalState,now:string){
 const index=outlineIndex(state),date=localDate(now);
 const eligible=itemSorter(index,'smart',now,false)(index.ordered).map(n=>n.record as Task).filter(t=>!t.ownership&&!blockedReason(index,t.id)&&!isInformation(t));
 const active=new Set(state.sessions.filter(s=>s.status!=='ended').map(s=>s.taskId));
 const leaves=eligible.filter(t=>!active.has(t.id)&&!(index.children.get(t.id)??[]).some(n=>!(n.record as Task).deletedAt&&!(n.record as Task).archived));
 const worked=new Set(state.sessions.map(s=>s.taskId));
 const available=leaves.filter(t=>!t.plannedDate||t.plannedDate<=date||t.focusDate===date);
 const selected=eligible.find(t=>t.id===state.settings.selectedTaskId&&!active.has(t.id));
 const next=selected??(!active.size?(available.find(t=>t.focusDate===date)??available.find(t=>t.plannedDate===date||isDeadlineOverdue(t.dueAt,now))??available.find(t=>worked.has(t.id))??available.find(t=>!t.isProject)):undefined);
 return {index,eligible,available,next};
}

export interface DayProgress {task:Task|null;minutesMs:number;completed:boolean;lastSession:Session|null;summary:string;summaryAt?:string;summaryOrder?:number;lastSessionOrder?:number;firstOrder?:number}
/** Group direct evidence once per item; parent totals must not count children twice. */
export function dayProgress(state:JournalState,date:string,sessionRanks?:Map<string,number>):DayProgress[]{
 const tasks=new Map(state.tasks.map(t=>[t.id,t])),rows=new Map<string|null,DayProgress>(),summaryAt=new Map<string|null,string>();
 for(const [position,session] of state.sessions.entries()){
  const rank=sessionRanks?.get(session.id)??position;
  const ms=sessionMsOnDate(session,date);if(ms<=0)continue;
  const row=rows.get(session.taskId)??{task:tasks.get(session.taskId!)??null,minutesMs:0,completed:false,lastSession:null,summary:'',firstOrder:rank};
  row.minutesMs+=ms;
  if(!row.lastSession||(session.end??session.start??session.updatedAt)>=(row.lastSession.end??row.lastSession.start??row.lastSession.updatedAt)){row.lastSession=session;row.lastSessionOrder=rank;}
  if(session.summary&&session.updatedAt>=(summaryAt.get(session.taskId)??'')){row.summary=session.summary;row.summaryAt=session.updatedAt;row.summaryOrder=rank;summaryAt.set(session.taskId,session.updatedAt);}
  rows.set(session.taskId,row);
 }
 for(const [position,task] of state.tasks.entries())if(!isInformation(task)&&task.status==='done'&&task.completedAt&&localDate(task.completedAt)===date){
  const row=rows.get(task.id)??{task,minutesMs:0,completed:false,lastSession:null,summary:'',firstOrder:(sessionRanks?.size??state.sessions.length)+position};row.completed=true;if(!row.summary)row.summary=state.reviews.find(r=>r.taskId===task.id)?.outcome??'';rows.set(task.id,row);
 }
 return [...rows.values()].sort((a,b)=>Number(b.completed)-Number(a.completed)||b.minutesMs-a.minutesMs||(a.firstOrder??0)-(b.firstOrder??0));
}
/** Overlay only live records; historical rows and completion evidence remain immutable. */
export function mergeDayProgress(history:DayProgress[],active:DayProgress[]):DayProgress[]{
 const rows=new Map(history.map(row=>[row.task?.id??null,{...row}]));
 for(const live of active){const id=live.task?.id??null,previous=rows.get(id);if(!previous){rows.set(id,{...live});continue;}previous.minutesMs+=live.minutesMs;previous.completed||=live.completed;previous.firstOrder=Math.min(previous.firstOrder??Infinity,live.firstOrder??Infinity);
  const at=(s:Session)=>s.end??s.start??s.updatedAt;
  if(live.lastSession&&(!previous.lastSession||at(live.lastSession)>at(previous.lastSession)||at(live.lastSession)===at(previous.lastSession)&&(live.lastSessionOrder??0)>=(previous.lastSessionOrder??0))){previous.lastSession=live.lastSession;previous.lastSessionOrder=live.lastSessionOrder;}
  if(live.summary&&(!previous.summary||(live.summaryAt??'')>(previous.summaryAt??'')||(live.summaryAt??'')===(previous.summaryAt??'')&&(live.summaryOrder??0)>=(previous.summaryOrder??0))){previous.summary=live.summary;previous.summaryAt=live.summaryAt;previous.summaryOrder=live.summaryOrder;}
 }
 return [...rows.values()].sort((a,b)=>Number(b.completed)-Number(a.completed)||b.minutesMs-a.minutesMs||(a.firstOrder??0)-(b.firstOrder??0));
}
