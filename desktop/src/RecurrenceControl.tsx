import {ReminderConvertDialog} from './ReminderContent';
import React,{useEffect,useRef,useState} from 'react';
import {ArrowRepeatAll20Regular} from '@fluentui/react-icons';
import type {Task,Recurrence} from '../core/types';
import {isEvent,isReminder,isTask} from '../core/item-kind';
import {recurrenceBase,recurrenceLabel,nextOccurrence,validateRecurrence} from '../core/recurrence';
import {localDate} from '../core/types';
import {useJournal,Button,Field,Modal} from './ui';
import {useDialogAction} from './useDialogAction';
import './recurrence.css';

export function RecurrenceControl({task,initialOpen=false,onSavingChange}:{task:Task;initialOpen?:boolean;onSavingChange?:(saving:boolean)=>void}){
 const {data,run,busy,notify}=useJournal(),[open,setOpen]=useState(initialOpen),[converting,setConverting]=useState(false),action=useDialogAction(),active=useRef(true);
 useEffect(()=>{active.current=true;return()=>{active.current=false;};},[]);
 const base=isReminder(task)&&task.reminder?localDate(task.reminder.at):recurrenceBase(task,data.now);
 const initial=():Recurrence=>task.recurrence??{mode:'calendar',unit:'day',interval:1,anchor:base,weekdays:[new Date(`${base}T12:00:00`).getDay()],until:null};
 const [rule,setRule]=useState<Recurrence>(initial);
 useEffect(()=>{setRule(initial());},[task.id,JSON.stringify(task.recurrence)]);
 const event=isEvent(task),reminder=isReminder(task),editable=task.status==='open'&&!task.deletedAt&&!task.archived;
 const change=(values:Partial<Recurrence>)=>{setRule({...rule,...values});};
 let next:string|null=null;try{next=nextOccurrence(validateRecurrence(rule),rule.mode==='completion'?localDate(data.now):base);}catch{}
 const save=async(value:Recurrence|null)=>{if(await action.perform(async()=>{onSavingChange?.(true);try{return await run({type:'recurrence.set',payload:{id:task.id,rule:value}});}finally{if(active.current)onSavingChange?.(false);}})&&active.current){setOpen(false);notify(value?'重复安排已保存':'已停止后续重复，本次内容保留');}};
 return <section className="recurrence-control" aria-label="重复安排">
  <div className="recurrence-heading"><span><ArrowRepeatAll20Regular/>重复</span><Button subtle disabled={!editable||action.saving} onClick={()=>setOpen(!open)}>{task.recurrence?recurrenceLabel(task.recurrence):'不重复'}</Button></div>
  {converting&&<ReminderConvertDialog id={task.id} initialRule={rule} onClose={()=>setConverting(false)}/>}
  {!reminder&&task.recurrenceNextId&&<p className="recurrence-help">本次已生成下一次，修改后续安排请打开下一次事项。</p>}
  {open&&editable&&<div className="recurrence-editor" aria-busy={action.saving}><fieldset className="dialog-fields" disabled={action.saving}>
   {!event&&!reminder&&<Field label="重复方式"><select aria-label="重复方式" value={rule.mode} onChange={e=>change({mode:e.target.value as Recurrence['mode']})}><option value="calendar">按固定日历</option><option value="completion">完成后间隔</option></select></Field>}
   <div className="recurrence-interval"><Field label="间隔"><input aria-label="重复间隔" type="number" min="1" max="365" value={rule.interval} onChange={e=>change({interval:Number(e.target.value)})}/></Field><Field label="周期"><select aria-label="重复周期" value={rule.unit} onChange={e=>change({unit:e.target.value as Recurrence['unit']})}><option value="day">天</option><option value="week">周</option><option value="month">月</option><option value="year">年</option></select></Field></div>
   {rule.mode==='calendar'&&rule.unit==='week'&&<fieldset className="recurrence-weekdays"><legend>重复在</legend>{[1,2,3,4,5,6,0].map(d=><label key={d}><input type="checkbox" aria-label={`每周${['日','一','二','三','四','五','六'][d]}`} checked={rule.weekdays.includes(d)} onChange={e=>change({weekdays:e.target.checked?[...rule.weekdays,d]:rule.weekdays.filter(v=>v!==d)})}/><span>{['日','一','二','三','四','五','六'][d]}</span></label>)}</fieldset>}
   <Field label="结束日期（包含当天，可留空）"><input aria-label="重复结束日期" type="date" min={rule.anchor} value={rule.until??''} onChange={e=>change({until:e.target.value||null})}/></Field>
   <p className="recurrence-help">{reminder?'按固定日历提醒；知道了以后等待下一次，不需要完成，也不生成待办。':event?'按事件首次日期重复。日历展示整组安排，修改这里会影响整组；提醒处理后进入下一次。':rule.mode==='calendar'?'完成本次后，沿原日历周期生成下一次；错过的周期跳到下一个未来日期。':'完成本次后，从实际完成日计算间隔，再生成下一次。'}{!event&&!reminder&&' 本次记录保留；只重复本事项，子项不自动复制。'}</p>
   {rule.mode==='calendar'&&<p className="recurrence-help">日历基准：{rule.anchor}{['month','year'].includes(rule.unit)?' · 无对应日期时取当月最后一天':''}</p>}
   <p className="recurrence-preview">{next?`${rule.mode==='completion'?'若今天完成，下次':'下一次'}：${next}`:'设置结束后不再生成下一次'}</p>
   {action.error&&<p role="alert" className="form-error">{action.error}</p>}{action.saving&&<p role="status" className="muted">正在保存重复安排…</p>}
   <div className="actions"><Button primary disabled={busy||action.saving} onClick={()=>void save(rule)}>保存重复</Button>{task.recurrence&&<Button disabled={busy||action.saving} onClick={()=>void save(null)}>停止重复</Button>}<Button subtle disabled={action.saving} onClick={()=>{setRule(initial());setOpen(false);}}>收起</Button></div>
   {isTask(task)&&<Button subtle disabled={busy||action.saving} onClick={()=>setConverting(true)}>改为纯提醒…</Button>}
  </fieldset></div>}
 </section>;
}
export function RecurrenceDialog({id}:{id:string}){
 const {data,dialog}=useJournal(),task=data.state.tasks.find(t=>t.id===id),[saving,setSaving]=useState(false),pending=useRef(false);
 const savingChanged=(value:boolean)=>{pending.current=value;setSaving(value);};
 return <Modal title="重复安排" onClose={()=>{if(!pending.current)dialog(null);}} busy={saving}>{task&&<><h3>{task.title}</h3><RecurrenceControl task={task} initialOpen onSavingChange={savingChanged}/></>}</Modal>;
}
