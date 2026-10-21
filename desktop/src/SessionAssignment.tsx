import {StopForBreak} from './BreakBar';
import './session-assignment.css';
import React,{useMemo,useRef,useState} from 'react';
import {Timer20Regular,Pause20Filled,Play20Filled,Stop20Filled} from '@fluentui/react-icons';
import {defaultCaptureParent} from '../core/capture-destination';
import {outlineIndex,outlinePath} from '../core/outline';
import {parentOptions} from '../core/outline-options';
import {isTask} from '../core/item-kind';
import {localDate,type TimerView} from '../core/types';
import {periodEffort} from '../core/review';
import {ParentSelect} from './ParentSelect';
import {useJournal,Button,Field,Modal,minuteText,timeText,timerText} from './ui';

export function UnassignedTimerCard({timer}:{timer:TimerView}){
 const {run,dialog,busy}=useJournal();
 const stop=async()=>{await run({type:'focus.stop',payload:{sessionId:timer.sessionId}});dialog({type:'assign',id:timer.sessionId});};
 return <article className="task-card unassigned-timer" aria-label="未关联事项的计时器">
  <div className="task-title-row"><Timer20Regular/><strong>先计时，稍后补充事项</strong></div>
  <div className="focus-area"><div><div className="field-caption">{timer.paused?'专注已暂停':'本次已投入'}</div><div className="big-timer">{timerText(timer.durationMs)}</div><div className="focus-status">{timer.paused?'暂停期间不计入投入':timer.durationMs>=timer.targetMinutes*60000?'目标时间已到 · 继续计时':`本次目标 ${timer.targetMinutes} 分钟 · 到时提醒`}</div></div><div className="focus-actions">
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
 return <details className="unassigned-queue"><summary>待补充事项 <strong>{records.length} 条</strong><span>{minuteText(total)}</span></summary><p className="muted">时间已计入总投入。补充事项后，会同步到对应事项和项目。</p>{records.map(r=><div className="unassigned-record" key={r.id}><span>{r.date} · {timeText(r.start)}<small>{r.summary||'未关联事项'}</small></span><strong>{minuteText(r.durationMs)}</strong><Button subtle onClick={()=>dialog({type:'assign',id:r.id})}>补充事项</Button></div>)}</details>;
}

export function SessionAssignment({id}:{id:string}){
 const {data,run,dialog,notify}=useJournal(),record=data.state.sessions.find(r=>r.id===id);
 const [mode,setMode]=useState<'new'|'existing'>('new'),[title,setTitle]=useState(''),[parent,setParent]=useState(defaultCaptureParent(data.state)??'__root__');
 const [query,setQuery]=useState(''),[taskId,setTaskId]=useState(''),[summary,setSummary]=useState(record?.summary??''),[error,setError]=useState(''),[saving,setSaving]=useState(false),[restAfter,setRestAfter]=useState(false),lock=useRef(false);
 const tree=useMemo(()=>outlineIndex(data.state),[data.state.tasks]);
 const options=useMemo(()=>parentOptions(tree),[tree]);
 const candidates=useMemo(()=>data.state.tasks.filter(t=>isTask(t)&&!outlinePath(tree,t.id).some(n=>n.record.archived||('deletedAt' in n.record&&n.record.deletedAt))).map(t=>({task:t,path:outlinePath(tree,t.id).map(n=>n.title).join(' / ')})),[tree]);
 const matches=candidates.filter(c=>c.path.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
 const selected=candidates.find(c=>c.task.id===taskId);
 const close=()=>{if(!lock.current)dialog(null);};
 const save=async()=>{if(lock.current)return;lock.current=true;setSaving(true);setError('');try{await run({type:'session.assign',payload:{id,summary,rest:restAfter,...mode==='new'?{title,parentId:parent==='__root__'?null:parent}:{taskId}}});dialog(null);notify('已关联事项，原始计时时段和投入已保留');}catch(e){setError(e instanceof Error?e.message:String(e));}finally{lock.current=false;setSaving(false);}};
 if(!record||record.taskId!==null||record.status!=='ended')return <Modal title="补充事项" onClose={close}><p>这段记录已更新，请返回查看。</p><Button onClick={close}>返回</Button></Modal>;
 return <Modal title="补充这段时间的事项" onClose={close}><form onSubmit={e=>{e.preventDefault();void save();}}>
  <div className="assignment-evidence"><Timer20Regular/><div><strong>{minuteText(record.durationMs)} · 时间已保存</strong><span>{record.date} {timeText(record.start)}–{record.end&&localDate(record.end)!==record.date?`${localDate(record.end)} `:''}{timeText(record.end)}{record.segments.length>1?' · 已扣除暂停':''}</span></div></div>
  <div className="segmented field" role="group" aria-label="补充事项方式"><button type="button" aria-pressed={mode==='new'} className={mode==='new'?'active':''} onClick={()=>setMode('new')}>新建事项</button><button type="button" aria-pressed={mode==='existing'} className={mode==='existing'?'active':''} onClick={()=>setMode('existing')}>关联已有事项</button></div>
  {mode==='new'?<><Field label="这段时间做了什么"><input autoFocus aria-label="这段时间做了什么" required maxLength={200} value={title} onChange={e=>setTitle(e.target.value)} placeholder="给刚才做的事情起个名字"/></Field><Field label="归属"><ParentSelect label="新事项归属" options={options} value={parent} onChange={setParent}/></Field></>:<><Field label="查找已有事项"><input autoFocus aria-label="查找已有事项" value={query} onChange={e=>setQuery(e.target.value)} placeholder="按名称或路径搜索"/></Field><div className="assignment-candidates" role="group" aria-label="选择关联事项">{matches.slice(0,40).map(({task,path})=><button type="button" key={task.id} className={taskId===task.id?'selected':''} aria-pressed={taskId===task.id} onClick={()=>setTaskId(task.id)}><span>{task.title}</span><small>{path} {task.status==='done'?' · 已完成':task.status==='cancelled'?' · 已取消':''}</small></button>)}{!matches.length&&<p className="muted">没有匹配的事项，可以切换到新建事项。</p>}</div>{matches.length>40&&<p className="muted">显示前 40 项，请输入名称缩小范围。</p>}{selected&&<p className="assignment-selected">将关联：{selected.path}</p>}</>}
  <Field label="本次进展（可选）"><textarea rows={2} maxLength={2000} value={summary} onChange={e=>setSummary(e.target.value)}/></Field>
  <label className="checkbox-label assignment-rest-choice"><input type="checkbox" checked={restAfter} disabled={data.timers.some(t=>!t.paused)||data.state.settings.rest?.phase==='running'} onChange={e=>setRestAfter(e.target.checked)}/>补充后休息 {data.state.settings.breakMinutes} 分钟</label><p className="muted">保留原起止时间和暂停记录，事项投入会自动更新。</p>{error&&<p className="form-error" role="alert">{error}</p>}
  <footer className="modal-actions"><Button type="button" subtle disabled={saving} onClick={close}>稍后补充</Button><Button primary type="submit" disabled={saving||(mode==='new'?!title.trim():!taskId)}>{saving?'正在保存…':restAfter?'保存并休息':'保存并关联'}</Button></footer>
 </form></Modal>;
}
