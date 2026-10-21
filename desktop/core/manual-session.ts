import {randomUUID} from 'node:crypto';
import {localDate,type JournalState,type Session} from './types';
import {requireAction} from './item-kind';
import {day,instant,number,text} from './validation';

/** One write path for inspector corrections, manual entry and calendar selection. */
export function saveManualSession(s:JournalState,p:Record<string,unknown>,now:string):Session{
 const task=s.tasks.find(t=>t.id===p.taskId);if(!task)throw new Error('找不到这个事项。');requireAction(task);
 const previous=p.id?s.sessions.find(x=>x.id===p.id):undefined;
 if(p.id&&!previous)throw new Error('记录不存在。');if(previous&&previous.status!=='ended')throw new Error('请先结束这次专注。');
 let start:string|null=null,end:string|null=null,date=day(p.date),duration=number(p.minutes,0.1,1440)*60000;
 if(Boolean(p.start)!==Boolean(p.end))throw new Error('请同时填写实际开始和实际结束。');
 if(p.start&&p.end){
  start=instant(p.start);end=instant(p.end);duration=Date.parse(end)-Date.parse(start);date=localDate(start);
  if(duration<=0||duration>86400000)throw new Error('结束应晚于开始，单次记录不超过 24 小时。');
  if(Date.parse(end)>Date.parse(now)+1000)throw new Error('实际投入不能记录在未来。');
  const overlap=s.sessions.filter(x=>x.id!==previous?.id&&x.taskId===task.id).some(x=>x.segments.some(seg=>Date.parse(start!)<Date.parse(seg.end)&&Date.parse(end!)>Date.parse(seg.start)));
  if(overlap)throw new Error('这个时间段与同一事项的已有投入重叠，请核对后再保存。');
 }else if(date>localDate(now))throw new Error('实际投入不能记录在未来。');
 if(previous)s.audit.push({id:randomUUID(),entityId:previous.id,before:JSON.stringify(previous),reason:text(p.reason??'手动校正时间'),createdAt:now});
 const record:Session={id:previous?.id??randomUUID(),taskId:task.id,date,start,end,status:'ended',targetMinutes:previous?.targetMinutes??s.settings.targetMinutes,segments:start&&end?[{start,end,durationMs:duration}]:[],durationMs:duration,manual:true,summary:text(p.summary??''),reminded:false,recovered:false,updatedAt:now};
 if(previous)s.sessions[s.sessions.indexOf(previous)]=record;else s.sessions.push(record);
 for(const taskId of new Set([task.id,previous?.taskId].filter(Boolean))){
  const owner=s.tasks.find(t=>t.id===taskId)!;
  owner.startedAt=s.sessions.filter(x=>x.taskId===taskId&&x.start).map(x=>x.start!).sort((a,b)=>Date.parse(a)-Date.parse(b))[0]??null;
 }
 return record;
}
