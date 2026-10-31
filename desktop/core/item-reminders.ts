import {isNote} from './item-kind';
import {outlineNodes,type OutlineIndex} from './outline';
import type {JournalState,Task,ItemReminder} from './types';

type ReminderTopology=Pick<OutlineIndex,'nodes'>;
/** Reminders depend on ancestor lifecycle, never on ordering, estimates or historical effort. */
export function reminderEligibility(state:JournalState,index:ReminderTopology={nodes:new Map(outlineNodes(state).map(n=>[n.id,n]))}){
 const memo=new Map<string,boolean>();
 return (task:Task)=>{
  if(task.status!=='open'&&!(task.status==='handed-off'&&task.ownership?.followUp))return false;
  const trail:string[]=[],seen=new Set<string>();let node=index.nodes.get(task.id),allowed=true;
  while(node&&!memo.has(node.id)&&!seen.has(node.id)){
   seen.add(node.id);trail.push(node.id);const record=node.record as Task;
   if(record.archived||record.deletedAt||record.status&&record.status!=='open'&&record.status!=='handed-off'){allowed=false;break;}
   node=node.parentId?index.nodes.get(node.parentId):undefined;
  }
  if(node&&memo.has(node.id))allowed=memo.get(node.id)!;
  for(const id of trail)memo.set(id,allowed);
  return allowed;
 };
}
export function reminderEligible(state:JournalState,task:Task,index?:ReminderTopology){
 return reminderEligibility(state,index)(task);
}
export function effectiveItemReminder(task:Task){return task.ownership?(task.ownership.followUp?task.ownership.reminder:null):task.reminder;}
export function reminderTime(task:Task){const r=effectiveItemReminder(task);return r?.state==='snoozed'?r.snoozedUntil!:r?.at;}
export function scheduledItems(state:JournalState){const candidates=state.tasks.filter(t=>effectiveItemReminder(t)&&effectiveItemReminder(t)!.state!=='dismissed');if(!candidates.length)return [];return candidates.filter(reminderEligibility(state));}
export function setItemReminder(task:Task,value:unknown){if(isNote(task))throw new Error('笔记／信息不设置提醒。');
 const ownership=task.status==='handed-off'?task.ownership:null;
 if(value===null||value===''){if(ownership)ownership.reminder=null;else task.reminder=null;return;}
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value)||!Number.isFinite(Date.parse(value)))throw new Error('请选择有效的提醒日期和时间。');
 if(task.status!=='open'&&!ownership||task.deletedAt||task.archived)throw new Error('请先恢复事项，再设置提醒。');
 const at=new Date(value).toISOString();
 const current=ownership?ownership.reminder:task.reminder;if(current?.at===at&&current.state!=='dismissed')return;
 const next:ItemReminder={at,state:'scheduled',snoozedUntil:null};
 if(ownership){ownership.followUp=true;ownership.reminder=next;}else task.reminder=next;
}
export function validateItemReminder(value:unknown){
 if(value===undefined||value===null)return;
 const r=value as ItemReminder,stamp=(v:unknown)=>typeof v==='string'&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString()===v;
 if(!stamp(r.at)||!['scheduled','pending','snoozed','dismissed'].includes(r.state)||(r.state==='snoozed'?!stamp(r.snoozedUntil):r.snoozedUntil!==null))throw new Error('备份中的事项提醒无效。');
}
