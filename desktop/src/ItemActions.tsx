import {completionLabels,type CompletionBy} from '../core/activity';
import {sessionTitle} from '../core/session-label';
import {useItemActions} from './useItemActions';
import React,{useState} from 'react';
import {branchIds,openDescendants,outlineIndex} from '../core/outline';
import {blockedReason,estimateProgress} from '../core/item-state';
import {Button,Field,Modal,minuteText,useJournal} from './ui';
import type {Task} from '../core/types';
import {useDialogAction} from './useDialogAction';

export type ItemAction='done'|'cancel'|'pause'|'resume'|'delete'|'restore'|'reopen';
const labels:Record<ItemAction,string>={done:'完成事项',cancel:'取消事项',pause:'暂停事项',resume:'恢复事项',delete:'移入回收站',restore:'从回收站恢复',reopen:'重新打开'};
export function LifecycleActions({task}:{task:Task}){
 const {data,run,dialog,busy}=useJournal();const requestState=useItemActions();const show=(action:ItemAction)=>void requestState(task.id,action).catch(()=>{});
 return <div className="lifecycle-actions">{data.stateUndoLabel&&<Button disabled={busy} onClick={()=>void run({type:'item.undo'}).catch(()=>{})}>撤销状态调整</Button>}{task.deletedAt?<Button disabled={busy} onClick={()=>show('restore')}>恢复整支</Button>:<>{task.status==='handed-off'&&<Button disabled={busy} onClick={()=>show('done')}>记录他人完成…</Button>}<Button disabled={busy} onClick={()=>show(task.status==='open'?'done':'reopen')}>{task.status==='open'?'完成事项':task.status==='handed-off'?'重新接手':'重新打开'}</Button><details><summary>更多事项操作</summary><div className="actions">{task.status==='open'&&<><Button onClick={()=>show(task.availability==='paused'?'resume':'pause')}>{task.availability==='paused'?'恢复事项':'暂停事项'}</Button><Button onClick={()=>show('cancel')}>取消事项</Button></>}<Button onClick={()=>show('delete')}>移入回收站</Button></div></details></>}</div>;
}
export function EstimateFacts({id}:{id:string}){
 const {data,dialog}=useJournal(),e=estimateProgress(data.state,id);
 return <div className="estimate-facts"><small>以下均为本项，不含子项</small>{e.exhausted&&<p className="estimate-exhausted">估计已用尽{e.overrun>0?` · 已超出 ${minuteText(e.overrun*60000)}`:''}，剩余待重估。</p>}<span>初始估计 <strong>{e.initial===null?'未记录':`${e.initial} 分钟`}</strong></span><span>已投入 <strong>{minuteText(e.spent*60000)}</strong></span><span>当前剩余 <strong>{e.exhausted?'剩余待重估':e.remaining===null?'未估计':e.explicitZero?'0 分钟（已确认）':minuteText(e.remaining*60000)}</strong></span><span>当前预计总投入 <strong>{e.total===null?'待估计':minuteText(e.total*60000)}</strong></span><Button subtle onClick={()=>dialog({type:'estimate',id})}>调整剩余估计</Button></div>;
}
export function ItemStateDialog({id,action}:{id:string;action:ItemAction}){
 const {data,run,dialog,notify}=useJournal(),task=data.state.tasks.find(t=>t.id===id)!,ids=branchIds(outlineIndex(data.state),id),children=openDescendants(data.state,id);
 const [by,setBy]=useState<CompletionBy>(task.ownership?'other':'self');
 const [choice,setChoice]=useState('manual'),{perform,dismiss,saving,error}=useDialogAction();
 const close=()=>dismiss(()=>dialog(null));
 const finishing=action==='done'||action==='cancel',affected=finishing?[task,...children]:data.state.tasks.filter(t=>ids.has(t.id)),timers=data.timers.filter(t=>(t.taskId!==null&&ids.has(t.taskId)));
 const save=async()=>{if(finishing&&children.length>0&&choice==='manual')return;if(await perform(async()=>{
  await run(finishing||action==='reopen'?{type:'task.status',payload:{id,completionBy:by,status:action==='done'?'done':action==='cancel'?'cancelled':'open',...children.length&&finishing?{children:choice}:{}}}:{type:'item.change',payload:{id,action,confirmBranch:true}});
 })){notify(`${labels[action]}已保存；可撤销事项状态，已记录投入保留。`);dialog(null);}};
 return <Modal title={labels[action]} onClose={close} busy={saving}><h3>{task.title}</h3>
  <p>{action==='pause'?'暂停此事项会阻止整支继续执行，并暂停正在运行的计时；子项自己的暂停安排保持。':action==='resume'?'恢复此事项的执行安排；子项原有的暂停安排保持。所有计时器继续保持暂停，由你主动恢复。':action==='delete'?'将此事项及子项移入回收站，结束并保存相关计时。原层级、日期、标签和历史投入保留，可恢复。':action==='restore'?'恢复同次移入回收站的整支，保留原来的完成、取消和暂停安排，不自动启动计时。':action==='reopen'?'只重新打开此事项，不改变子项状态，不自动启动计时。':'结束状态会和相关计时记录一起保存；取消仍保留投入，但不计入完成数量。'}</p>
  <p className="info-line">涉及 {affected.length} 个事项 · 当前 {timers.length} 个计时器（{timers.filter(t=>!t.paused).length} 个运行中）</p>
  {affected.length>1&&<ul className="impact-list">{affected.slice(0,12).map(t=><li key={t.id}>{t.title}{t.id===id?'（本项）':''}</li>)}{affected.length>12&&<li>还有 {affected.length-12} 个事项</li>}</ul>}
  {finishing&&children.length>0&&<Field label="未结束子项如何处理" hint="先选择子项的处理方式，或返回逐个处理。"><select aria-label="处理未结束子项" disabled={saving} value={choice} onChange={e=>{if(!saving)setChoice(e.target.value);}}><option value="manual">先返回，逐个处理子项</option><option value="done">同时完成这些子项</option><option value="cancelled">同时取消这些子项，保留投入</option></select></Field>}
  {action==='done'&&<Field label="完成归属"><select aria-label="完成归属" disabled={saving} value={by} onChange={e=>setBy(e.target.value as CompletionBy)}>{Object.entries(completionLabels).map(([id,label])=><option key={id} value={id}>{label}</option>)}</select></Field>}{error&&<p role="alert" className="form-error">{error}</p>}<footer className="modal-actions"><Button disabled={saving} onClick={close}>返回</Button><Button primary disabled={saving||(finishing&&children.length>0&&choice==='manual')} onClick={()=>void save()}>{saving?'正在保存…':`确认${labels[action]}`}</Button></footer>
 </Modal>;
}
export function StartChoiceDialog({id}:{id:string}){
 const {data,run,dialog}=useJournal(),task=data.state.tasks.find(t=>t.id===id)!;const {perform,dismiss,saving,error}=useDialogAction();
 const active=data.timers.find(t=>t.taskId===id),others=data.timers.filter(t=>!t.paused&&t.taskId!==id),reason=blockedReason(outlineIndex(data.state),id);
 const close=()=>dismiss(()=>dialog(null));
 const start=async(mode:'switch'|'concurrent')=>{if(reason)return;if(await perform(()=>run(active?{type:'focus.resume',payload:{sessionId:active.sessionId,mode}}:{type:'focus.start',payload:{taskId:id,skipEstimate:true,mode}})))dialog(null);};
 return <Modal title={`${active?'恢复':'开始'}「${task.title}」`} onClose={close} busy={saving}><p>每次只做一件事情，更容易专注。</p><p>正在计时：{others.map(t=>sessionTitle(data.state,t.taskId)).join('、')||'没有其他事项'}</p><p className="muted">切换会结束并保存其他运行中的投入，事项仍未完成。也可以让它们同时计时。</p>{(reason||error)&&<p role="alert">{reason||error}</p>}{saving&&<p role="status">正在更新计时…</p>}<footer className="modal-actions"><Button disabled={saving} onClick={close}>返回</Button><Button disabled={saving||!!reason} onClick={()=>void start('concurrent')}>同时计时</Button><Button primary disabled={saving||!!reason} onClick={()=>void start('switch')}>切换到这件事</Button></footer></Modal>;
}
