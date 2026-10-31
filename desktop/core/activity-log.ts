import {randomUUID} from 'node:crypto';
import type {Command,JournalState} from './types';
import type {BusinessActivity} from './activity';
const taskFields=['title','description','parentId','order','isProject','status','completedAt','completionBy','ownership','plannedDate','dueAt','focusDate','availability','deletedAt','tagIds','reminder','reviewSchedule','recurrence','eventAt','eventEnd','estimateMinutes'] as const;
export function appendActivity(before:JournalState,after:JournalState,command:Command,at:string){
 if(['task.select','activity.import'].includes(command.type)||command.type.startsWith('usage.'))return;
 const changes:BusinessActivity['changes']=[];
 const add=(entityId:string,title:string,field:string,a:unknown,b:unknown)=>{if(JSON.stringify(a)!==JSON.stringify(b))changes.push({entityId,title,field,...JSON.parse(JSON.stringify({before:a??null,after:b??null}))});};
 const oldTasks=new Map(before.tasks.map(t=>[t.id,t]));
 for(const task of after.tasks){const old=oldTasks.get(task.id);if(!old){add(task.id,task.title,'created',null,{title:task.title,parentId:task.parentId??null});continue;}for(const field of taskFields)add(task.id,task.title,field,old[field],task[field]);}
 const taskIds=new Set(after.tasks.map(t=>t.id));for(const old of before.tasks)if(!taskIds.has(old.id))add(old.id,old.title,'removed',true,false);
 for(const kind of ['sessions','deletedSessions','estimates','reviews','itemReviews','tags','views'] as const){const old=new Map((before[kind]??[]).map(r=>[r.id,r]));for(const r of after[kind]??[]){const prev=old.get(r.id);if(kind==='sessions'&&prev){const a=prev as import('./types').Session,b=r as import('./types').Session;if(a.status===b.status&&a.taskId===b.taskId&&a.summary===b.summary&&!['session.manual','focus.set-start'].includes(command.type))continue;}
  if(JSON.stringify(prev)!==JSON.stringify(r)){const taskId='taskId' in r?r.taskId:'itemId' in r?r.itemId:null;const compact=(v:unknown)=>{if(!v||!['sessions','deletedSessions'].includes(kind))return v;const {id,taskId,date,start,end,status,durationMs,summary,targetOffsetMs}=v as import('./types').Session;return {id,taskId,date,start,end,status,durationMs,summary,targetOffsetMs};};add(typeof taskId==='string'?taskId:r.id,after.tasks.find(t=>t.id===taskId)?.title??('name'in r?String(r.name):kind),kind,compact(prev??null),compact(r));}}
  const nextIds=new Set((after[kind]??[]).map(r=>r.id));for(const r of before[kind]??[])if(!nextIds.has(r.id))add('taskId'in r&&typeof r.taskId==='string'?r.taskId:r.id,kind,kind,r,null);
 }
 if(!changes.length)return;
 const meta=command.meta;
 (after.activities??=[]).push({id:randomUUID(),at,operation:command.type,source:meta?.source??'user',entry:meta?.entry??'unspecified',version:meta?.version??'unknown',...meta?.aiRunId?{aiRunId:meta.aiRunId}:{},changes:changes.slice(0,200),...changes.length>200?{truncated:true}:{}});
}
export function validateActivityState(state:JournalState){
 if(state.activities===undefined&&state.schemaVersion<18)return;
 if(!Array.isArray(state.activities)||state.activities.length>200000)throw Error('活动记录无效。');
 const ids=new Set<string>();for(const a of state.activities){if(!a||typeof a.id!=='string'||!a.id||ids.has(a.id)||!Number.isFinite(Date.parse(a.at))||typeof a.operation!=='string'||a.operation.length>100||!['user','ai','api','sync','system'].includes(a.source)||typeof a.entry!=='string'||a.entry.length>150||typeof a.version!=='string'||a.version.length>60||!Array.isArray(a.changes)||a.changes.length>200)throw Error('活动记录无效。');ids.add(a.id);for(const c of a.changes)if(!c||typeof c.entityId!=='string'||typeof c.title!=='string'||typeof c.field!=='string'||JSON.stringify(c).length>1000000)throw Error('活动记录内容无效。');}
}
