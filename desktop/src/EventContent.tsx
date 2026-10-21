import React,{useEffect,useState} from 'react';
import type {Task} from '../core/types';
import {localDate} from '../core/types';
import {Field,Button,useJournal,localDateTimeInput} from './ui';
import {RecurrenceControl} from './RecurrenceControl';
import {NoteContent} from './NoteContent';
import {ItemReminderControl} from './ItemReminder';
export function EventContent({task,onEdit}:{task:Task;onEdit?:()=>void}){
 const {run,busy}=useJournal(),[at,setAt]=useState(task.eventAt?.length===10?task.eventAt:localDateTimeInput(task.eventAt)),[end,setEnd]=useState(localDateTimeInput(task.eventEnd)),[error,setError]=useState('');
 useEffect(()=>{setAt(task.eventAt?.length===10?task.eventAt:localDateTimeInput(task.eventAt));setEnd(localDateTimeInput(task.eventEnd));},[task.eventAt,task.eventEnd,task.id]);
 return <div className="event-information"><p className="info-line">事件记录发生或预计发生的事情，不计入投入。</p><Field label="事件日期或开始时刻"><input type={at.length===10?'date':'datetime-local'} value={at} onChange={e=>setAt(e.target.value)}/></Field><Button subtle onClick={()=>{setAt(at.length===10?`${at}T09:00`:at.slice(0,10)||localDate());setEnd('');}}>{at.length===10?'添加具体时刻':'只记录日期'}</Button>{at.length!==10&&<Field label="结束时刻（可选）"><input type="datetime-local" value={end} onChange={e=>setEnd(e.target.value)}/></Field>}<Button disabled={busy||!at} onClick={()=>{onEdit?.();void run({type:'event.save',payload:{id:task.id,at:at.length===10?at:new Date(at).toISOString(),end:end?new Date(end).toISOString():null}}).then(()=>setError('')).catch(e=>setError(e.message));}}>保存事件时间</Button>{error&&<p role="alert">{error}</p>}<ItemReminderControl task={task}/><RecurrenceControl task={task}/><NoteContent task={task} onEdit={onEdit}/></div>;
}
