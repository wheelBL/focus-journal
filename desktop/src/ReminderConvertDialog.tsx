import React,{useEffect,useRef,useState} from 'react';
import type {Recurrence} from '../core/types';
import {localDate} from '../core/types';
import {isTask} from '../core/item-kind';
import {reminderTime} from '../core/item-reminders';
import {validateRecurrence} from '../core/recurrence';
import {Button,Field,Modal,localDateTimeInput,useJournal} from './ui';
import {ReminderTimeField} from './ItemReminder';
import {useDialogAction} from './useDialogAction';

export function ReminderConvertDialog({id,onClose,initialRule}:{id:string;onClose?:()=>void;initialRule?:Recurrence}){
 const {data,run,dialog}=useJournal(),task=data.state.tasks.find(t=>t.id===id),action=useDialogAction(),active=useRef(true);
 useEffect(()=>{active.current=true;return()=>{active.current=false;};},[]);
 const initial=task?localDateTimeInput(reminderTime(task))||(!task.plannedDate&&task.dueAt&&task.dueAt.length>10?localDateTimeInput(task.dueAt):'')||`${task.plannedDate??(task.dueAt?localDate(task.dueAt):localDate(data.now))}T09:00`:'';
 const [at,setAt]=useState(initial),[repeat,setRepeat]=useState(!!initialRule||!!task?.recurrence),[accepted,setAccepted]=useState(false);
 const source=initialRule??task?.recurrence;
 const [rule,setRule]=useState<Recurrence>(()=>({...source,mode:'calendar',unit:source?.unit??'day',interval:source?.interval??1,anchor:initial.slice(0,10),weekdays:source?.weekdays??[new Date(initial).getDay()],until:source?.until??null}));
 if(!task)return <Modal title="转为纯提醒" onClose={()=>dialog(null)}><p>这个事项已不存在。</p></Modal>;
 const blocked=!isTask(task)||task.id==='inbox'||task.status!=='open'||task.deletedAt||task.archived?'请先恢复为未关闭事项，再转为纯提醒。':task.availability==='paused'||task.ownership?'请先恢复事项并收回责任，再转为纯提醒。':data.timers.some(t=>t.taskId===id)?'请先结束此事项正在运行或暂停的计时，再转为纯提醒。':null;
 const change=(values:Partial<Recurrence>)=>setRule({...rule,...values});
 const finish=()=>onClose?onClose():dialog(null);
 const close=()=>action.dismiss(finish);
 const save=async()=>{if(!accepted||blocked)return;if(await action.perform(()=>{if(!at||!Number.isFinite(Date.parse(at)))throw new Error('请选择提醒时间。');const normalized=repeat?validateRecurrence({...rule,mode:'calendar',anchor:at.slice(0,10)}):null;return run({type:'reminder.convert',payload:{id,at:new Date(at).toISOString(),rule:normalized}});})&&active.current)finish();};
 return <Modal title="转为纯提醒" onClose={close} busy={action.saving}><p className="dialog-task-title">{task.title}</p><form onSubmit={e=>{e.preventDefault();void save();}}><fieldset className="dialog-fields" disabled={action.saving}><p>到时弹出提醒，选择“知道了”后等待下一次；不再需要完成，不计入待办或完成统计。</p><ReminderTimeField value={at} onChange={setAt}/><label className="check-field"><input aria-label="重复提醒" type="checkbox" checked={repeat} onChange={e=>setRepeat(e.target.checked)}/>重复提醒</label>{repeat&&<div className="recurrence-editor"><p className="recurrence-help">按固定日历重复，与是否完成无关。首次日期以提醒时间为准。{source?.mode==='completion'&&' 原“完成后间隔”将改为固定日历间隔。'}</p><div className="recurrence-interval"><Field label="间隔"><input aria-label="提醒重复间隔" type="number" min="1" max="365" value={rule.interval} onChange={e=>change({interval:Number(e.target.value)})}/></Field><Field label="周期"><select aria-label="提醒重复周期" value={rule.unit} onChange={e=>change({unit:e.target.value as Recurrence['unit']})}><option value="day">天</option><option value="week">周</option><option value="month">月</option><option value="year">年</option></select></Field></div>{rule.unit==='week'&&<fieldset className="recurrence-weekdays"><legend>重复在</legend>{[1,2,3,4,5,6,0].map(d=><label key={d}><input type="checkbox" aria-label={`提醒每周${['日','一','二','三','四','五','六'][d]}`} checked={rule.weekdays.includes(d)} onChange={e=>change({weekdays:e.target.checked?[...rule.weekdays,d]:rule.weekdays.filter(v=>v!==d)})}/><span>{['日','一','二','三','四','五','六'][d]}</span></label>)}</fieldset>}<Field label="结束日期（包含当天，可留空）"><input aria-label="提醒重复结束日期" type="date" min={at.slice(0,10)} value={rule.until??''} onChange={e=>change({until:e.target.value||null})}/></Field></div>}<p>计划开始、截止时间、估计、审视和项目标记将不再生效；转回事项时恢复这些安排。当前重点会退出，转回时不会自动重新加入。已有投入及历史保留，子项不变。</p><label className="check-field"><input aria-label="确认转为纯提醒" type="checkbox" checked={accepted} onChange={e=>setAccepted(e.target.checked)}/>我已确认上述变化</label>{blocked&&<p role="alert" className="form-error">{blocked}</p>}{action.error&&<p role="alert" className="form-error">{action.error}</p>}{action.saving&&<p role="status">正在转为纯提醒…</p>}<footer className="modal-actions"><Button type="button" disabled={action.saving} onClick={close}>取消</Button><Button primary type="submit" disabled={action.saving||!accepted||!!blocked||!at}>确认转为纯提醒</Button></footer></fieldset></form></Modal>;
}
