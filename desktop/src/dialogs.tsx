import {OwnershipDialog,CompletionDialog} from './Ownership';
import {AiAssistant} from './AiAssistant';
import {requestSettingsSection} from './settings-navigation';
import {SessionAssignment} from './SessionAssignment';
import {SessionStartDialog} from './SessionStart';
import {DiscardEffortDialog,DeletedEffortDialog} from './EffortTrash';
import {useDialogAction} from './useDialogAction';
import {ManualForm} from './ManualEffortDialog';
import {SummaryForm} from './SessionSummary';
import {CalendarCreateDialog} from './CalendarCreateDialog';
import {ParentSelect} from './ParentSelect';
import {parentOptions} from '../core/outline-options';
import {useWorkspaceJournal} from './ui';
import {RecurrenceControl,RecurrenceDialog} from './RecurrenceControl';
import {defaultCaptureParent} from '../core/capture-destination';
import {EventContent} from './EventContent';
import {CapturePreview,useCaptureDraft} from './SemanticCapture';
import {useItemActions} from './useItemActions';
import {captureItem,isEvent,isInformation,isGroup} from '../core/item-kind';
import {NoteContent} from './NoteContent';
import {ItemReminderDialog,ItemReminderControl,ReminderTimeField} from './ItemReminder';
import {KeyboardHelp} from './KeyboardHelp';
import {ReviewScheduleDialog,ReviewScheduleEditor} from './ReviewSchedule';
import {DeadlineFields} from './DeadlineEditor';
import {ItemStateDialog,StartChoiceDialog,LifecycleActions,EstimateFacts} from './ItemActions';
import {estimateProgress} from '../core/item-state';
import React,{useState} from 'react';
import {CheckmarkCircle20Filled,Play20Filled,ArrowRight20Regular,Edit20Regular} from '@fluentui/react-icons';
import {useJournal,Button,Field,Modal,minuteText,timeText,projectName,localDateTimeInput,deadlineText,deadlineInputValue,deadlinePayload,type DialogSpec} from './ui';
import {TagEditor} from './Tags';
import {branchIds,outlineIndex,outlinePath} from '../core/outline';
import {TaskCard} from './TaskCard';
import {localDate,shiftDate,taskMs,type Task} from '../core/types';

export default function Dialogs({spec}:{spec:DialogSpec}){
 const {data,dialog,navigate}=useJournal();
 if(spec.type==='handoff')return <OwnershipDialog id={spec.id!} entry={spec.entry}/>;
 if(spec.type==='completion')return <CompletionDialog id={spec.id!}/>;
 if(spec.type==='ai')return <AiAssistant itemId={spec.id} onClose={()=>dialog(null)} onSettings={()=>{dialog(null);requestSettingsSection('ai');navigate('settings');}}/>;
 if(spec.type==='timer-start')return <SessionStartDialog id={spec.id!}/>;
 if(spec.type==='discard-effort')return <DiscardEffortDialog id={spec.id!}/>;
 if(spec.type==='deleted-effort')return <DeletedEffortDialog close={()=>dialog(null)}/>;
 if(spec.type==='assign'||(['summary','manual'].includes(spec.type)&&spec.id&&data.state.sessions.find(r=>r.id===spec.id)?.taskId===null))return <SessionAssignment id={spec.id!}/>;
 if(spec.type==='calendar')return <CalendarCreateDialog start={spec.start!} end={spec.end!} initialMode={spec.calendarMode}/>;
 if(spec.type==='shortcuts')return <KeyboardHelp/>;
 if(spec.type==='repeat')return <RecurrenceDialog id={spec.id!}/>;
 if(spec.type==='remind')return <ItemReminderDialog id={spec.id!}/>;
 if(spec.type==='schedule')return <ReviewScheduleDialog id={spec.id!} putAside={spec.putAside}/>;
 if(spec.type==='state')return <ItemStateDialog id={spec.id!} action={spec.action!}/>;
 if(spec.type==='start')return <StartChoiceDialog id={spec.id!}/>;
 switch(spec.type){
case 'task':return <TaskForm id={spec.id} initialParent={spec.parentId} initialReminder={spec.remindAt}/>;case 'project':return <ProjectForm id={spec.id}/>;case 'manual':return <ManualForm id={spec.id} initialTask={spec.taskId}/>;case 'estimate':return <EstimateForm id={spec.id!}/>;case 'summary':return <SummaryForm id={spec.id!}/>;case 'review':return <ReviewForm id={spec.id!}/>;case 'plan':return <PlanForm id={spec.id!}/>;case 'detail':return <TaskDetail id={spec.id!}/>;}
}
function useSave(){const {dialog}=useJournal();const action=useDialogAction();const save=async(write:()=>Promise<unknown>,close=true)=>{if(await action.perform(write)&&close)dialog(null);};return {save,error:action.error,saving:action.saving,close:()=>action.dismiss(()=>dialog(null))};}
function FormError({text}:{text:string}){const ref=React.useRef<HTMLDivElement>(null);React.useEffect(()=>{if(text)ref.current?.scrollIntoView({block:'nearest'});},[text]);return text?<div ref={ref} role="alert" className="form-error">{text}</div>:null;}
function TaskForm({id,initialParent,initialReminder}:{id?:string;initialParent?:string;initialReminder?:string}){
 const {data,run,dialog}=useWorkspaceJournal();const task=data.state.tasks.find(t=>t.id===id);
 const [title,setTitle]=useState(task?.title??''),[parentId,setParent]=useState(task?task.parentId??'__root__':initialParent??defaultCaptureParent(data.state)??'__root__'),[estimate,setEstimate]=useState(task?.estimateMinutes?.toString()??''),[planned,setPlanned]=useState(task?.plannedDate??''),[due,setDue]=useState(deadlineInputValue(task?.dueAt));const {save,error,saving,close}=useSave();
 const parentIndex=React.useMemo(()=>outlineIndex(data.state),[data.state]);
 const destinations=React.useMemo(()=>parentOptions(parentIndex,id?[id]:[],task?.parentId),[parentIndex,id,task?.parentId]);
 const capture=useCaptureDraft(title,data.now);
 const [remindAt,setRemindAt]=useState(initialReminder??'');
 const [startMode,setStartMode]=useState('switch');const event=isEvent(task??capture.draft),note=isInformation(task)||!task&&isInformation(capture.draft);
 const persist=(start:boolean)=>{if(!task){if(capture.errors.length)throw new Error(capture.errors.join(' '));return run({type:'capture.create',payload:{parentId:parentId==='__root__'?null:parentId,draft:{...capture.draft,plannedDate:planned||capture.draft.plannedDate,dueAt:due?deadlinePayload(due):capture.draft.dueAt,estimateMinutes:estimate?Number(estimate):capture.draft.estimateMinutes,remindAt:remindAt?new Date(remindAt).toISOString():capture.draft.remindAt},start,mode:startMode}});}return run({type:'task.save',payload:{id,title,parentId:parentId==='__root__'?null:parentId,estimateMinutes:note?null:estimate===''?null:Number(estimate),plannedDate:note?null:planned||null,dueAt:note?null:deadlinePayload(due),...(initialReminder?{remindAt:remindAt?new Date(remindAt).toISOString():null}:{}),start,mode:startMode}});};
 return <Modal title={task?'编辑事项':initialReminder?'新增提醒事项':'新建一件事'} onClose={close} busy={saving}><form onSubmit={e=>{e.preventDefault();void save(()=>persist(false));}}><fieldset className="dialog-fields" disabled={saving}><Field label="事项名称"><input autoFocus required maxLength={120} value={title} onChange={e=>setTitle(e.target.value)} placeholder="写下事项；- 笔记，o 事件"/></Field>{!task&&<CapturePreview model={capture} data={data} parentId={parentId==='__root__'?null:parentId} show={!!title.trim()}/>}{note&&<p className="info-line">{event?'将保存为事件，不计入任务完成和投入。':initialReminder?'笔记不设置提醒；改为事项或事件即可继续。':'将保存为笔记／信息。无需估计、计划或计时。'}</p>}{initialReminder&&(!note||event)&&<ReminderTimeField value={remindAt} onChange={setRemindAt}/>}<details className="capture-options" open={!!task}><summary>{note?'归属（可选）':'归属、计划与估计（可选）'}</summary><Field label="放在何处"><ParentSelect options={destinations} value={parentId} onChange={setParent} label="放在何处"/></Field>{!note&&<><div className="form-grid"><Field label="计划开始" hint="打算哪一天开始，可留空"><input type="date" value={planned} onChange={e=>setPlanned(e.target.value)}/></Field><DeadlineFields value={due} onChange={setDue}/></div><Field label={task?.estimateMinutes!=null?'原始估计（分钟）':'任务估计（分钟，可稍后填写）'} hint={task?.estimateMinutes!=null?'原始估计保留，后续通过“调整估计”更新剩余工作。':'25 分钟 = 1 个标准番茄。这里估计整个任务，本次目标单独设置。'}><input type="number" min={1} max={1440} value={estimate} readOnly={task?.estimateMinutes!=null} onChange={e=>setEstimate(e.target.value)}/></Field></>}</details>{!note&&!task&&data.timers.some(t=>!t.paused)&&<Field label="开始时如何处理现有计时"><select aria-label="新事项计时方式" value={startMode} onChange={e=>setStartMode(e.target.value)}><option value="switch">切换：结束其他运行投入，事项不完成</option><option value="concurrent">同时计时</option></select></Field>}{saving&&<p role="status" className="muted">正在保存…</p>}<FormError text={error}/><footer className="modal-actions"><Button subtle type="button" onClick={close}>取消</Button><Button type="submit" disabled={saving||note&&!event&&!!initialReminder}>{event?'保存事件':note?'保存笔记':'保存事项'}</Button>{!note&&!task&&<Button primary type="button" disabled={saving||!title.trim()} onClick={()=>void save(()=>persist(true))}>保存并开始</Button>}</footer></fieldset></form></Modal>;
}
function ProjectForm({id}:{id?:string}){
 const {data,run,dialog}=useJournal();const project=data.state.projects.find(p=>p.id===id);const [name,setName]=useState(project?.name??''),[description,setDescription]=useState(project?.description??'');const {save,error,saving,close}=useSave();
 return <Modal title={project?'编辑项目':'新建项目'} onClose={close} busy={saving}><form onSubmit={e=>{e.preventDefault();void save(()=>run({type:'project.save',payload:{id,name,description}}));}}><fieldset className="dialog-fields" disabled={saving}><Field label="项目名称"><input autoFocus required maxLength={120} value={name} onChange={e=>setName(e.target.value)}/></Field><Field label="项目想达成什么"><textarea rows={3} maxLength={2000} value={description} onChange={e=>setDescription(e.target.value)}/></Field>{saving&&<p role="status" className="muted">正在保存…</p>}<FormError text={error}/><footer className="modal-actions">{project&&<Button type="button" disabled={saving} onClick={()=>void save(()=>run({type:'project.archive',payload:{id}}))}>归档项目</Button>}<Button primary type="submit" disabled={saving}>保存项目</Button></footer></fieldset></form></Modal>;
}
function EstimateForm({id}:{id:string}){
 const {data,run,dialog}=useJournal(),task=data.state.tasks.find(t=>t.id===id)!,progress=estimateProgress(data.state,id);
 const [minutes,setMinutes]=useState(progress.exhausted?'':String(progress.remaining??25)),[reason,setReason]=useState('');const {save,error,saving,close}=useSave();
 return <Modal title="调整剩余估计" onClose={close} busy={saving}><form onSubmit={e=>{e.preventDefault();void save(()=>run({type:'estimate.add',payload:{taskId:id,remainingMinutes:Number(minutes),reason}}));}}><fieldset className="dialog-fields" disabled={saving}><h3>{task.title}</h3><p>初始估计 {progress.initial===null?'未记录':`${progress.initial} 分钟`} · 已投入 {minuteText(progress.spent*60000)}</p><Field label="当前估计剩余（分钟）" hint="保留每次调整。此后记录的投入会从这次剩余估计中扣减，不改写初始估计。"><input autoFocus aria-label="当前估计剩余" type="number" min={0} max={1440} step="any" required value={minutes} onChange={e=>setMinutes(e.target.value)}/></Field><p>当前预计总投入：{minuteText((progress.spent+(Number(minutes)||0))*60000)}</p><Field label="调整原因（可选）"><textarea rows={2} maxLength={2000} value={reason} onChange={e=>setReason(e.target.value)}/></Field>{saving&&<p role="status" className="muted">正在保存…</p>}<FormError text={error}/><footer className="modal-actions"><Button type="button" onClick={close}>返回</Button><Button primary type="submit" disabled={saving}>保存调整</Button></footer></fieldset></form></Modal>;
}
function ReviewForm({id}:{id:string}){
 const {data,run,dialog}=useJournal();const task=data.state.tasks.find(t=>t.id===id)!;const review=data.state.reviews.find(r=>r.taskId===id);const [outcome,setOutcome]=useState(review?.outcome??''),[reason,setReason]=useState(review?.reason??''),[adjustment,setAdjustment]=useState(review?.adjustment??'');const {save,error,saving,close}=useSave();const actual=taskMs(data.state,id);
 return <Modal title="复盘与下一次调整" onClose={close} busy={saving}><form onSubmit={e=>{e.preventDefault();void save(()=>run({type:'review.save',payload:{taskId:id,outcome,reason,adjustment}}));}}><fieldset className="dialog-fields" disabled={saving}><p className="dialog-task-title">{task.title}</p><div className="estimate-comparison"><span>原估计 <strong>{task.estimateMinutes??'—'} 分钟</strong></span><ArrowRight20Regular/><span>实际投入 <strong>{minuteText(actual)}</strong></span></div><p className="muted">{task.completedAt?`完成于 ${localDate(task.completedAt)} ${timeText(task.completedAt)}`:'任务仍在进行，可以先记录阶段性收获。'}</p><Field label="留下了什么具体结果"><textarea autoFocus rows={2} value={outcome} maxLength={2000} onChange={e=>setOutcome(e.target.value)} placeholder="完成的产出、解决的问题或明确的结论"/></Field><Field label="与估计不同的原因"><textarea rows={2} value={reason} maxLength={2000} onChange={e=>setReason(e.target.value)} placeholder="例如：遗漏了异常路径，或前期准备更充分"/></Field><Field label="下次如何调整"><textarea rows={2} value={adjustment} maxLength={2000} onChange={e=>setAdjustment(e.target.value)} placeholder="一句可以执行的改进"/></Field>{saving&&<p role="status" className="muted">正在保存…</p>}<FormError text={error}/><footer className="modal-actions"><Button subtle type="button" onClick={close}>稍后复盘</Button><Button primary type="submit" disabled={saving}>保存调整</Button></footer></fieldset></form></Modal>;
}
function PlanForm({id}:{id:string}){
 const {data,run,dialog}=useJournal();const task=data.state.tasks.find(t=>t.id===id)!;const [date,setDate]=useState(task.plannedDate??''),[due,setDue]=useState(deadlineInputValue(task.dueAt));const {save,error,saving,close}=useSave();
 return <Modal title="计划开始与截止时间" onClose={close} busy={saving}><form onSubmit={e=>{e.preventDefault();void save(()=>run({type:'task.plan',payload:{id,date:date||null,dueAt:deadlinePayload(due)}}));}}><fieldset className="dialog-fields" disabled={saving}><p className="dialog-task-title">{task.title}</p><Field label="计划开始" hint="打算哪一天开始，不会自动启动计时"><input type="date" value={date} onChange={e=>setDate(e.target.value)}/></Field><div className="actions"><Button type="button" onClick={()=>setDate(localDate(data.now))}>今天</Button><Button type="button" onClick={()=>setDate(shiftDate(localDate(data.now),1))}>明天</Button><Button subtle type="button" onClick={()=>setDate('')}>清除</Button></div><DeadlineFields value={due} onChange={setDue}/><p className="muted">实际开始、结束和投入时间由计时记录产生，计划日期单独保留。</p>{saving&&<p role="status" className="muted">正在保存…</p>}<FormError text={error}/><footer className="modal-actions"><Button subtle type="button" onClick={close}>取消</Button><Button primary type="submit" disabled={saving}>保存计划</Button></footer></fieldset></form></Modal>;
}
function TaskDetail({id}:{id:string}){
 const {data,dialog,run,navigate,setDate}=useJournal();const task=data.state.tasks.find(t=>t.id===id)!;const sessions=data.state.sessions.filter(s=>s.taskId===id).sort((a,b)=>(a.start??a.date).localeCompare(b.start??b.date));const estimates=data.state.estimates.filter(e=>e.taskId===id);const review=data.state.reviews.find(r=>r.taskId===id);const {save,error,saving}=useSave();const complete=async()=>{dialog({type:'state',id,action:'done'});};
 if(isInformation(task))return <Modal title={isGroup(task)?'分组详情':isEvent(task)?'事件详情':'笔记详情'} onClose={()=>dialog(null)}><h2>{task.title}</h2><Button subtle onClick={()=>{window.sessionStorage.setItem('journal-locate',task.id);dialog(null);navigate('projects');}}>在事项中定位</Button>{isGroup(task)?<p>历史直接投入及子项汇总可在事项中查看。</p>:isEvent(task)?<EventContent task={task}/>:<NoteContent task={task}/>}</Modal>;
 return <Modal title="事项详情" onClose={()=>dialog(null)} wide><div className="detail-top"><div><span className="project-crumb">{projectName(data,task)}</span><h2>{task.title}</h2></div><Button onClick={()=>dialog({type:'task',id})}><Edit20Regular/>编辑</Button></div><div className="detail-facts"><span>原估计 <strong>{task.estimateMinutes??'—'} 分钟</strong></span><span>实际投入 <strong>{minuteText(taskMs(data.state,id))}</strong></span><span>实际开始 <strong>{task.startedAt?`${localDate(task.startedAt)} ${timeText(task.startedAt)}`:'尚无具体时间'}</strong></span><span>实际完成 <strong>{task.completedAt?`${localDate(task.completedAt)} ${timeText(task.completedAt)}`:'尚未完成'}</strong></span><span>计划开始 <strong>{task.plannedDate??'未设置'}</strong></span><span>截止时间 <strong>{deadlineText(task.dueAt)}</strong></span></div><Button subtle onClick={()=>{window.sessionStorage.setItem('journal-locate',task.id);dialog(null);navigate('projects');}}>在事项中定位</Button><ItemReminderControl task={task}/><RecurrenceControl task={task}/><TagEditor task={task}/><EstimateFacts id={task.id}/><LifecycleActions task={task}/><ReviewScheduleEditor id={task.id}/>{task.status==='open'?<><div className="actions"><Button primary disabled={saving} onClick={()=>void save(async()=>{await run({type:'task.select',payload:{id}});setDate(localDate(data.now));navigate('today');})}>回到今日开始</Button><Button onClick={()=>dialog({type:'plan',id})}>计划与截止</Button></div></>:<div className="actions"><span className="status-done">{task.status==='done'?'任务已完成':'任务已取消'}</span><Button primary onClick={()=>dialog({type:'review',id})}>复盘与调整</Button></div>}
  <section className="detail-section"><h3>投入记录</h3>{sessions.length?sessions.map(s=><div className="detail-record" key={s.id}><div><strong>{s.date} · {s.start?`${timeText(s.start)}–${s.end?timeText(s.end):'进行中'}`:'时间未指定'}</strong><p>{s.summary||'尚未填写小结'}</p></div><span>{minuteText(s.durationMs)}</span>{s.status==='ended'&&<Button subtle onClick={()=>dialog({type:'manual',id:s.id})}>校正</Button>}</div>):<p className="muted">开始专注或补记时间后，记录会出现在这里。</p>}</section>
  {estimates.length>0&&<section className="detail-section"><h3>估计调整历史</h3>{estimates.map(e=><div className="history-line" key={e.id}><span>{localDate(e.createdAt)} {timeText(e.createdAt)}</span><strong>剩余 {e.remainingMinutes} 分钟</strong><p>{e.reason}</p></div>)}</section>}
  {review&&<section className="detail-section"><h3>复盘</h3><p>{review.outcome}</p><p className="muted">{review.reason}</p><div className="adjustment"><span>下次</span>{review.adjustment}</div><Button subtle onClick={()=>dialog({type:'review',id})}>编辑复盘</Button></section>}
  {data.state.audit.some(a=>sessions.some(s=>s.id===a.entityId))&&<details className="detail-section"><summary>时间校正历史</summary>{data.state.audit.filter(a=>sessions.some(s=>s.id===a.entityId)).map(a=><div className="history-line" key={a.id}><span>{localDate(a.createdAt)} {timeText(a.createdAt)}</span><p>{a.reason} · 原投入 {minuteText(JSON.parse(a.before).durationMs)}</p></div>)}</details>}
  <FormError text={error}/>{task.status==='open'&&<footer className="modal-actions"><Button subtle disabled={saving} onClick={()=>dialog({type:'state',id,action:'cancel'})}>取消这件事</Button><Button onClick={()=>dialog(null)}>返回</Button></footer>}
 </Modal>;
}
