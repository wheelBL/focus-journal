import React,{useEffect,useState} from 'react';
import {createPortal} from 'react-dom';
import {DrinkCoffee20Regular,Play20Filled} from '@fluentui/react-icons';
import {breakContinuation} from '../core/break-state';
import {useJournal,Button,timerText} from './ui';
import './break-cycle.css';

export function StopForBreak({sessionId}:{sessionId:string}){
 const {data,run,busy}=useJournal(),otherRunning=data.timers.some(t=>t.sessionId!==sessionId&&!t.paused);
 return <Button className="stop-for-break" disabled={busy||otherRunning} title={otherRunning?'请先暂停或结束其他计时器，再休息':undefined} onClick={()=>void run({type:'focus.stop',payload:{sessionId,rest:true}}).catch(()=>{})}><DrinkCoffee20Regular/>结束并休息 {data.state.settings.breakMinutes} 分钟</Button>;
}

/** Portal reserves its own row above the workspace, so the timer is visible on every page. */
export function BreakBar(){
 const {data,run,busy,navigate}=useJournal(),rest=data.state.settings.rest;
 const [target,setTarget]=useState<HTMLElement|null>(null);useEffect(()=>setTarget(document.getElementById('rest-workspace')),[]);
 if(!rest||!target)return null;
 const remaining=Math.max(0,Date.parse(data.state.settings.breakUntil??data.now)-Date.parse(data.now)),ready=rest.phase==='ready'||rest.phase==='running'&&remaining===0;
 const next=ready?breakContinuation(data.state):null;
 const perform=(type:string)=>void run({type}).catch(()=>{});
 const choose=async()=>{await run({type:'break.stop'});navigate('projects');};
 return createPortal(<section className={`break-bar ${rest.phase}`} aria-label="休息与下一次专注">
  <DrinkCoffee20Regular/><div className="break-message">
   <strong>{ready?'欢迎回来，准备继续了吗？':rest.phase==='offered'?rest.sessionId?'这一段已保存，休息一下再继续':'休息一下，再继续':'休息中'}{rest.phase==='running'&&!ready&&<time aria-label="休息剩余时间">{timerText(remaining)}</time>}</strong>
   <span>{ready?`下一次：${next!.title}`:rest.phase==='offered'&&rest.sessionId?'小结和事项可以稍后补充。':'离开屏幕，活动一下。休息不计入投入。'}</span>
  </div>
  <div className="break-actions">{rest.phase==='offered'?<><Button primary disabled={busy} onClick={()=>perform('break.start')}>休息 {data.state.settings.breakMinutes} 分钟</Button><Button subtle disabled={busy} onClick={()=>perform('break.stop')}>暂不休息</Button></>:ready?<><Button primary disabled={busy||rest.phase!=='ready'} onClick={()=>perform('break.continue')}><Play20Filled/>{next!.sessionId?'恢复上一事项':`开始下一次 ${data.state.settings.targetMinutes} 分钟`}</Button><Button disabled={busy} onClick={()=>void choose().catch(()=>{})}>选择其他事项</Button><Button subtle disabled={busy} onClick={()=>perform('break.stop')}>暂不开始</Button></>:<Button disabled={busy} onClick={()=>perform('break.finish')}>提前结束休息</Button>}</div>
 </section>,target);
}
