import {randomUUID} from 'node:crypto';
import type {JournalState,Task} from './types';
import {localDate} from './types';
import {captureDestinations,type CaptureDraft} from './capture';
import {assertParentAvailable,outlineIndex,moveRelative} from './outline';
import {required,text,number,day,deadline,instant} from './validation';
import {captureDraftErrors} from './capture-validation';
import {attachTag} from './organizing';
import {setItemReminder} from './item-reminders';
import {isTask,isNote,isEvent} from './item-kind';

/** Validation and writes share the service's single SQLite transaction. */
export function createCapture(s:JournalState,p:Record<string,unknown>,now:string):Task{
 const d=p.draft as CaptureDraft;if(!d||!['task','note','event'].includes(d.itemType))throw new Error('记录类型无效。');
 const errors=captureDraftErrors(d);if(errors.length)throw new Error(errors.join(' '));
 let parentId=p.parentId==null?null:required(p.parentId,100);
 if(d.parentQuery){const matches=captureDestinations(s,required(d.parentQuery,2000));if(matches.length!==1)throw new Error(matches.length?'归属有重名，请填写完整路径。':'找不到归属，请检查路径。');parentId=matches[0].id;}
 assertParentAvailable(s,parentId);
 const item:Task={id:randomUUID(),title:required(d.title),itemType:d.itemType,parentId,order:(outlineIndex(s).children.get(parentId)??[]).length,projectId:null,description:text(d.description??''),outcome:'',nextAction:'',status:'open',createdAt:now,startedAt:null,completedAt:null,estimateMinutes:d.estimateMinutes==null?null:number(d.estimateMinutes),plannedDate:d.plannedDate?day(d.plannedDate):null,dueAt:d.dueAt?deadline(d.dueAt):null,eventAt:d.eventAt?deadline(d.eventAt):isEvent(d)?localDate(now):null,eventEnd:d.eventEnd?instant(d.eventEnd):null,tagIds:[]};
 if(d.remindAt)setItemReminder(item,instant(d.remindAt));
 s.tasks.push(item);for(const name of d.tagNames)attachTag(s,item.id,name);
 if(p.afterId&&!d.parentQuery){const anchor=outlineIndex(s).nodes.get(String(p.afterId));if(!anchor||anchor.parentId!==parentId)throw new Error('新增位置已改变，请重新选择。');moveRelative(s,item.id,anchor.id,'after');}
 s.settings.selectedTaskId=item.id;return item;
}

export function validateInformation(s:JournalState){
 const recorded=new Set([...s.sessions,...s.estimates,...s.reviews].map(r=>r.taskId));
 for(const t of s.tasks){
  if(!isTask(t)&&(t.isProject||t.status!=='open'||t.estimateMinutes!==null||t.plannedDate||t.dueAt||t.startedAt||t.completedAt||t.focusDate||recorded.has(t.id)))throw new Error('已有执行安排或投入记录，不能还原为笔记或事件；原记录已保留。');
  if(isNote(t)&&t.reminder)throw new Error('笔记不设置提醒，请改为事项或事件。');
  if(!isEvent(t)&&(t.eventAt||t.eventEnd))throw new Error('事件时间只用于事件。');
  if(isEvent(t)){if(!t.eventAt)throw new Error('请设置事件日期。');deadline(t.eventAt);if(t.eventEnd&& (t.eventAt.length===10||Date.parse(instant(t.eventEnd))<=Date.parse(t.eventAt)))throw new Error('事件结束必须晚于开始时刻。');}
  if(t.focusDate)day(t.focusDate);
 }
}
