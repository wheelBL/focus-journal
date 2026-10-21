import React,{useState} from 'react';
import {Alert20Regular} from '@fluentui/react-icons';
import {useJournal,Button,Field,Modal,localDateTimeInput} from './ui';
import {reminderTime} from '../core/item-reminders';
import type {Task} from '../core/types';

export function ReminderTimeField({value,onChange}:{value:string;onChange:(value:string)=>void}){
 const {data}=useJournal();
 return <Field label="提醒时间" hint="到时弹出卡片并播放提示音，不会启动计时；应用需保持运行（可留在托盘）。"><input type="datetime-local" aria-label="提醒时间" value={value} onChange={e=>onChange(e.target.value)}/>{value&&Date.parse(value)<=Date.parse(data.now)&&<small>这个时间已过去，保存后会立即提醒。</small>}</Field>;
}
export function ItemReminderControl({task}:{task:Task}){
 const {dialog}=useJournal(),r=task.reminder;
 return <section className="inspector-field item-reminder-control"><label><Alert20Regular/>提醒时间</label><button className="text-button" disabled={task.status!=='open'||!!task.deletedAt||task.archived} onClick={()=>dialog({type:'remind',id:task.id})}>{r?`${localDateTimeInput(reminderTime(task)).replace('T',' ')}${r.state==='dismissed'?' · 已处理':r.state==='pending'?' · 待处理':r.state==='snoozed'?' · 稍后提醒':''}`:'设置提醒'}</button></section>;
}
export function ItemReminderDialog({id}:{id:string}){
 const {data,run,dialog}=useJournal(),task=data.state.tasks.find(t=>t.id===id)!;
 const [value,setValue]=useState(localDateTimeInput(reminderTime(task))),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const save=async(clear=false)=>{if(busy)return;setBusy(true);try{await run({type:'item-reminder.set',payload:{id,at:clear||!value?null:new Date(value).toISOString()}});dialog(null);}catch(e){setError(e instanceof Error?e.message:String(e));}finally{setBusy(false);}};
 return <Modal title="事项提醒" onClose={()=>dialog(null)}><p className="dialog-task-title">{task.title}</p><form onSubmit={e=>{e.preventDefault();void save();}}><ReminderTimeField value={value} onChange={setValue}/>{error&&<p role="alert" className="form-error">{error}</p>}<footer className="modal-actions">{task.reminder&&<Button type="button" disabled={busy} onClick={()=>void save(true)}>移除提醒</Button>}<Button type="button" onClick={()=>dialog(null)}>取消</Button><Button primary disabled={busy} type="submit">保存提醒</Button></footer></form></Modal>;
}
