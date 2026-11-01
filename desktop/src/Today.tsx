import React,{useMemo,useState} from 'react';
import {Clock20Regular} from '@fluentui/react-icons';
import {localDate,sessionMsOnDate,type Session} from '../core/types';
import {recurringEvents} from '../core/recurrence';
import {isEvent,isInformation,isGroup} from '../core/item-kind';
import {todayCandidates} from '../core/today';
import {useJournal,useWorkspaceJournal,Button,Empty} from './ui';
import {SemanticCapture} from './SemanticCapture';
import {DailyFocusPanel} from './DailyFocusPanel';
import {FocusToggle} from './FocusToggle';
import {FocusHint} from './TimerDock';
import {UnassignedTimerCard,UnassignedQueue} from './SessionAssignment';
import {TaskCard} from './TaskCard';
import {DateNav,JournalRow,SessionRow} from './TodayTimeline';
import {TodayProgress} from './TodayProgress';
import {timeText} from './ui';
import './today.css';

export function Today(){
 const {data,date,run,dialog,notify,navigate}=useJournal(),workspace=useWorkspaceJournal();
 const {state,timers}=data,isToday=date===localDate(data.now);
 const model=useMemo(()=>todayCandidates(workspace.data.state,data.now),[workspace.data.state,Math.floor(Date.parse(data.now)/60000)]);
 const [choosing,setChoosing]=useState(false),[query,setQuery]=useState('');
 const candidates=(query?model.eligible:model.available).filter(t=>t.focusDate!==date&&!timers.some(r=>r.taskId===t.id)&&t.title.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
 const history=useMemo(()=>{const state=workspace.data.state;return [...[...state.notes,...[...state.tasks.filter(t=>isInformation(t)&&!isEvent(t)&&!isGroup(t)&&!t.deletedAt&&!t.archived),...recurringEvents(state.tasks,date,date)].map(t=>({id:t.id,kind:isEvent(t)?'event' as const:'note' as const,text:t.title,taskId:t.id,createdAt:isEvent(t)?t.eventAt!.length===10?`${t.eventAt}T00:00:00`:t.eventAt!:t.createdAt}))].filter(n=>localDate(n.createdAt)===date).map(n=>({id:n.id,at:n.createdAt,note:n,session:null as Session|null})),...state.sessions.filter(s=>s.status==='ended'&&sessionMsOnDate(s,date)>0).map(s=>({id:s.id,at:s.start??`${s.date}T23:59:00`,note:null,session:s}))].sort((a,b)=>Date.parse(a.at)-Date.parse(b.at));},[workspace.data.state,date]);
 const next=isToday?model.next:undefined;
 return <section className="page today-page execution-home">
  <header className="page-header"><div><DateNav/><h1>{isToday?'今天，推进什么？':'这一天的进展'}</h1></div><div className="header-actions">{state.deletedSessions.length>0&&<Button subtle onClick={()=>dialog({type:'deleted-effort'})}>已删除投入 ({state.deletedSessions.length})</Button>}<Button onClick={()=>dialog({type:'manual'})}><Clock20Regular/>补记时间</Button></div></header>
  {isToday&&<>
   <FocusHint count={timers.filter(t=>!t.paused).length}/>
   <div className="today-execution-grid">
    <section className="today-now" aria-label="当前执行"><h2>{timers.length?'正在推进':next?'接下来':'从一件事开始'}</h2>
     {timers.map(timer=>{const task=state.tasks.find(t=>t.id===timer.taskId);return <div className="today-timer" key={timer.sessionId}>{task?<TaskCard task={task}/>:<UnassignedTimerCard timer={timer}/>}</div>;})}
     {next&&<div className="today-next"><TaskCard task={next}/></div>}
     {!next&&!timers.length&&<Empty title="选一件事，开始就好" text="从右侧选择今日重点，或先计时，结束后再补充事项。"><Button primary onClick={()=>void run({type:'focus.start-unassigned'}).catch(()=>{})}>先计时，稍后补充事项</Button><Button onClick={()=>setChoosing(true)}>选择今日重点</Button></Empty>}
    </section>
    <section className="today-plan" aria-label="安排今日重点"><div className="today-section-heading"><h2>今日重点</h2><Button subtle aria-expanded={choosing} onClick={()=>setChoosing(!choosing)}>{choosing?'收起选择':'选择重点'}</Button></div>
     <DailyFocusPanel index={model.index} date={date}/>
     {choosing&&<div className="today-focus-picker"><input aria-label="搜索要加入重点的事项" placeholder="搜索事项，加入今日重点" value={query} onChange={e=>setQuery(e.target.value)}/>{candidates.slice(0,8).map(task=><div className="today-candidate" key={task.id}><button className="task-link" onClick={()=>dialog({type:'detail',id:task.id})}>{task.title}</button><FocusToggle task={task}/></div>)}{!candidates.length&&<p className="muted">没有符合条件的待做事项。</p>}<Button subtle onClick={()=>navigate('projects')}>去事项中选择{candidates.length>8?`（还有 ${candidates.length-8} 件）`:''}</Button></div>}
     <div className="today-capture"><SemanticCapture data={data} run={run} storageKey={`journal.today-capture.${data.dataPath}`} onSaved={()=>notify('记录已保存')}/></div>
    </section>
   </div>
  </>}
  <TodayProgress date={date}/>
  <UnassignedQueue/>
  <section className="today-history" aria-label="今日时间线"><div className="today-section-heading"><h2>{isToday?'今日时间线':'当日时间线'}</h2><span className="muted">按发生时间回看 · {history.length} 条记录</span></div><div className="journal">
   {history.map(item=><JournalRow key={item.id} time={item.note?.kind==='event'&&state.tasks.find(t=>t.id===item.id)?.eventAt?.length===10?'全天':item.session&&!item.session.start?'补记':timeText(item.at)}>{item.note?<div className={`note-entry ${item.note.kind==='migration'?'migration':''}`}><strong>{item.note.kind==='event'?'事件':item.note.kind==='migration'?'迁移':'笔记'}</strong>{item.note.taskId?<button className="task-link" onClick={()=>dialog({type:'detail',id:item.note!.taskId!})}>{item.note.text}</button>:<span>{item.note.text}</span>}</div>:<SessionRow session={item.session!}/>}</JournalRow>)}
   {!history.length&&<p className="muted">还没有时间线记录。结束计时后会自动出现在这里，也可以补记投入。</p>}
  </div></section>
 </section>;
}
