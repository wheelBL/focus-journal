import React from 'react';
import {sessionTitle} from '../core/session-label';
import type {CalendarEntry} from './calendar-layout';
import {timeText,useJournal} from './ui';
import type {useCalendarActions} from './CalendarActions';

export function CalendarTimeEntry({entry,hourHeight,colorStyle,actions,compact=false,date}:{entry:CalendarEntry;hourHeight:number;colorStyle:(id:string|null)=>React.CSSProperties;actions:ReturnType<typeof useCalendarActions>;compact?:boolean;date?:string}){
 const {data,dialog}=useJournal(),isEffort=entry.kind==='effort';
 const id=isEffort?entry.session.id:entry.task.id,itemId=isEffort?entry.session.taskId:entry.task.id;
 const title=isEffort?sessionTitle(data.state,itemId):entry.task.title;
 const from=isEffort?entry.session.segments[entry.index].start:entry.at;
 const end=isEffort?entry.session.segments[entry.index].end:entry.kind==='event'?entry.task.eventEnd:null;
 const time=`${timeText(from)}${end?`–${timeText(end)}`:''}`,height=entry.height*hourHeight/48,tiny=height<18;
 const type=isEffort?entry.session.manual?'补记投入':'计时投入':entry.kind==='reminder'?'提醒':'事件';
 const classes=`calendar-item-color ${compact?'calendar-compact-entry':'calendar-event'} ${!compact&&tiny?'calendar-tiny':''} ${entry.kind==='reminder'?'calendar-reminder':''} ${entry.kind==='event'?'calendar-scheduled-event':''} ${isEffort&&entry.session.manual?'manual':''} ${itemId===null?'unassigned':''}`;
 const geometry=compact?{}:{top:entry.top*hourHeight/48,height:Math.max(entry.kind==='reminder'?2:1,height),left:`calc(${entry.lane/entry.lanes*100}% + 3px)`,width:`calc(${100/entry.lanes}% - 6px)`,right:'auto'};
 return <button className={classes} style={{...colorStyle(itemId),...geometry}} data-session-id={isEffort?id:undefined} data-item-id={itemId??undefined} data-calendar-kind={entry.kind}
  {...actions.entryProps(entry.kind,id)} title={`${type} · ${title} · ${time} · 右键操作`} aria-label={`${title}，${type} ${time}`}
  onClick={()=>isEffort?actions.showRecord(id):dialog({type:'detail',id})}>
  <strong>{entry.kind==='event'?'○ ':''}{title}</strong>{(compact||height>35)&&<span>{compact?`${date?.slice(5)} · ${type} · `:''}{time}</span>}
 </button>;
}
