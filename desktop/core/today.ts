import {isInformation} from './item-kind';
import {blockedReason} from './item-state';
import {itemSorter} from './item-order';
import {outlineIndex} from './outline';
import {isDeadlineOverdue} from './deadlines';
import {localDate,sessionMsOnDate,type JournalState,type Session,type Task} from './types';

export function todayCandidates(state:JournalState,now:string){
 const index=outlineIndex(state),date=localDate(now);
 const eligible=itemSorter(index,'smart',now,false)(index.ordered).map(n=>n.record as Task).filter(t=>!blockedReason(index,t.id)&&!isInformation(t));
 const active=new Set(state.sessions.filter(s=>s.status!=='ended').map(s=>s.taskId));
 const leaves=eligible.filter(t=>!active.has(t.id)&&!(index.children.get(t.id)??[]).some(n=>!(n.record as Task).deletedAt&&!(n.record as Task).archived));
 const worked=new Set(state.sessions.map(s=>s.taskId));
 const available=leaves.filter(t=>!t.plannedDate||t.plannedDate<=date||t.focusDate===date);
 const selected=eligible.find(t=>t.id===state.settings.selectedTaskId&&!active.has(t.id));
 const next=selected??(!active.size?(available.find(t=>t.focusDate===date)??available.find(t=>t.plannedDate===date||isDeadlineOverdue(t.dueAt,now))??available.find(t=>worked.has(t.id))??available.find(t=>!t.isProject)):undefined);
 return {index,eligible,available,next};
}

export interface DayProgress {task:Task|null;minutesMs:number;completed:boolean;lastSession:Session|null;summary:string}
/** Group direct evidence once per item; parent totals must not count children twice. */
export function dayProgress(state:JournalState,date:string):DayProgress[]{
 const tasks=new Map(state.tasks.map(t=>[t.id,t])),rows=new Map<string|null,DayProgress>(),summaryAt=new Map<string|null,string>();
 for(const session of state.sessions){
  const ms=sessionMsOnDate(session,date);if(ms<=0)continue;
  const row=rows.get(session.taskId)??{task:tasks.get(session.taskId!)??null,minutesMs:0,completed:false,lastSession:null,summary:''};
  row.minutesMs+=ms;
  if(!row.lastSession||(session.end??session.start??session.updatedAt)>=(row.lastSession.end??row.lastSession.start??row.lastSession.updatedAt))row.lastSession=session;
  if(session.summary&&session.updatedAt>=(summaryAt.get(session.taskId)??'')){row.summary=session.summary;summaryAt.set(session.taskId,session.updatedAt);}
  rows.set(session.taskId,row);
 }
 for(const task of state.tasks)if(!isInformation(task)&&task.status==='done'&&task.completedAt&&localDate(task.completedAt)===date){
  const row=rows.get(task.id)??{task,minutesMs:0,completed:false,lastSession:null,summary:''};row.completed=true;if(!row.summary)row.summary=state.reviews.find(r=>r.taskId===task.id)?.outcome??'';rows.set(task.id,row);
 }
 return [...rows.values()].sort((a,b)=>Number(b.completed)-Number(a.completed)||b.minutesMs-a.minutesMs);
}
