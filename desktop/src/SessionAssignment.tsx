import {StopForBreak} from './BreakBar';
import {SessionStartControl} from './SessionStart';
import {timerTargetMs} from '../core/timer-target';
import './session-assignment.css';
import React,{useEffect,useMemo,useState} from 'react';
import {Timer20Regular,Pause20Filled,Play20Filled,Stop20Filled} from '@fluentui/react-icons';
import {defaultCaptureParent} from '../core/capture-destination';
import {outlineIndex,outlinePath} from '../core/outline';
import {parentOptions} from '../core/outline-options';
import {effortDestinations} from '../core/effort-destination';
import {DiscardEffortConfirmation} from './EffortTrash';
import {useDialogAction} from './useDialogAction';
import {localDate,type TimerView} from '../core/types';
import {periodEffort} from '../core/review';
import {ParentSelect} from './ParentSelect';
import {clearAssignmentDraft,readAssignmentDraft,writeAssignmentDraft} from './assignment-drafts';
import {restUnavailableReason} from './rest-availability';
import {useJournal,Button,Field,Modal,minuteText,timeText,timerText} from './ui';

export function UnassignedTimerCard({timer}:{timer:TimerView}){
 const {run,dialog,busy}=useJournal();
 const stop=async()=>{await run({type:'focus.stop',payload:{sessionId:timer.sessionId}});dialog({type:'assign',id:timer.sessionId});};
 return <article className="task-card unassigned-timer" aria-label="未关联事项的计时器">
  <div className="task-title-row"><Timer20Regular/><strong>先计时，稍后补充事项</strong></div>
  <div className="focus-area"><div><div className="field-caption">{timer.paused?'专注已暂停':'本次已投入'}</div><div className="big-timer">{timerText(timer.durationMs)}</div><div className="focus-status">{timer.paused?'暂停期间不计入投入':timer.durationMs>=timerTargetMs(timer)?'目标时间已到 · 继续计时':timer.targetOffsetMs!==undefined?`距离提醒 ${timerText(Math.max(0,timerTargetMs(timer)-timer.durationMs))} · 计时继续`:`本次目标 ${timer.targetMinutes} 分钟 · 到时提醒`}</div><SessionStartControl sessionId={timer.sessionId}/></div><div className="focus-actions">
   <Button primary disabled={busy} onClick={()=>void stop().catch(()=>{})}><Stop20Filled/>结束并补充事项</Button><StopForBreak sessionId={timer.sessionId}/>
   <Button disabled={busy} onClick={()=>void run({type:timer.paused?'focus.resume':'focus.pause',payload:{sessionId:timer.sessionId}}).catch(()=>{})}>{timer.paused?<Play20Filled/>:<Pause20Filled/>}{timer.paused?'恢复专注':'暂停'}</Button>
  </div>{timer.recovered&&<div className="recovery-notice">上次投入已恢复，当前暂停。应用关闭或休眠期间未计入。</div>}</div>
 </article>;
}

/** Remains visible across dates/restarts so deferring assignment never hides the evidence. */
export function UnassignedQueue({start,end}:{start?:string;end?:string}){
 const {data,dialog}=useJournal();
 const records=data.state.sessions.filter(r=>r.taskId===null&&r.status==='ended'&&(!start||!end||r.segments.some(s=>localDate(s.start)<=end&&localDate(s.end)>=start)||r.date>=start&&r.date<=end)).sort((a,b)=>(b.start??b.date).localeCompare(a.start??a.date));
 if(!records.length)return null;
 const total=start&&end?periodEffort(records,start,end).cumulativeMs:records.reduce((n,r)=>n+r.durationMs,0);
 return <details className="unassigned-queue"><summary>待补充事项 <strong>{records.length} 条</strong><span>{minuteText(total)}</span></summary><p className="muted">时间已计入总投入。补充事项后，会同步到对应事项和项目；不需要保留的投入可以放弃，之后仍可恢复。</p>{records.map(r=><div className="unassigned-record" key={r.id}><span>{r.date} · {timeText(r.start)}<small>{r.summary||'未关联事项'}</small></span><strong>{minuteText(r.durationMs)}</strong><Button subtle onClick={()=>dialog({type:'assign',id:r.id})}>补充事项</Button><Button subtle className="discard-effort" aria-label={`放弃投入 ${r.date} ${timeText(r.start)}`} onClick={()=>dialog({type:'discard-effort',id:r.id})}>放弃投入</Button></div>)}</details>;
}

export function SessionAssignment({id}:{id:string}){
 const {data,run,dialog,notify,busy}=useJournal(),record=data.state.sessions.find(r=>r.id===id);
 const [draft]=useState(()=>readAssignmentDraft(data.dataPath,id));
 const [mode,setMode]=useState<'new'|'existing'>(draft?.mode??'new'),[title,setTitle]=useState(draft?.title??''),[parent,setParent]=useState(draft?.parent??defaultCaptureParent(data.state)??'__root__');
 const [query,setQuery]=useState(draft?.query??''),[taskId,setTaskId]=useState(draft?.taskId??''),[summary,setSummary]=useState(draft?.summaryBase===(record?.summary??'')?draft.summary:record?.summary??''),[restAfter,setRestAfter]=useState(draft?.restAfter??false),[discard,setDiscard]=useState(false);
 const [summaryBase]=useState(record?.summary??'');
 useEffect(()=>{if(record?.taskId===null&&record.status==='ended')writeAssignmentDraft(data.dataPath,id,{mode,title,parent,query,taskId,summary,summaryBase,restAfter});},[data.dataPath,id,mode,title,parent,query,taskId,summary,summaryBase,restAfter,record?.taskId,record?.status]);
 const {perform,dismiss,saving,error}=useDialogAction();
 const tree=useMemo(()=>outlineIndex(data.state),[data.state.tasks]);
 const options=useMemo(()=>parentOptions(tree),[tree]);
 const candidates=useMemo(()=>effortDestinations(data.state).map(t=>({task:t,path:outlinePath(tree,t.id).map(n=>n.title).join(' / ')})),[tree]);
 const matches=candidates.filter(c=>c.path.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
 const selected=candidates.find(c=>c.task.id===taskId);
 const summaryChanged=!!record&&summary!==record.summary;
 const restReason=restUnavailableReason(data),canRest=!restReason;
 const defer=async()=>{
  if(summaryChanged){if(await perform(()=>run({type:'session.summary',payload:{id,summary}}))){dialog(null);notify('进展已保存，事项可以稍后补充');}}
  else dismiss(()=>dialog(null));
 };
 const close=()=>{if(busy)return;if(discard)setDiscard(false);else void defer();};
 const save=async()=>{if(await perform(()=>run({type:'session.assign',payload:{id,summary,rest:restAfter&&canRest,...mode==='new'?{title,parentId:parent==='__root__'?null:parent}:{taskId}}}))){clearAssignmentDraft(data.dataPath,id);dialog(null);notify('已关联事项，原始计时时段和投入已保留');}};
 if(!record||record.taskId!==null||record.status!=='ended')return <Modal title="补充事项" onClose={close}><p>这段记录已更新，请返回查看。</p><Button onClick={close}>返回</Button></Modal>;
 return <Modal title={discard?'放弃这段投入':'补充这段时间的事项'} onClose={close} busy={saving||busy}>{discard?<DiscardEffortConfirmation record={record} summary={summary} onCancel={()=>setDiscard(false)} onDiscard={()=>dialog(null)}/>:<form onSubmit={e=>{e.preventDefault();void save();}}><fieldset disabled={saving} className="dialog-fields">
  <div className="assignment-evidence"><Timer20Regular/><div><strong>{minuteText(record.durationMs)} · 时间已保存</strong><span>{record.date} {timeText(record.start)}–{record.end&&localDate(record.end)!==record.date?`${localDate(record.end)} `:''}{timeText(record.end)}{record.segments.length>1?' · 已扣除暂停':''}</span></div></div>
  <div className="segmented field" role="group" aria-label="补充事项方式"><button type="button" aria-pressed={mode==='new'} className={mode==='new'?'active':''} onClick={()=>setMode('new')}>新建事项</button><button type="button" aria-pressed={mode==='existing'} className={mode==='existing'?'active':''} onClick={()=>setMode('existing')}>关联已有事项</button></div>
  {mode==='new'?<><Field label="这段时间做了什么"><input autoFocus aria-label="这段时间做了什么" required maxLength={120} value={title} onChange={e=>setTitle(e.target.value)} placeholder="给刚才做的事情起个名字"/></Field><Field label="归属"><ParentSelect label="新事项归属" options={options} value={parent} onChange={setParent}/></Field></>:<><Field label="查找已有事项"><input autoFocus aria-label="查找已有事项" value={query} onChange={e=>setQuery(e.target.value)} placeholder="按名称或路径搜索"/></Field><div className="assignment-candidates" role="group" aria-label="选择关联事项">{matches.slice(0,40).map(({task,path})=><button type="button" key={task.id} className={taskId===task.id?'selected':''} aria-pressed={taskId===task.id} onClick={()=>setTaskId(task.id)}><span>{task.title}</span><small>{path} {task.status==='done'?' · 已完成':task.status==='handed-off'?' · 已交接（关闭）':task.status==='cancelled'?' · 已取消':''}</small></button>)}{!matches.length&&<p className="muted">没有匹配的事项，可以切换到新建事项。</p>}</div>{matches.length>40&&<p className="muted">显示前 40 项，请输入名称缩小范围。</p>}{selected&&<p className="assignment-selected">将关联：{selected.path}</p>}</>}
  <Field label="本次进展（可选）"><textarea rows={2} maxLength={2000} value={summary} onChange={e=>setSummary(e.target.value)}/></Field>
  <label className="checkbox-label assignment-rest-choice"><input type="checkbox" checked={restAfter&&canRest} disabled={!canRest} onChange={e=>setRestAfter(e.target.checked)}/>补充后休息 {data.state.settings.breakMinutes} 分钟</label>{restReason&&<p className="muted" role="status">{restReason}</p>}<p className="muted">稍后补充会保存本次进展；名称和归属选择会在本次打开应用期间保留，之后可继续填写。</p>{error&&<p className="form-error" role="alert">{error}</p>}
  <footer className="modal-actions assignment-actions"><Button type="button" subtle className="assignment-discard" disabled={saving} onClick={()=>setDiscard(true)}>放弃这段投入</Button><Button type="button" subtle disabled={saving} onClick={()=>void defer()}>{summaryChanged?'保存进展，稍后补充':'稍后补充'}</Button><Button primary type="submit" disabled={saving||(mode==='new'?!title.trim():!selected)}>{saving?'正在保存…':restAfter&&canRest?'保存并休息':'保存并关联'}</Button></footer>
 </fieldset></form>}</Modal>;
}
