import React,{useEffect,useRef,useState} from 'react';
import {Alert24Regular,Dismiss20Regular,Stop20Filled,Clock20Regular} from '@fluentui/react-icons';
import {Button,timerText,minuteText,localDateTimeInput} from './ui';
import {ReminderAudio} from './reminder-audio';
import type {ReminderApi,ReminderAction,ReminderWindowState} from '../core/types';
declare global {interface Window {reminder?:ReminderApi}}

export default function ReminderPanel(){
 const [data,setData]=useState<ReminderWindowState|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const player=useRef(new ReminderAudio()),lastCue=useRef(0);
 useEffect(()=>{
  document.body.classList.add('reminder-body');let alive=true,updated=false;
  const off=window.reminder?.onChanged(s=>{updated=true;if(alive)setData(s);});
  void window.reminder?.snapshot().then(s=>{if(alive&&!updated)setData(s);}).catch(e=>setError(String(e)));
  return()=>{alive=false;off?.();player.current.stop();document.body.classList.remove('reminder-body');};
 },[]);
 useEffect(()=>{
  const cue=data?.cue;if(!cue){player.current.stop();return;}if(cue.id===lastCue.current)return;lastCue.current=cue.id;
  void player.current.play(cue.volume).then(()=>window.reminder?.audioResult(cue.id)).catch(e=>{const message=e instanceof Error?e.message:String(e);setError(message);window.reminder?.audioResult(cue.id,message);});
 },[data?.cue?.id]);
 const hasItems=data?.alerts.some(a=>a.kind==='task'),hasBreak=data?.alerts.some(a=>a.kind==='break');
 const action=async(kind:ReminderAction,sessionId?:string)=>{if(busy)return;setBusy(true);setError('');player.current.stop();try{await window.reminder?.action(kind,sessionId);}catch(e){setError(e instanceof Error?e.message:String(e));}finally{setBusy(false);}};
 return <main className="reminder-panel"><header className="reminder-heading"><div><Alert24Regular/><strong>{data?.preview?'提醒效果预览':hasItems?'事项提醒到了':hasBreak?'休息结束了':'专注目标时间到了'}</strong></div>{data?.preview&&<Button subtle aria-label="关闭预览" onClick={()=>void action('close-preview')}><Dismiss20Regular/></Button>}</header>
  <p className="reminder-intro">{data?.preview?'这是示例提醒，不会修改任何计时或投入记录。':hasItems?'按安排提醒你看看这件事。查看或确认不会启动计时。':hasBreak?'休息已经结束。欢迎回来，准备好后再开始下一次专注。':'计时仍在继续。可以结束并休息，也可以按自己的节奏继续。'}</p>
  <div className="reminder-list">{data?.alerts.map(item=><article className="reminder-item" key={item.sessionId} aria-label={`${item.title}的到时提醒`}>
   <h1>{item.title}</h1>{item.kind==='break'?<><p className="scheduled-reminder-time">下一次：{item.continuationTitle}</p><div className="reminder-actions"><Button primary disabled={busy} onClick={()=>void action('continue',item.sessionId)}>继续专注</Button><Button disabled={busy} onClick={()=>void action('restart-break',item.sessionId)}>再休息 {item.breakMinutes??5} 分钟</Button><Button subtle disabled={busy} onClick={()=>void action('choose',item.sessionId)}>回到工作台选择事项</Button><Button subtle disabled={busy} onClick={()=>void action('dismiss',item.sessionId)}>暂不开始</Button></div></>:item.kind==='task'?<><p className="scheduled-reminder-time">提醒时间 · {localDateTimeInput(item.remindAt).replace('T',' ')}</p><div className="reminder-actions"><Button primary disabled={busy} onClick={()=>void action('open',item.sessionId)}>查看事项</Button><Button disabled={busy} onClick={()=>void action('snooze',item.sessionId)}><Clock20Regular/>5 分钟后再提醒</Button><Button subtle disabled={busy} onClick={()=>void action('dismiss',item.sessionId)}>知道了</Button></div></>:<><div className="reminder-time"><strong>{timerText(item.durationMs)}</strong><span>目标 {item.targetMinutes} 分钟<br/>已超过 {minuteText(Math.max(0,item.durationMs-item.targetMinutes*60000))}</span></div>
   <div className="reminder-actions"><Button primary disabled={busy||item.canRest===false} onClick={()=>void action('stop-rest',item.sessionId)}>结束并休息 {item.breakMinutes??5} 分钟</Button><Button disabled={busy} onClick={()=>void action('stop',item.sessionId)}><Stop20Filled/>仅结束本次</Button><Button disabled={busy} onClick={()=>void action('snooze',item.sessionId)}><Clock20Regular/>5 分钟后再提醒</Button><Button subtle disabled={busy} onClick={()=>void action('dismiss',item.sessionId)}>继续，本次不再提醒</Button></div>{item.canRest===false&&<p className="reminder-rest-hint">还有其他计时器在运行，先暂停或结束它们再休息。</p>}</>}
  </article>)}</div>
  {error&&<p className="reminder-error" role="alert">{error}</p>}
  <footer>{data?.preview?'试试按钮，体验提醒的处理方式。':hasBreak?'专注由你主动开始；收起后，工作台保留继续入口。':data?.alerts.length?'每项单独处理 · 关闭此窗口会在 5 分钟后再提醒':'当前没有需要处理的到时提醒。'}</footer>
 </main>;
}
