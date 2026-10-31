import React,{useState} from 'react';
import {CheckmarkCircle20Filled} from '@fluentui/react-icons';
import {useItemActions} from './useItemActions';
import {useDialogAction} from './useDialogAction';
import {restUnavailableReason} from './rest-availability';
import {Button,Field,Modal,minuteText,timeText,useJournal} from './ui';

export function SummaryForm({id}:{id:string}){
 const {data,run,dialog}=useJournal(),requestState=useItemActions();
 const session=data.state.sessions.find(s=>s.id===id),task=data.state.tasks.find(t=>t.id===session?.taskId);
 const [summary,setSummary]=useState(session?.summary??''),[remaining,setRemaining]=useState('');
 const {perform,dismiss,saving,error}=useDialogAction();
 const persist=(rest=false)=>run({type:'session.summary',payload:{id,summary,remainingMinutes:remaining===''?null:Number(remaining),rest}});
 const save=async(rest=false)=>{if(await perform(()=>persist(rest)))dialog(null);};
 const dirty=!!session&&(summary!==session.summary||remaining!=='');
 const restReason=restUnavailableReason(data);
 const close=()=>{if(dirty)void save();else dismiss(()=>dialog(null));};
 if(!session||!task)return <Modal title="结束本次后" onClose={()=>dialog(null)}><p>这段投入已更新，请返回查看。</p><Button onClick={()=>dialog(null)}>返回</Button></Modal>;
 return <Modal title="结束本次后" onClose={close} busy={saving}><form onSubmit={e=>{e.preventDefault();void save();}}><fieldset disabled={saving} className="dialog-fields">
  <div className="saved-heading"><CheckmarkCircle20Filled/><div><h3>已记录 {minuteText(session.durationMs)}</h3><p>{timeText(session.start)}–{timeText(session.end)} · {task.status==='done'?'任务已完成':'任务继续进行'}</p></div></div>
  <p className="muted">时间已经保存。稍后填写会保留已输入的小结和剩余估计。</p>
  <Field label="本次推进了什么"><textarea autoFocus aria-label="本次推进了什么" rows={3} maxLength={2000} value={summary} onChange={e=>setSummary(e.target.value)} placeholder="留下可回顾的结果，而不只是一个时长"/></Field>
  <Field label="估计还需要多少分钟（可选）" hint={`原估计 ${task.estimateMinutes??'未填写'} 分钟将继续保留。`}><input type="number" min={0} max={1440} value={remaining} onChange={e=>setRemaining(e.target.value)}/></Field>
  {error&&<p role="alert" className="form-error">{error}</p>}
  {restReason&&<p className="muted" role="status">{restReason}</p>}
  <footer className="modal-actions"><Button subtle type="button" disabled={saving} onClick={close}>{dirty?'保存进展，稍后填写':'稍后填写'}</Button><Button type="submit" disabled={saving}>保存小结</Button>{task.status==='open'&&<Button type="button" disabled={saving} onClick={()=>void perform(async()=>{await persist();if(await requestState(task.id,'done'))dialog(null);})}>完成事项…</Button>}<Button primary type="button" disabled={saving||!!restReason} title={restReason??undefined} onClick={()=>void save(true)}>保存并休息 {data.state.settings.breakMinutes} 分钟</Button></footer>
 </fieldset></form></Modal>;
}
