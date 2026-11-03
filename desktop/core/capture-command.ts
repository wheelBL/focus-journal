import {randomUUID} from 'node:crypto';
import type {JournalState,Task} from './types';
import {localDate} from './types';
import {type CaptureDraft} from './capture';
import {resolveCaptureParent} from './capture-destination';
import {assertParentAvailable,outlineIndex,moveRelative} from './outline';
import {required,text,number,day,deadline,instant} from './validation';
import {captureDraftErrors} from './capture-validation';
import {attachTag} from './organizing';
import {setItemReminder} from './item-reminders';
import {isTask,isNote,isEvent,isGroup,isReminder} from './item-kind';

/** Validation and writes share the service's single SQLite transaction. */
export function createCapture(s:JournalState,p:Record<string,unknown>,now:string):Task{
 const d=p.draft as CaptureDraft;if(!d||!['task','note','event','group'].includes(d.itemType))throw new Error('记录类型无效。');
 const errors=captureDraftErrors(d);if(errors.length)throw new Error(errors.join(' '));
 const {parentId,useAfterId}=resolveCaptureParent(s,p,d);
 assertParentAvailable(s,parentId);
 const item:Task={id:randomUUID(),title:required(d.title),itemType:d.itemType,parentId,order:(outlineIndex(s).children.get(parentId)??[]).length,projectId:null,description:text(d.description??''),outcome:'',nextAction:'',status:'open',createdAt:now,startedAt:null,completedAt:null,estimateMinutes:d.estimateMinutes==null?null:number(d.estimateMinutes),plannedDate:d.plannedDate?day(d.plannedDate):null,dueAt:d.dueAt?deadline(d.dueAt):null,eventAt:d.eventAt?deadline(d.eventAt):isEvent(d)?localDate(now):null,eventEnd:d.eventEnd?instant(d.eventEnd):null,tagIds:[]};
 if(d.remindAt)setItemReminder(item,instant(d.remindAt));
 s.tasks.push(item);for(const name of d.tagNames)attachTag(s,item.id,name);
 if(p.afterId&&useAfterId){const anchor=outlineIndex(s).nodes.get(String(p.afterId));if(!anchor||anchor.parentId!==parentId)throw new Error('新增位置已改变，请重新选择。');moveRelative(s,item.id,anchor.id,'after');}
 s.settings.selectedTaskId=item.id;return item;
}

export function validateInformation(s:JournalState){
 const recorded=new Set([...s.sessions,...s.estimates,...s.reviews].map(r=>r.taskId));
 for(const t of s.tasks){
  if(t.groupHistory&&!isGroup(t))throw new Error('分组历史只能属于分组。');
  if(!isTask(t)&&!isGroup(t)&&!isReminder(t)&&(t.isProject||t.status!=='open'||t.estimateMinutes!==null||t.plannedDate||t.dueAt||t.startedAt||t.completedAt||t.focusDate||recorded.has(t.id)))throw new Error('已有执行安排或投入记录，不能还原为笔记或事件；原记录已保留。');
  if(t.reminderHistory&&!isReminder(t))throw new Error('提醒历史只能属于提醒。');
  if(isReminder(t)&&t.reminder&&Object.keys(t.reminder).sort().join(',')!=='at,snoozedUntil,state')throw new Error('提醒状态无效。');
  if(isReminder(t)&&t.recurrence&&Object.keys(t.recurrence).sort().join(',')!=='anchor,interval,mode,unit,until,weekdays')throw new Error('提醒重复规则无效。');
  if(isReminder(t)&&!t.reminder)throw new Error('提醒缺少时间。');
  if(isReminder(t)&&(t.isProject||t.status!=='open'||t.availability==='paused'||t.estimateMinutes!==null||t.plannedDate||t.dueAt||t.completedAt||t.focusDate||t.reviewSchedule||t.ownership||s.sessions.some(r=>r.taskId===t.id&&r.status!=='ended')||t.recurrence&&t.recurrence.mode!=='calendar'))throw new Error('提醒不能有执行安排或运行中的计时。');
  if(isGroup(t)&&(t.isProject||t.status!=='open'||t.availability==='paused'||t.estimateMinutes!==null||t.plannedDate||t.dueAt||t.completedAt||t.focusDate||t.reminder||t.recurrence||t.reviewSchedule||t.ownership||s.sessions.some(r=>r.taskId===t.id&&r.status!=='ended')))throw new Error('分组不能有执行安排或运行中的计时。');
  if(isNote(t)&&t.reminder)throw new Error('笔记不设置提醒，请改为事项或事件。');
  if(!isEvent(t)&&(t.eventAt||t.eventEnd))throw new Error('事件时间只用于事件。');
  if(isEvent(t)){if(!t.eventAt)throw new Error('请设置事件日期。');deadline(t.eventAt);if(t.eventEnd&& (t.eventAt.length===10||Date.parse(instant(t.eventEnd))<=Date.parse(t.eventAt)))throw new Error('事件结束必须晚于开始时刻。');}
  if(t.focusDate)day(t.focusDate);
 }
}
