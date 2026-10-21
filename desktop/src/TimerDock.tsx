import {sessionTitle} from '../core/session-label';
import React from 'react';
import {Timer24Filled,Pause20Filled,Play20Filled,Stop20Filled,ChevronUp20Regular} from '@fluentui/react-icons';
import {Button,timerText} from './ui';
import type {Command,Snapshot,TimerView} from '../core/types';

export function FocusHint({count}:{count:number}){
 return count>1?<div className="parallel-hint"><strong>{count} 件事同时计时</strong><span>每次只做一件事情，更容易专注。</span><small>各项分别累计，投入合计包含重叠时段。</small></div>:null;
}

export function TimerDock({data,busy,run,onOpen,onSummary}:{data:Snapshot;busy:boolean;run:(command:Command)=>Promise<Snapshot>;onOpen:(taskId:string|null)=>void;onSummary:(sessionId:string)=>void}){
 const running=data.timers.filter(t=>!t.paused).length;
 const stop=async(timer:TimerView)=>{await run({type:'focus.stop',payload:{sessionId:timer.sessionId}});onSummary(timer.sessionId);};
 const row=(timer:TimerView)=>{
  const title=sessionTitle(data.state,timer.taskId);
  return <div className="dock-timer-row" key={timer.sessionId} aria-label={`${title}的计时器`}>
   <button className="dock-task" title={title} onClick={()=>onOpen(timer.taskId)}>{title}<small>{timer.paused?'已暂停':'计时中'}</small></button>
   <strong>{timerText(timer.durationMs)}</strong>
   <Button disabled={busy} aria-label={`${timer.paused?'恢复':'暂停'}${title}计时`} onClick={()=>void run({type:timer.paused?'focus.resume':'focus.pause',payload:{sessionId:timer.sessionId}}).catch(()=>{})}>{timer.paused?<Play20Filled/>:<Pause20Filled/>}{timer.paused?'恢复':'暂停'}</Button>
   <Button primary disabled={busy} aria-label={`结束${title}计时`} onClick={()=>void stop(timer).catch(()=>{})}><Stop20Filled/>结束本次</Button>
  </div>;
 };
 if(!data.timers.length)return null;
 return data.timers.length===1?<div className="timer-dock"><Timer24Filled/>{row(data.timers[0])}</div>:<div className="timer-dock multiple-timers">
  <details className="timer-switcher">
   <summary aria-label="管理所有计时器"><Timer24Filled/><strong>{running} 个计时中</strong>{data.timers.length>running&&<span>· {data.timers.length-running} 个已暂停</span>}<span className="dock-summary-hint">{running>1?'每次只做一件事情，更容易专注':'按自己的节奏，继续一件事'}</span><ChevronUp20Regular/></summary>
   <div className="timer-popover" role="region" aria-label="所有计时器"><FocusHint count={running}/>{data.timers.map(row)}</div>
  </details>
 </div>;
}
