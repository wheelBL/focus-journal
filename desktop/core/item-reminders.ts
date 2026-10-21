import {isNote} from './item-kind';
import {outlineIndex,outlinePath} from './outline';
import type {JournalState,Task,ItemReminder} from './types';

export function reminderEligible(state:JournalState,task:Task,index=outlineIndex(state)){
 return task.status==='open'&&!outlinePath(index,task.id).some(n=>{
  const item=n.record as Task;return item.archived||item.deletedAt||(item.status&&item.status!=='open');
 });
}
export function reminderTime(task:Task){return task.reminder?.state==='snoozed'?task.reminder.snoozedUntil!:task.reminder?.at;}
export function scheduledItems(state:JournalState){const candidates=state.tasks.filter(t=>t.reminder&&t.reminder.state!=='dismissed');if(!candidates.length)return [];const index=outlineIndex(state);return candidates.filter(t=>reminderEligible(state,t,index));}
export function setItemReminder(task:Task,value:unknown){if(isNote(task))throw new Error('笔记／信息不设置提醒。');
 if(value===null||value===''){task.reminder=null;return;}
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value)||!Number.isFinite(Date.parse(value)))throw new Error('请选择有效的提醒日期和时间。');
 if(task.status!=='open'||task.deletedAt||task.archived)throw new Error('请先恢复事项，再设置提醒。');
 const at=new Date(value).toISOString();
 if(task.reminder?.at===at)return;
 task.reminder={at,state:'scheduled',snoozedUntil:null};
}
export function validateItemReminder(value:unknown){
 if(value===undefined||value===null)return;
 const r=value as ItemReminder,stamp=(v:unknown)=>typeof v==='string'&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString()===v;
 if(!stamp(r.at)||!['scheduled','pending','snoozed','dismissed'].includes(r.state)||(r.state==='snoozed'?!stamp(r.snoozedUntil):r.snoozedUntil!==null))throw new Error('备份中的事项提醒无效。');
}
