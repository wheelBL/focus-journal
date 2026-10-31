import type {JournalState} from './types';
import {localDate} from './types';
import {instant,required,text} from './validation';
import {createCapture} from './capture-command';
import {defaultCaptureParent} from './capture-destination';
import {isInformation,isNote,isEvent} from './item-kind';
import {setItemReminder,reminderEligible} from './item-reminders';
import {configureRecurrence} from './recurrence';
import {saveManualSession} from './manual-session';
import type {CaptureDraft} from './capture';

/** Creation and the associated reminder/effort commit atomically; cancellation writes nothing. */
export function saveCalendarSelection(s:JournalState,p:Record<string,unknown>,now:string){
 const mode=String(p.mode);if(!['reminder','event','effort'].includes(mode))throw new Error('请选择要添加的内容。');
 const start=instant(p.start),end=mode==='reminder'?null:instant(p.end);
 if(end&&Date.parse(end)<=Date.parse(start))throw new Error('结束应晚于开始。');
 let task=p.taskId?s.tasks.find(t=>t.id===p.taskId):undefined;
 if(p.taskId&&!task)throw new Error('找不到这个事项。');
 if(task){
  if(task.deletedAt||task.archived)throw new Error('请先恢复这个事项，再添加记录。');
  if(mode==='event')throw new Error('新事件请填写名称；修改事件请打开原事件。');
  if(mode==='effort'&&isInformation(task)||mode==='reminder'&&isNote(task))throw new Error('请选择可以记录投入或设置提醒的事项。');
  if(mode==='reminder'&&!reminderEligible(s,task))throw new Error('事项或父项已关闭，请先恢复再设置提醒。');
 }else{
  const draft:CaptureDraft=p.draft as CaptureDraft??{title:required(p.title),description:'',itemType:mode==='event'?'event':'task',parentQuery:null,tagNames:[],plannedDate:null,dueAt:null,estimateMinutes:null,remindAt:null,eventAt:mode==='event'?start:null,eventEnd:mode==='event'?end:null};
  if(mode==='effort'&&isInformation(draft)||mode==='reminder'&&isNote(draft)||mode==='event'&&!isEvent(draft))throw new Error('记录类型与日历操作不符，请选择事项或事件。');
  task=createCapture(s,{parentId:Object.hasOwn(p,'parentId')?p.parentId:defaultCaptureParent(s),draft:{...draft,...mode==='event'?{eventAt:start,eventEnd:end}:{} }},now);
 }
 if(mode==='effort')saveManualSession(s,{taskId:task.id,date:localDate(start),minutes:1,start,end,summary:text(p.summary??'')},now);
 else if(mode==='reminder'){
  setItemReminder(task,start);
  if(isEvent(task)&&task.recurrence){delete task.recurrence.reminderOffsetMs;configureRecurrence(task,task.recurrence,now);}
 }else if(p.remind===true)setItemReminder(task,start);
 return task;
}
