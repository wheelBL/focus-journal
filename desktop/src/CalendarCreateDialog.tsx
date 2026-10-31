import React,{useEffect,useMemo,useState} from 'react';
import {Button,Field,Modal,useJournal,localDateTimeInput,minuteText,deadlineInputValue,deadlinePayload} from './ui';
import {isNote,isInformation} from '../core/item-kind';
import {CapturePreview,useCaptureDraft} from './SemanticCapture';
import {captureDraftErrors} from '../core/capture-validation';
import {defaultCaptureParent} from '../core/capture-destination';
import {parentOptions} from '../core/outline-options';
import {ParentSelect} from './ParentSelect';
import {DeadlineFields} from './DeadlineEditor';
import {isEffortDestination} from '../core/effort-destination';
import {useDialogAction} from './useDialogAction';
import {reminderEligible} from '../core/item-reminders';
import {outlineIndex,outlinePath} from '../core/outline';
import './calendar-interactions.css';

export function CalendarCreateDialog({start:initialStart,end:initialEnd,initialMode='reminder'}:{start:string;end:string;initialMode?:'reminder'|'event'|'effort'}){
 const {data,run,dialog,notify}=useJournal();
 const [mode,setMode]=useState(initialMode),[start,setStart]=useState(initialStart),[end,setEnd]=useState(initialEnd);
 const [newItem,setNew]=useState(true),[taskId,setTask]=useState(''),[query,setQuery]=useState(''),[title,setTitle]=useState(''),[summary,setSummary]=useState(''),[remind,setRemind]=useState(false);
 const [parentId,setParent]=useState(defaultCaptureParent(data.state)??'__root__'),[startMode,setStartMode]=useState('switch');
 const capture=useCaptureDraft(title,data.now,mode==='event'?'event':'task');
 // Semantic date tokens fill the same editable time fields as pointer selection.
 useEffect(()=>{if(capture.draft.remindAt&&mode==='reminder')setStart(localDateTimeInput(capture.draft.remindAt));},[capture.draft.remindAt]);
 useEffect(()=>{if(mode==='event'&&capture.draft.eventAt&&capture.draft.eventAt.length>10){setStart(localDateTimeInput(capture.draft.eventAt));if(capture.draft.eventEnd)setEnd(localDateTimeInput(capture.draft.eventEnd));}},[capture.draft.eventAt,capture.draft.eventEnd]);
 const {perform,dismiss,saving,error}=useDialogAction(),close=()=>dismiss(()=>dialog(null));
 const index=useMemo(()=>outlineIndex(data.state),[data.state]);
 const destinations=useMemo(()=>parentOptions(index),[index]);
 const candidates=useMemo(()=>data.state.tasks.filter(t=>mode==='effort'?isEffortDestination(data.state,t,index):!isNote(t)&&reminderEligible(data.state,t,index)),[data.state,mode,index]);
 const matches=useMemo(()=>candidates.filter(t=>outlinePath(index,t.id).map(n=>n.title).join(' / ').toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())).slice(0,40),[candidates,query,index]);
 const task=candidates.find(t=>t.id===taskId),creating=mode==='event'||newItem;
 const duration=Date.parse(end)-Date.parse(start),overlaps=mode==='effort'&&task?data.state.sessions.filter(s=>s.taskId!==task.id&&s.segments.some(seg=>Date.parse(start)<Date.parse(seg.end)&&Date.parse(end)>Date.parse(seg.start))).length:0;
 const iso=(value:string)=>Number.isFinite(Date.parse(value))?new Date(value).toISOString():null;
 const draft={...capture.draft,...mode==='event'?{itemType:'event' as const,plannedDate:null,dueAt:null,estimateMinutes:null,eventAt:iso(start),eventEnd:iso(end)}:{},...mode==='reminder'?{remindAt:iso(start)}:{}};
 const draftErrors=new Set(captureDraftErrors(capture.draft)),errors=[...capture.errors.filter(message=>!draftErrors.has(message)),...captureDraftErrors(draft)];
 const model={...capture,draft,errors,setField:((field:string,value:unknown)=>{if(field==='remindAt'&&mode==='reminder'){setStart(localDateTimeInput(value as string));return;}if(mode==='event'&&(field==='eventAt'||field==='eventEnd')){(field==='eventAt'?setStart:setEnd)(localDateTimeInput(value as string));return;}if(field==='itemType'&&value==='event'){setMode('event');return;}if(field==='itemType'&&value==='task'&&mode==='event'){setMode('reminder');return;}capture.setField(field as keyof typeof draft,value as never);}) as typeof capture.setField};
 const save=async(startTimer=false)=>{
  if(await perform(async()=>{
   if(!creating&&!task)throw new Error('请选择这段时间对应的事项。');
   if(creating&&errors.length)throw new Error([...new Set(errors)].join(' '));
   await run(startTimer?{type:'capture.create',payload:{draft,parentId:parentId==='__root__'?null:parentId,start:true,mode:startMode}}:{type:'calendar.save',payload:{mode,taskId:creating?undefined:task!.id,...creating?{draft,parentId:parentId==='__root__'?null:parentId}:{},start:new Date(start).toISOString(),end:mode==='reminder'?undefined:new Date(end).toISOString(),summary,remind}});
  })){notify(startTimer?'已设置提醒并开始计时。':mode==='effort'?'已补记投入，事项的实际开始和累计投入已更新。':mode==='event'?'已添加事件。':'已设置事项提醒。');dialog(null);}
 };
 return <Modal title="安排这段时间" onClose={close} busy={saving}><form className="calendar-create" onSubmit={e=>{e.preventDefault();void save();}}><fieldset disabled={saving} className="dialog-fields">
  <div className="calendar-create-modes" aria-label="添加内容">{([['reminder','设置提醒','到时提醒我'],['event','添加事件','保留一段安排'],['effort','补记投入','已经做过的事']] as const).map(([id,label,hint])=><button key={id} type="button" aria-pressed={mode===id} className={mode===id?'active':''} onClick={()=>setMode(id)}><strong>{label}</strong><small>{hint}</small></button>)}</div>
  {mode!=='event'&&<div className="segmented field"><button type="button" className={newItem?'active':''} onClick={()=>setNew(true)}>新建事项</button><button type="button" className={!newItem?'active':''} onClick={()=>setNew(false)}>关联已有事项</button></div>}
  {creating?<><Field label={mode==='event'?'事件名称':'事项名称'}><input aria-label={mode==='event'?'事件名称':'事项名称'} required value={title} maxLength={2000} onChange={e=>setTitle(e.target.value)} placeholder={mode==='event'?'例如：每周沟通 %团队':'事项名称；支持 #归属 %标签 明天开始'}/></Field><CapturePreview model={model} data={data} parentId={parentId==='__root__'?null:parentId} show={!!title.trim()} disabled={saving}/><details className="capture-options"><summary>{mode==='event'?'归属（可选）':'归属、计划与估计（可选）'}</summary><Field label="放在何处"><ParentSelect options={destinations} value={parentId} onChange={setParent} label="放在何处"/></Field>{mode!=='event'&&!isInformation(draft)&&<><div className="form-grid"><Field label="计划开始"><input aria-label="日历事项计划开始" type="date" value={capture.draft.plannedDate??''} onChange={e=>capture.setField('plannedDate',e.target.value||null)}/></Field><DeadlineFields value={deadlineInputValue(capture.draft.dueAt)} onChange={value=>capture.setField('dueAt',deadlinePayload(value))}/></div><Field label="任务估计（分钟，可稍后填写）"><input aria-label="日历事项估计" type="number" min={1} max={1440} value={capture.draft.estimateMinutes??''} onChange={e=>capture.setField('estimateMinutes',e.target.value?Number(e.target.value):null)}/></Field></>}</details></>:<div className="calendar-item-picker">
   <Field label="查找事项"><input type="search" aria-label="查找事项" value={query} onChange={e=>setQuery(e.target.value)} placeholder="输入名称筛选"/></Field>
   <Field label="关联事项"><select size={Math.min(4,Math.max(2,matches.length+1))} aria-label="关联事项" value={taskId} onChange={e=>setTask(e.target.value)} required><option value="">选择一个事项</option>{task&&!matches.includes(task)&&<option value={task.id}>{task.title}（已选择）</option>}{matches.map(t=><option key={t.id} value={t.id}>{outlinePath(index,t.id).map(n=>n.title).join(' / ')}</option>)}</select></Field>
   {matches.length===40&&<small>显示前 40 项，输入更多文字缩小范围。</small>}{task&&<p className="calendar-form-hint">已选择：{task.title}{mode==='reminder'&&task.reminder?` · 将替换原提醒 ${localDateTimeInput(task.reminder.at).replace('T',' ')}`:''}</p>}
  </div>}
  <div className="form-grid"><Field label={mode==='reminder'?'提醒时间':mode==='effort'?'实际开始':'事件开始'}><input aria-label={mode==='reminder'?'提醒时间':mode==='effort'?'实际开始':'事件开始'} type="datetime-local" required value={start} onChange={e=>setStart(e.target.value)}/></Field>{mode!=='reminder'&&<Field label={mode==='effort'?'实际结束':'事件结束'}><input aria-label={mode==='effort'?'实际结束':'事件结束'} type="datetime-local" required value={end} onChange={e=>setEnd(e.target.value)}/></Field>}</div>
  {mode==='reminder'?<p className="calendar-form-hint">在选区开始时提醒。要保留整段安排，请选择“添加事件”。</p>:<p className="calendar-form-hint">{duration>0&&Number.isFinite(duration)?`时长 ${minuteText(duration)}`:'请设置有效的起止时间'}{mode==='effort'?' · 保存到事项的投入记录':' · 事件不计入实际投入'}</p>}
  {mode==='effort'&&<Field label="这段时间的进展（可选）"><textarea aria-label="这段时间的进展" rows={2} maxLength={2000} value={summary} onChange={e=>setSummary(e.target.value)}/></Field>}
  {mode==='event'&&<label className="calendar-remind-choice"><input type="checkbox" checked={remind} onChange={e=>setRemind(e.target.checked)}/>开始时提醒我</label>}
  {mode==='effort'&&<p className="calendar-form-hint">只补记已经发生的投入，不会自动完成事项。{overlaps>0?'与其他事项有重叠时段，各事项分别累计。':''}</p>}
  {mode==='reminder'&&Date.parse(start)<=Date.parse(data.now)&&<p className="info-line">提醒时间已过去，保存后会立即提示。</p>}
  {error&&<p className="form-error" role="alert">{error}</p>}
  {mode==='reminder'&&creating&&!isInformation(draft)&&data.timers.some(timer=>!timer.paused)&&<Field label="开始时如何处理现有计时"><select aria-label="新事项计时方式" value={startMode} onChange={e=>setStartMode(e.target.value)}><option value="switch">切换：结束其他运行投入，事项不完成</option><option value="concurrent">同时计时</option></select></Field>}
  <footer className="modal-actions"><Button subtle type="button" disabled={saving} onClick={close}>取消</Button><Button primary type="submit" disabled={saving}>{mode==='effort'?'保存投入':mode==='event'?'保存事件':'保存提醒'}</Button>{mode==='reminder'&&creating&&!isInformation(draft)&&<Button type="button" disabled={saving||!title.trim()} onClick={()=>void save(true)}>保存并开始</Button>}</footer>
 </fieldset></form></Modal>;
}
