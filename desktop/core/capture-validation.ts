import type {CaptureDraft} from './capture';
import {day,deadline,instant,number,required,text,validateSchedule} from './validation';

/** Shared draft invariants for preview and atomic save, independent of React and storage. */
export function captureDraftErrors(d:CaptureDraft):string[]{
 const errors:string[]=[],check=(validate:()=>unknown)=>{try{validate();}catch(e){errors.push((e as Error).message);}};
 check(()=>required(d.title));check(()=>text(d.description??''));
 if(!['task','note','event','group'].includes(d.itemType))errors.push('记录类型无效。');
 if(d.plannedDate)check(()=>day(d.plannedDate));if(d.dueAt)check(()=>deadline(d.dueAt));
 if(d.remindAt)check(()=>instant(d.remindAt));if(d.estimateMinutes!==null)check(()=>number(d.estimateMinutes));
 check(()=>validateSchedule(d));
 if(d.itemType!=='task'&&(d.plannedDate||d.dueAt||d.estimateMinutes!==null))errors.push('分组、笔记和事件不设置任务计划、截止或估计；可改为事项，或把识别结果保留为文字。');
 if((d.itemType==='note'||d.itemType==='group')&&d.remindAt)errors.push('分组和笔记不设置提醒；可改为事项或事件。');
 if(d.itemType!=='event'&&(d.eventAt||d.eventEnd))errors.push('事件时间只用于 o 开头的事件。');
 if(d.itemType==='event'){
  if(!d.eventAt)errors.push('请设置事件日期。');else check(()=>deadline(d.eventAt));
  if(d.eventEnd){check(()=>instant(d.eventEnd));if(!d.eventAt||d.eventAt.length===10||Date.parse(d.eventEnd)<=Date.parse(d.eventAt))errors.push('事件结束必须晚于开始时刻。');}
 }
 if(!Array.isArray(d.tagNames)||d.tagNames.length>50)errors.push('单条记录最多 50 个标签。');
 return [...new Set(errors)];
}
