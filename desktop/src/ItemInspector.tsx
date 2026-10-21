import {itemPresentations} from '../core/item-presentation';
import {ItemStatus} from './ItemStatus';
import {RecurrenceControl} from './RecurrenceControl';
import {FocusToggle} from './FocusToggle';
import {EventContent} from './EventContent';
import React,{useState,useMemo} from 'react';
import {ChevronRight20Regular,Dismiss20Regular,Play20Filled,Pause20Filled,Stop20Filled,Target20Regular,Calendar20Regular,Flag20Regular,Folder20Regular} from '@fluentui/react-icons';
import {branchIds,outlinePath,type OutlineIndex,type OutlineNode} from '../core/outline';
import {blockedReason,deadlineConstraint,estimateProgress} from '../core/item-state';
import {isEvent,isInformation} from '../core/item-kind';
import {isDeadlineOverdue} from '../core/deadlines';
import {localDate,type Task} from '../core/types';
import {useJournal,useWorkspaceJournal,Button,minuteText,timerText,timeText} from './ui';
import {EditValue} from './InlineEdit';
import {TagEditor} from './Tags';
import {DeadlineEditor} from './DeadlineEditor';
import {ItemReminderControl} from './ItemReminder';
import {ReviewScheduleEditor} from './ReviewSchedule';
import {LifecycleActions,EstimateFacts} from './ItemActions';
import {NoteContent} from './NoteContent';
import {reviewChanges} from '../core/item-reviews';

export type InspectorTab='details'|'records'|'review';
const quiet=(p:Promise<unknown>)=>{void p.catch(()=>{});};
const dateTime=(value:string|null)=>value?`${localDate(value)} ${timeText(value)}`:'尚未发生';
type Props={reviewing?:boolean;scopeRoot?:string;node:OutlineNode;index:OutlineIndex;tab:InspectorTab;setTab:(tab:InspectorTab)=>void;onClose:()=>void;onSelect:(id:string)=>void;onFocus:(id:string)=>void;onStart:()=>Promise<unknown>;onStop:()=>Promise<unknown>;onPatch:(field:string,value:unknown)=>Promise<unknown>;onEdit:()=>void};

/** Persistent identity/timer header; each tab owns one distinct reading or editing job. */
export function ItemInspector({reviewing=false,scopeRoot,node,index,tab,setTab,onClose,onSelect,onFocus,onStart,onStop,onPatch,onEdit}:Props){
 const {data}=useJournal(),task=node.record as Task,note=isInformation(task),path=outlinePath(index,node.id),timer=data.timers.find(t=>t.taskId===node.id);
 const workspace=useWorkspaceJournal(),presentation=useMemo(()=>itemPresentations(index,workspace.data.timers,workspace.data.now).get(node.id)!,[index,workspace.data.timers,workspace.data.now,node.id]);
 const recordCount=data.state.sessions.filter(s=>s.taskId===node.id).length;
 return <aside className="task-inspector" aria-label="所选事项详情">
  <div className="inspector-fixed"><div className="inspector-top"><span>{note?isEvent(task)?'事件详情':'笔记详情':'事项详情'}</span><Button subtle aria-label="收起详情" onClick={onClose}><Dismiss20Regular/></Button></div>
   <nav className="node-breadcrumb" aria-label="任务所在路径">{path.map((n,i)=><React.Fragment key={n.id}>{i>0&&<ChevronRight20Regular/>}<button title={n.title} disabled={!!scopeRoot&&!branchIds(index,scopeRoot).has(n.id)} onClick={()=>onSelect(n.id)}>{n.title}</button></React.Fragment>)}</nav>
   <div className="inspector-title"><EditValue label="详情名称" value={node.title} onSave={value=>onPatch('title',value)}/></div>
   <div className="node-meta"><ItemStatus value={presentation}/>{task?.isProject&&<span>项目标记</span>}{task&&!note&&task.status==='open'&&!task.deletedAt&&<FocusToggle task={task}/>}{!reviewing&&<button onClick={()=>onFocus(node.id)}><Target20Regular/>聚焦此分支</button>}</div>
   {task&&!note&&<ItemTimerControls task={task} index={index} onStart={onStart} onStop={onStop}/>}
   {!note&&<div className="inspector-tabs" role="tablist" aria-label="详情内容">{([['details','内容'],['records',`投入 ${recordCount}`],['review','复盘']] as const).map(([id,label])=><button role="tab" aria-selected={tab===id} className={tab===id?'active':''} key={id} onClick={()=>setTab(id)}>{label}</button>)}</div>}
  </div>
  <div className="inspector-scroll">
   {note&&task?<>{isEvent(task)?<EventContent task={task} onEdit={onEdit}/>:<NoteContent task={task} onEdit={onEdit}/>}<BranchControls node={node} index={index} onSelect={onSelect}/></>:tab==='details'?<>
    {task?<><section className="inspector-field inspector-description"><EditValue label="事项说明" value={task.description??''} multiline empty="添加说明…" onSave={value=>onPatch('description',value)}/></section><div className="inspector-properties"><section className="inspector-field"><label><Calendar20Regular/>计划开始</label><EditValue label="详情计划开始" value={task.plannedDate??''} type="date" empty="未设置" onSave={value=>onPatch('plannedDate',value||null)}/></section><section className="inspector-field"><label><Flag20Regular/>截止时间</label><DeadlineEditor label="详情截止时间" value={task.dueAt} onSave={value=>onPatch('dueAt',value)}/>{task.status==='open'&&isDeadlineOverdue(task.dueAt,data.now)&&<small className="overdue">已超过截止时间</small>}</section><ItemReminderControl task={task}/><RecurrenceControl task={task}/><TagEditor task={task} onEdit={onEdit}/></div>{deadlineConstraint(index,task.id)&&<p className="item-reason">{deadlineConstraint(index,task.id)}</p>}{reviewing&&<ReviewChangeSummary id={task.id}/>}<ReviewScheduleEditor id={task.id}/><details className="inspector-history"><summary>实际时间与历史</summary><div className="date-facts"><span>实际开始 <strong>{dateTime(task.startedAt)}</strong></span><span>实际完成 <strong>{dateTime(task.completedAt)}</strong></span><small>时间记录在“投入”，估计与调整在“复盘”。</small></div></details></>:<p className="muted">临时记录在这里，想清楚后再拖到合适的位置。</p>}
    <BranchControls node={node} index={index} onSelect={onSelect}/>{task&&<LifecycleActions task={task}/>}
   </>:tab==='records'?<ItemEffort node={node} index={index}/>:task?<ItemRetrospective task={task}/>:<p className="muted">选择一个事项查看它的估计、成果和调整。</p>}
  </div>
 </aside>;
}

function ItemTimerControls({task,index,onStart,onStop}:{task:Task;index:OutlineIndex;onStart:()=>Promise<unknown>;onStop:()=>Promise<unknown>}){
 const {data,run,dialog,busy}=useJournal(),timer=data.timers.find(t=>t.taskId===task.id),reason=blockedReason(index,task.id),estimate=estimateProgress(data.state,task.id);
 if(task.status!=='open')return null;
 return <>{timer?<div className="inspector-focus compact-timer"><div className="inspector-clock"><span>{timer.paused?'计时暂停':'本次投入'}</span><strong>{timerText(timer.durationMs)}</strong></div><div className="actions"><Button disabled={busy||timer.paused&&!!reason} onClick={()=>quiet(run({type:timer.paused?'focus.resume':'focus.pause',payload:{sessionId:timer.sessionId}}))}>{timer.paused?<Play20Filled/>:<Pause20Filled/>}{timer.paused?'恢复':'暂停'}</Button><Button primary disabled={busy} onClick={()=>quiet(onStop())}><Stop20Filled/>结束本次</Button></div></div>:<div className="inspector-focus"><Button primary disabled={busy||!!reason} title={reason??undefined} onClick={()=>quiet(onStart())}><Play20Filled/>开始 {data.state.settings.targetMinutes} 分钟</Button>{data.timers.some(t=>!t.paused&&t.taskId!==task.id)&&<Button subtle disabled={busy||!!reason} onClick={()=>quiet(run({type:'focus.switch',payload:{taskId:task.id,skipEstimate:true}}))}>切换计时到此项</Button>}</div>}{reason&&<p className="item-reason">{reason}</p>}{estimate.exhausted&&<div className="estimate-exhausted"><span>估计已用尽 · 剩余待重估{estimate.overrun>0?` · 超出 ${minuteText(estimate.overrun*60000)}`:''}</span><Button subtle onClick={()=>dialog({type:'estimate',id:task.id})}>重新估计</Button></div>}</>;
}

function ItemEffort({node,index}:{node:OutlineNode;index:OutlineIndex}){
 const {data,dialog}=useJournal(),[scope,setScope]=useState<'own'|'branch'>('own'),children=index.children.get(node.id)??[],ids=branchIds(index,node.id),stats=index.stats.get(node.id)!;
 const records=data.state.sessions.filter(s=>scope==='own'?s.taskId===node.id:(s.taskId!==null&&ids.has(s.taskId))).slice().sort((a,b)=>(b.start??b.date).localeCompare(a.start??a.date));
 return <section className="inspector-records"><div className="inspector-metrics effort-metrics"><div><span>本项累计</span><strong>{minuteText(stats.ownMs)}</strong></div>{children.length>0&&<div><span>含子项合计</span><strong>{minuteText(stats.totalMs)}</strong></div>}</div><div className="record-tools">{children.length>0&&<label>记录范围<select aria-label="投入记录范围" value={scope} onChange={e=>setScope(e.target.value as 'own'|'branch')}><option value="own">仅本项</option><option value="branch">含全部子项</option></select></label>}<Button onClick={()=>dialog({type:'manual',taskId:node.id})}>补记本项投入</Button></div>{records.length?records.map(r=><article key={r.id}><div><strong>{data.state.tasks.find(t=>t.id===r.taskId)?.title}</strong><span>{minuteText(r.durationMs)}</span></div><small>{r.start?`${localDate(r.start)} ${timeText(r.start)}–${r.end?timeText(r.end):'进行中'}`:`${r.date} · 未指定具体时间`}</small><p>{r.summary||'尚未填写推进内容'}</p><div className="actions"><Button subtle onClick={()=>dialog({type:'summary',id:r.id})}>补充进展</Button>{r.status==='ended'&&<Button subtle onClick={()=>dialog({type:'manual',id:r.id})}>校正</Button>}</div></article>):<p className="inspector-empty">此范围还没有投入记录。开始计时或补记后会显示在这里。</p>}</section>;
}

function ItemRetrospective({task}:{task:Task}){
 const {data,dialog}=useJournal(),review=data.state.reviews.find(r=>r.taskId===task.id),estimates=data.state.estimates.filter(e=>e.taskId===task.id),notes=data.state.notes.filter(n=>n.taskId===task.id);
 return <section className="inspector-review"><EstimateFacts id={task.id}/>{review?<><h3>具体成果</h3><p>{review.outcome||'尚未填写'}</p><h3>差异与原因</h3><p>{review.reason||'尚未填写'}</p><h3>下次调整与收获</h3><p>{review.adjustment||'尚未填写'}</p></>:<p className="muted">保留最初判断，再用实际投入调整接下来的安排。</p>}<Button onClick={()=>dialog({type:'review',id:task.id})}>记录复盘与调整</Button>{estimates.length>0&&<details className="inspector-history"><summary>剩余估计历史 · {estimates.length}</summary>{estimates.map(e=><p key={e.id}>{localDate(e.createdAt)} · {e.remainingMinutes} 分钟<br/>{e.reason}</p>)}</details>}{notes.length>0&&<details className="inspector-history"><summary>相关记录 · {notes.length}</summary>{notes.map(n=><p key={n.id}>{n.text}</p>)}</details>}</section>;
}

function BranchControls({node,index,onSelect}:{node:OutlineNode;index:OutlineIndex;onSelect:(id:string)=>void}){
 const [open,setOpen]=useState(false),children=index.children.get(node.id)??[];
 return children.length>0?<details className="inspector-children" onToggle={e=>setOpen(e.currentTarget.open)}><summary>直接子项 · {children.length}</summary>{(open||children.length<400)&&children.map(n=><button key={n.id} onClick={()=>onSelect(n.id)}>{n.kind==='project'?<Folder20Regular/>:<ChevronRight20Regular/>}<span>{n.title}</span></button>)}</details>:null;
}
function ReviewChangeSummary({id}:{id:string}){const {data}=useJournal(),changes=reviewChanges(data.state,id);return <p className="review-change-summary">{changes?`自上次审视以来：新增 ${changes.created} 项、完成 ${changes.completed} 项、${changes.records} 条投入记录有变化。`:'尚无上次审视记录。'}<small>没有记录不表示没有推进。</small></p>;}
