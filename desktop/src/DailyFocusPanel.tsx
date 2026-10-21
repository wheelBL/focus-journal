import React from 'react';
import {CheckmarkCircle20Filled,Play20Filled} from '@fluentui/react-icons';
import {dailyFocusItems} from '../core/daily-focus';
import {itemSorter} from '../core/item-order';
import {blockedReason} from '../core/item-state';
import type {OutlineIndex} from '../core/outline';
import {FocusToggle} from './FocusToggle';
import {Button,useJournal} from './ui';

/** One persistent daily queue, independent of the timeline's selected/active cards. */
export function DailyFocusPanel({index,date}:{index:OutlineIndex;date:string}){
 const {data,run,busy,dialog}=useJournal(),items=dailyFocusItems(index,date);
 const done=items.filter(t=>t.status==='done'),open=items.filter(t=>t.status==='open');
 const ordered=itemSorter(index,'smart',data.now,false)(open.map(t=>index.nodes.get(t.id)!));
 const quiet=(p:Promise<unknown>)=>void p.catch(()=>{});
 return <section className="today-focus-list" aria-label="今日重点清单">
  <header className="daily-focus-summary"><strong>{items.length?`已完成 ${done.length} / ${items.length}`:'先选几件今天要推进的事'}</strong>{open.length>0&&<span>{open.length} 件待推进</span>}</header>
  {ordered.map(node=>{
   const task=node.record as typeof open[number],timer=data.timers.find(t=>t.taskId===task.id),blocked=blockedReason(index,task.id);
   const status=timer?timer.paused?'计时已暂停':'正在计时':blocked?'事项已暂停／不可执行':data.state.settings.selectedTaskId===task.id?'接下来':'待启动';
   return <div className="daily-focus-row" data-focus-id={task.id} key={task.id}>
    <FocusToggle task={task} compact/>
    <button className="daily-focus-name" onClick={()=>dialog({type:'detail',id:task.id})}><span>{task.title}</span><small title={blocked??undefined}>{status}</small></button>
    {timer&&!timer.paused?<span className="daily-focus-running" role="status">专注中</span>:<Button subtle disabled={busy||!!blocked} title={blocked??undefined} aria-label={`${timer?'恢复计时':'开始计时'} ${task.title}`} onClick={()=>quiet(run(timer?{type:'focus.resume',payload:{sessionId:timer.sessionId}}:{type:'focus.start',payload:{taskId:task.id,skipEstimate:true}}))}><Play20Filled/>{timer?'恢复':'开始'}</Button>}
   </div>;
  })}
  {done.length>0&&<details className="daily-focus-completed"><summary>已完成 {done.length} 件</summary>{done.map(task=><button key={task.id} onClick={()=>dialog({type:'detail',id:task.id})}><CheckmarkCircle20Filled/>{task.title}</button>)}</details>}
  {!items.length&&<p className="muted">点击“选择重点”加入今天要推进的事项，在这里直接开始或恢复计时。</p>}
  {!!items.length&&!open.length&&<p className="daily-focus-finished">今天选定的重点都完成了。</p>}
 </section>;
}
