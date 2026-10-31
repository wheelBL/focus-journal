import React,{useEffect,useRef,useState} from 'react';
import {Alert20Regular} from '@fluentui/react-icons';
import {useJournal,Button,Field,Modal,localDateTimeInput} from './ui';
import {reminderTime,effectiveItemReminder} from '../core/item-reminders';
import type {Task} from '../core/types';
import {useDialogAction} from './useDialogAction';

export function ReminderTimeField({value,onChange}:{value:string;onChange:(value:string)=>void}){
 const {data}=useJournal();
 return <Field label="提醒时间" hint="到时弹出卡片并播放提示音，不会启动计时；应用需保持运行（可留在托盘）。"><input type="datetime-local" aria-label="提醒时间" value={value} onChange={e=>onChange(e.target.value)}/>{value&&Date.parse(value)<=Date.parse(data.now)&&<small>这个时间已过去，保存后会立即提醒。</small>}</Field>;
}
export function ItemReminderControl({task}:{task:Task}){
 const {dialog}=useJournal(),r=effectiveItemReminder(task);
 return <section className="inspector-field item-reminder-control"><label><Alert20Regular/>{task.status==='handed-off'?'跟进提醒':'提醒时间'}</label><button className="text-button" disabled={task.status!=='open'&&task.status!=='handed-off'||!!task.deletedAt||task.archived} onClick={()=>dialog({type:'remind',id:task.id})}>{r?`${localDateTimeInput(reminderTime(task)).replace('T',' ')}${r.state==='dismissed'?' · 已处理':r.state==='pending'?' · 待处理':r.state==='snoozed'?' · 稍后提醒':''}`:'设置提醒'}</button></section>;
}
export function ItemReminderDialog({id}:{id:string}){
 const {data,run,dialog}=useJournal(),task=data.state.tasks.find(t=>t.id===id)!;
 const [value,setValue]=useState(localDateTimeInput(reminderTime(task))),action=useDialogAction(),active=useRef(true);
 useEffect(()=>{active.current=true;return()=>{active.current=false;};},[]);
 const close=()=>action.dismiss(()=>dialog(null));
 const save=async(clear=false)=>{if(await action.perform(()=>run({type:'item-reminder.set',payload:{id,at:clear||!value?null:new Date(value).toISOString()}}))&&active.current)dialog(null);};
 return <Modal title={task.status==='handed-off'?'跟进提醒':'事项提醒'} onClose={close} busy={action.saving}><p className="dialog-task-title">{task.title}</p><form onSubmit={e=>{e.preventDefault();void save();}}><fieldset className="dialog-fields" disabled={action.saving}><ReminderTimeField value={value} onChange={setValue}/>{action.error&&<p role="alert" className="form-error">{action.error}</p>}{action.saving&&<p role="status" className="muted">正在保存提醒…</p>}<footer className="modal-actions">{effectiveItemReminder(task)&&<Button type="button" disabled={action.saving} onClick={()=>void save(true)}>移除提醒</Button>}<Button type="button" disabled={action.saving} onClick={close}>取消</Button><Button primary disabled={action.saving} type="submit">保存提醒</Button></footer></fieldset></form></Modal>;
}
