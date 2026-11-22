import {outlinePath,type OutlineIndex} from '../core/outline';
import {blockedReason} from '../core/item-state';
import {reviewQueue} from '../core/item-reviews';
import {isCurrentFocus} from '../core/daily-focus';
import React,{useMemo,useState} from 'react';
import {Clock20Regular} from '@fluentui/react-icons';
import {localDate,sessionMsOnDate,type Session} from '../core/types';
import {recurringEvents} from '../core/recurrence';
import {isEvent,isInformation,isGroup,isTask} from '../core/item-kind';
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
 const {data,date,run,dialog,navigate}=useJournal(),workspace=useWorkspaceJournal();
 const {state,timers}=data,isToday=date===localDate(data.now);
 const model=useMemo(()=>todayCandidates(workspace.data.state,data.now),[workspace.data.state,Math.floor(Date.parse(data.now)/60000)]);
 const [choosing,setChoosing]=useState(false),[query,setQuery]=useState('');
 const candidates=(query?model.eligible:model.available).filter(t=>!isCurrentFocus(t,localDate(data.now))&&!timers.some(r=>r.taskId===t.id)&&t.title.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
 const history=useMemo(()=>{const state=workspace.data.state;return [...[...state.notes,...[...state.tasks.filter(t=>isInformation(t)&&!isEvent(t)&&!isGroup(t)&&!t.deletedAt&&!t.archived),...recurringEvents(state.tasks,date,date)].map(t=>({id:t.id,kind:isEvent(t)?'event' as const:'note' as const,text:t.title,taskId:t.id,createdAt:isEvent(t)?t.eventAt!.length===10?`${t.eventAt}T00:00:00`:t.eventAt!:t.createdAt}))].filter(n=>localDate(n.createdAt)===date).map(n=>({id:n.id,at:n.createdAt,note:n,session:null as Session|null})),...state.sessions.filter(s=>s.status==='ended'&&sessionMsOnDate(s,date)>0).map(s=>({id:s.id,at:s.start??`${s.date}T23:59:00`,note:null,session:s}))].sort((a,b)=>Date.parse(a.at)-Date.parse(b.at));},[workspace.data.state,date]);
 const next=isToday&&!timers.length?model.next:undefined,dueReviews=useMemo(()=>reviewQueue(workspace.data.state,localDate(data.now)),[workspace.data.state,localDate(data.now)]);
 return <section className="page today-page execution-home">
  <header className="page-header"><div><DateNav/><h1>{isToday?'今天，推进什么？':'这一天的进展'}</h1></div><div className="header-actions">{state.deletedSessions.length>0&&<Button subtle onClick={()=>dialog({type:'deleted-effort'})}>已删除投入 ({state.deletedSessions.length})</Button>}<Button onClick={()=>dialog({type:'manual'})}><Clock20Regular/>补记时间</Button></div></header>
  {isToday&&<>
   <Button data-operation-entry="today.ai-priorities" onClick={()=>dialog({type:'ai',purpose:'priorities'})}>AI 帮我理清优先级</Button>
   {dueReviews.length>0&&<div className="today-review-entry" aria-label="待回顾事项"><span>{dueReviews.length} 项需要重新判断</span><Button subtle aria-label="打开需要重新判断的事项" onClick={()=>{try{window.sessionStorage.setItem('review-tab','items');window.sessionStorage.setItem('review-queue-request','due');}catch{}navigate('review');}}>打开事项审视 →</Button></div>}
   <FocusHint count={timers.filter(t=>!t.paused).length}/>
   <div className="today-execution-grid">
    <section className="today-now" aria-label="当前执行"><div className="today-section-heading"><h2>{timers.length?'正在推进':next?'建议接下来':'从一件事开始'}</h2>{next&&<span className="today-next-reason">{model.nextReason}</span>}</div>
     {timers.map(timer=>{const task=state.tasks.find(t=>t.id===timer.taskId);return <div className="today-timer" key={timer.sessionId}>{task?<TaskCard task={task} index={model.index}/>:<UnassignedTimerCard timer={timer}/>}</div>;})}
     {next&&<div className="today-next"><TaskCard task={next} index={model.index}/></div>}
     {!next&&!timers.length&&<Empty title="选一件事，开始就好" text="从右侧选择当前重点，或先计时，结束后再补充事项。"><Button primary onClick={()=>void run({type:'focus.start-unassigned'}).catch(()=>{})}>先计时，稍后补充事项</Button><Button onClick={()=>setChoosing(true)}>选择当前重点</Button></Empty>}
    </section>
    <section className="today-plan" aria-label="安排当前重点"><div className="today-section-heading"><h2>当前重点</h2><Button subtle aria-expanded={choosing} onClick={()=>setChoosing(!choosing)}>{choosing?'收起选择':'选择重点'}</Button></div>
     <DailyFocusPanel index={model.index} date={date}/>
     {choosing&&<div className="today-focus-picker"><input aria-label="搜索要加入重点的事项" placeholder="搜索事项，加入当前重点" value={query} onChange={e=>setQuery(e.target.value)}/>{candidates.slice(0,8).map(task=><div className="today-candidate" key={task.id}><button className="task-link" onClick={()=>dialog({type:'detail',id:task.id})}>{task.title}</button><FocusToggle task={task}/></div>)}{!candidates.length&&<p className="muted">没有符合条件的待做事项。</p>}<Button subtle onClick={()=>navigate('projects')}>去事项中选择{candidates.length>8?`（还有 ${candidates.length-8} 件）`:''}</Button></div>}
     <TodayCapture index={model.index}/>
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

function TodayCapture({index}:{index:OutlineIndex}){
 const {data,run,dialog,busy}=useWorkspaceJournal();
 const [savedId,setSavedId]=useState<string>();
 const saved=savedId?data.state.tasks.find(task=>task.id===savedId):undefined;
 const timer=data.timers.find(t=>t.taskId===savedId);
 const available=saved&&isTask(saved)&&!blockedReason(index,saved.id);
 const parent=saved?.parentId?outlinePath(index,saved.parentId).map(node=>node.title).join(' / '):'不分组';
 const start=()=>{
  if(!saved||timer||busy||!available)return;
  if(data.timers.some(t=>!t.paused))dialog({type:'start',id:saved.id});
  else void run({type:'focus.start',payload:{taskId:saved.id,skipEstimate:true}}).catch(()=>{});
 };
 return <div className="today-capture">
  <SemanticCapture data={data} run={run} storageKey={`journal.today-capture.${data.dataPath}`} showDefaultDestination={!saved} onSaved={result=>setSavedId(result.commandResult?.createdItemIds[0])}/>
  {saved&&!saved.deletedAt&&<div className="capture-receipt">
   <p role="status">「{saved.title}」已保存到{parent}{isEvent(saved)&&' · 可在日历查看'}</p>
   {available&&<div className="actions"><Button disabled={busy||!!timer} onClick={start}>{timer?(timer.paused?'已暂停':'正在计时'):'开始这项任务'}</Button><FocusToggle task={saved}/></div>}
  </div>}
 </div>;
}
