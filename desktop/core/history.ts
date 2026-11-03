import type {JournalState, Task, Command} from './types';
import {ruleTagIds,rulesFor} from './filter-rules';
import {isBatchLifecycle} from './batch-model';
import {assertParentAvailable,openDescendants,outlineIndex} from './outline';
import {blockedReason} from './item-state';

// Only business fields are reversible. Clock, effort, activity and audit records stay live.
const fields: (keyof Task)[]=['title','description','relatedTaskIds','itemType','eventAt','eventEnd','focusDate','isProject','archived','availability','deletedAt','reviewSchedule','reminder','tagIds','outcome','nextAction','parentId','order','reminderRecurrence','recurrence','recurrenceNextId','recurrencePreviousId','estimateMinutes','plannedDate','dueAt','status','completedAt','ownership','completionBy','reminderHistory','groupHistory'];
const same=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
const clone=<T>(v:T):T=>structuredClone(v);
type Change={id:string;key:keyof Task;before:unknown;after:unknown};
type RecordChange<T>={id:string;before:T|undefined;after:T|undefined};
export interface HistoryEntry {label:string;category:'state'|'organize'|'move';apply:(s:JournalState,direction:'undo'|'redo')=>void}
export function historyLabel(command:Command):{label:string;category:HistoryEntry['category']}|null {
 const p=command.payload??{},t=command.type;
 if(['item.change','task.status','item.handoff','item.reclaim','item.completion'].includes(t)||t==='focus.stop'&&p.complete===true||t==='items.batch'&&isBatchLifecycle(p.action))return {label:'事项状态',category:'state'};
 if(t==='outline.move')return {label:'移动事项',category:'move'};
 if(['outline.create','capture.create','reminder.create','note.create-task'].includes(t)||((t==='task.save'||t==='project.save')&&!p.id))return {label:'新增事项',category:'organize'};
 if(['note.update','note.link-task','note.unlink-task','reminder.update','item-reminder.set','reminder.schedule','reminder.stop','reminder.convert','inbox.organize','recurrence.set','items.batch','item.focus','event.save','outline.patch','task.plan','task.save','project.save','project.archive','item-review.configure','item-review.defer'].includes(t)||t.startsWith('tag.'))return {label:t.startsWith('tag.')?'修改标签':'编辑事项',category:'organize'};
 return null;
}
export function makeHistoryEntry(before:JournalState,after:JournalState,meta:{label:string;category:HistoryEntry['category']}):HistoryEntry|null {
 const changes:Change[]=[],beforeTasks=new Map(before.tasks.map(t=>[t.id,t])),afterTasks=new Map(after.tasks.map(t=>[t.id,t]));
 const beforeTags=new Map(before.tags.map(t=>[t.id,t])),afterTags=new Map(after.tags.map(t=>[t.id,t])),afterViews=new Map(after.views.map(v=>[v.id,v]));
 for(const a of before.tasks){const b=afterTasks.get(a.id);if(b)for(const key of fields)if(!same(a[key],b[key]))changes.push({id:a.id,key,before:clone(a[key]),after:clone(b[key])});}
 const created=after.tasks.filter(t=>!beforeTasks.has(t.id)).map(clone);
 const tags:RecordChange<JournalState['tags'][number]>[]=[...new Set([...before.tags,...after.tags].map(t=>t.id))].map(id=>({id,before:clone(beforeTags.get(id)),after:clone(afterTags.get(id))})).filter(c=>!same(c.before,c.after));
 const views=before.views.map(v=>({id:v.id,before:clone(v.filter),after:clone(afterViews.get(v.id)?.filter)})).filter(v=>!same(v.before,v.after));
 if(!changes.length&&!created.length&&!tags.length&&!views.length)return null;
 return {...meta,apply(s,direction){
  const from=direction==='undo'?'after':'before',to=direction==='undo'?'before':'after';
  const fail=()=>{throw new Error('事项或相关内容已有变化，无法安全撤销或重做，请先检查当前内容。');};
  const tasksById=new Map(s.tasks.map(t=>[t.id,t])),viewsById=new Map(s.views.map(v=>[v.id,v])),tagsById=new Map(s.tags.map(t=>[t.id,t]));
  for(const c of changes){const task=tasksById.get(c.id);if(!task||!same(task[c.key],c[from]))fail();}
  for(const c of tags)if(!same(tagsById.get(c.id),c[from]))fail();
  for(const c of views)if(!same(viewsById.get(c.id)?.filter,c[from]))fail();
  const indexBefore=outlineIndex(s),active=s.sessions.filter(x=>x.status!=='ended'&&x.taskId!==null).map(x=>({id:x.taskId!,reason:blockedReason(indexBefore,x.taskId!)}));
  const ids=new Set(created.map(t=>t.id));
  for(const item of created){const current=tasksById.get(item.id);
   if(direction==='redo'){if(current)fail();continue;}
   if(!current||fields.some(k=>!same(current[k],item[k]))||current.startedAt!==item.startedAt||s.tasks.some(t=>!ids.has(t.id)&&(t.parentId===item.id||(t.relatedTaskIds?.includes(item.id)&&!changes.some(c=>c.id===t.id&&c.key==='relatedTaskIds'))||t.recurrencePreviousId===item.id||(t.recurrenceNextId===item.id&&!changes.some(c=>c.id===t.id&&c.key==='recurrenceNextId'))))||s.sessions.some(x=>x.taskId===item.id)||s.deletedSessions.some(x=>x.taskId===item.id)||s.estimates.some(x=>x.taskId===item.id)||s.reviews.some(x=>x.taskId===item.id)||s.itemReviews.some(x=>x.itemId===item.id)||s.notes.some(x=>x.taskId===item.id))fail();
  }
  for(const c of changes){const task=tasksById.get(c.id)!;if(c[to]===undefined)delete (task as any)[c.key];else (task as any)[c.key]=clone(c[to]);}
  if(direction==='undo'){s.tasks=s.tasks.filter(t=>!ids.has(t.id));s.projects=s.projects.filter(p=>!ids.has(p.id));if(s.settings.selectedTaskId&&ids.has(s.settings.selectedTaskId))s.settings.selectedTaskId=null;}else s.tasks.push(...clone(created));
  for(const id of [...changes.filter(c=>c.key==='parentId').map(c=>c.id),...(direction==='redo'?created.map(t=>t.id):[])])assertParentAvailable(s,s.tasks.find(t=>t.id===id)?.parentId??null);
  const indexAfter=outlineIndex(s);for(const timer of active)if(!timer.reason&&blockedReason(indexAfter,timer.id))throw new Error('事项已有变化，且已有执行安排或正在计时，请先结束或处理计时后再撤销或重做。');
  for(const c of changes.filter(c=>c.key==='status'&&(c[to]==='done'||c[to]==='cancelled')))if(openDescendants(s,c.id).length)fail();
  for(const c of views)viewsById.get(c.id)!.filter=clone(c[to]!);
  for(const c of tags){const value=c[to],i=s.tags.findIndex(t=>t.id===c.id);if(!value){if(s.tasks.some(t=>t.tagIds?.includes(c.id))||s.views.some(v=>ruleTagIds(rulesFor(v.filter)).includes(c.id)))fail();if(i>=0)s.tags.splice(i,1);}else if(i<0)s.tags.push(clone(value));else s.tags[i]=clone(value);}
 }};
}
