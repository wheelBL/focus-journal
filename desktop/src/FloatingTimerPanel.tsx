import React,{useEffect,useRef,useState} from 'react';
import {ChevronDown20Regular,ChevronUp20Regular,ReOrderDotsVertical20Regular,Circle16Filled,Pause20Filled,Play20Filled,Stop20Filled,DrinkCoffee20Regular} from '@fluentui/react-icons';
import {floatingReadout,floatingTime,restKey,type FloatingTimerAction,type FloatingTimerApi,type FloatingTimerState} from '../core/floating-timer';
import './floating-timer.css';
declare global {interface Window {floatingTimer?:FloatingTimerApi}}

export default function FloatingTimerPanel(){
 const [data,setData]=useState<FloatingTimerState|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const lock=useRef(false),toggle=useRef<HTMLButtonElement>(null);
 useEffect(()=>{
  document.body.classList.add('floating-timer-body');document.documentElement.classList.add('floating-timer-root');
  let alive=true,updated=false;const off=window.floatingTimer?.onChanged(value=>{updated=true;if(alive)setData(value);});
  void window.floatingTimer?.snapshot().then(value=>{if(alive&&!updated)setData(value);}).catch(e=>{if(alive)setError(String(e));});
  return()=>{alive=false;off?.();document.body.classList.remove('floating-timer-body');document.documentElement.classList.remove('floating-timer-root');};
 },[]);
 const perform=async(action:FloatingTimerAction,id?:string)=>{
  if(lock.current)return;lock.current=true;setBusy(true);setError('');
  try{await window.floatingTimer?.action(action,id);if(action==='collapse')toggle.current?.focus();}
  catch(e){setError(e instanceof Error?e.message:String(e));}finally{lock.current=false;setBusy(false);}
 };
 if(!data)return <main className="floating-timer loading" role="status">{error||'正在读取计时…'}</main>;
 const view=floatingReadout(data),timer=view.timer,rest=timer?null:data.rest,id=timer?.sessionId??(rest?restKey(rest):undefined);
 const otherRunning=data.timers.some(t=>t.sessionId!==timer?.sessionId&&!t.paused),count=data.timers.length+(data.rest?1:0);
 const act=(action:FloatingTimerAction)=>()=>void perform(action,id);
 return <main className={`floating-timer ${view.tone} ${data.expanded?'expanded':''}`} aria-label="屏边计时签" onKeyDown={e=>{if(e.key==='Escape'&&data.expanded){e.preventDefault();void perform('collapse');}}}>
  <header className="floating-strip">
   <span className="floating-grip" title="拖动计时签"><ReOrderDotsVertical20Regular aria-hidden="true"/></span>
   <button ref={toggle} className="floating-toggle" aria-expanded={data.expanded} aria-controls="floating-controls" aria-label={`${data.expanded?'收起':'展开'}计时操作：${view.title}，${view.label} ${view.value}`} title={`${view.title} · 点击${data.expanded?'收起':'展开'}操作`} onClick={()=>void perform(data.expanded?'collapse':'expand')}>
    <Circle16Filled className="floating-status" aria-hidden="true"/>
    <span className="floating-title">{view.title}</span>
    <span className="floating-readout"><span>{view.label}</span><time className={rest?.phase==='ready'?'ready-label':undefined}>{view.value}</time></span>
    {data.expanded?<ChevronUp20Regular aria-hidden="true"/>:<ChevronDown20Regular aria-hidden="true"/>}
   </button>
  </header>
  {data.expanded&&<section id="floating-controls" className="floating-controls" aria-label="计时操作">
   <h1>{timer?.title??(rest?.phase==='ready'?'欢迎回来，准备继续了吗？':rest?.phase==='offered'?'这一段投入已保存':'休息中')}</h1>
   {timer?<>
    <p className="floating-meta">已投入 {floatingTime(timer.durationMs)} · 目标 {timer.targetMinutes} 分钟{timer.paused&&' · 已暂停'}</p>
    <div className="floating-actions"><button disabled={busy} onClick={act(timer.paused?'resume':'pause')}>{timer.paused?<Play20Filled/>:<Pause20Filled/>}{timer.paused?'恢复':'暂停'}</button><button disabled={busy} onClick={act('stop')}><Stop20Filled/>结束本次</button></div>
    <button className="floating-rest-action" disabled={busy||otherRunning} onClick={act('stop-rest')}><DrinkCoffee20Regular/>结束并休息 {data.breakMinutes} 分钟</button>
    {otherRunning?<p className="floating-hint">先暂停或结束其他计时器，再休息。</p>:<p className="floating-hint">{view.tone==='overtime'?'已超过目标，投入仍在记录。':'到时提醒，直到你主动结束。'}</p>}
   </>:rest?<>
    <p className="floating-meta">{rest.phase==='ready'?`下一次：${rest.title}`:rest.phase==='offered'?'事项和小结可以稍后补充。':'离开屏幕活动一下，休息不计入投入。'}</p>
    <div className="floating-actions">
     {rest.phase==='offered'?<><button className="is-primary" disabled={busy} onClick={act('rest-start')}>休息 {data.breakMinutes} 分钟</button><button disabled={busy} onClick={act('rest-stop')}>暂不休息</button></>:rest.phase==='running'?<button disabled={busy} onClick={act('rest-finish')}>提前结束休息</button>:<><button className="is-primary" disabled={busy} onClick={act('rest-continue')}>继续专注</button><button disabled={busy} onClick={act('rest-stop')}>暂不开始</button></>}
    </div>
    {rest.phase==='ready'&&<button className="floating-text" disabled={busy} onClick={act('rest-start')}>再休息 {data.breakMinutes} 分钟</button>}
    {rest.sessionId&&<button className="floating-text" disabled={busy} onClick={act('review')}>补充事项 / 本次小结</button>}
   </>:null}
   {count>1&&<section className="floating-switcher" aria-label="选择显示的计时">
    <p>{data.timers.length} 项计时{data.timers.filter(t=>!t.paused).length>1?' · 一次专注一件事':''}</p>
    <div>{data.timers.map(t=><button key={t.sessionId} disabled={busy} aria-pressed={data.selectedId===t.sessionId} onClick={()=>void perform('select',t.sessionId)}><span>{t.title}</span><small>{t.paused?'暂停':floatingTime(t.durationMs)}</small></button>)}{data.rest&&<button disabled={busy} aria-pressed={data.selectedId===restKey(data.rest)} onClick={()=>void perform('select',restKey(data.rest!))}><span>休息与下一次专注</span></button>}</div>
   </section>}
   {error&&<p className="floating-error" role="alert">{error}</p>}
   <footer><button disabled={busy} onClick={act('open')}>打开主界面</button><button disabled={busy} title="只隐藏计时签，计时继续；可从托盘重新显示" onClick={act('hide')}>隐藏计时签</button></footer>
  </section>}
 </main>;
}
