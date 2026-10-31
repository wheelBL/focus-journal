import React,{useState} from 'react';
import {sessionTitle} from '../core/session-label';
import {localDate} from '../core/types';
import {useJournal,Button,Modal,minuteText,timeText} from './ui';
import {DeletedEffortDialog} from './EffortTrash';
import {useDialogAction} from './useDialogAction';

type Target={kind:'effort'|'reminder'|'event';id:string};

export function useCalendarActions(){
 const [target,setTarget]=useState<Target|null>(null),[trash,setTrash]=useState(false);
 const close=()=>setTarget(null);
 const entryProps=(kind:Target['kind'],id:string)=>({
  onContextMenu:(e:React.MouseEvent)=>{e.preventDefault();e.stopPropagation();setTarget({kind,id});},
  onKeyDown:(e:React.KeyboardEvent)=>{if(e.key==='ContextMenu'||e.key==='F10'&&e.shiftKey){e.preventDefault();e.stopPropagation();setTarget({kind,id});}},
 });
 return {entryProps,showRecord:(id:string)=>setTarget({kind:'effort',id}),openTrash:()=>setTrash(true),overlays:<>
  {target&&<CalendarActionDialog key={`${target.kind}-${target.id}`} target={target} close={close}/>}
  {trash&&<DeletedEffortDialog close={()=>setTrash(false)}/>}
 </>};
}

function CalendarActionDialog({target,close}:{target:Target;close:()=>void}){
 const {data,run,dialog,busy,notify}=useJournal(),[confirm,setConfirm]=useState(false);
 const action=useDialogAction();
 const record=target.kind==='effort'?data.state.sessions.find(s=>s.id===target.id):null;
 const task=data.state.tasks.find(t=>t.id===(record?record.taskId:target.id));
 if(target.kind==='effort'&&!record||target.kind!=='effort'&&!task)return null;
 const remove=async()=>{if(await action.perform(()=>run(record?{type:'session.delete',payload:{id:record.id}}:{type:'item-reminder.set',payload:{id:task!.id,at:null}}))){notify(record?'投入已删除，可在今日或日历的“已删除投入”中恢复':'提醒已移除');close();}};
 return <Modal title={record?'这段投入':'日历操作'} onClose={()=>action.dismiss(close)} busy={action.saving}><div className="calendar-block-popover">
  <h3>{record?sessionTitle(data.state,record.taskId):task!.title}</h3>
  {record?<><p>{record.date} · {minuteText(record.durationMs)} · {record.manual?'手动补记':'计时记录'}</p>{record.segments.map((seg,i)=><p key={i}>{localDate(seg.start)} {timeText(seg.start)}–{timeText(seg.end)}</p>)}{record.summary&&<p>{record.summary}</p>}</>:<p>{target.kind==='reminder'?'移除提醒不会删除事项，也不会改变实际投入。':task!.recurrence?'这是重复事件；删除会将整个系列移入事项回收站。':'删除会将事件移入事项回收站。'}</p>}
  {action.error&&<p className="form-error" role="alert">{action.error}</p>}
  {confirm?<section className="calendar-delete-confirm" role="alert"><p>删除这次投入的全部片段，共 {minuteText(record!.durationMs)}？关联事项会保留，累计投入与回顾会同步扣除；可以恢复。</p><div className="actions"><Button disabled={busy} onClick={()=>void remove()}>确认删除投入</Button><Button disabled={action.saving} onClick={()=>setConfirm(false)}>取消</Button></div></section>:<div className="actions">
   {record&&<Button primary disabled={record.status!=='ended'} onClick={()=>{close();dialog({type:task?'manual':'assign',id:record.id});}}>{task?'校正这段投入':'补充事项'}</Button>}
   {task&&<Button onClick={()=>{close();dialog({type:'detail',id:task.id});}}>查看事项</Button>}
   {record?<Button disabled={busy||record.status!=='ended'} onClick={()=>setConfirm(true)}>删除投入记录</Button>:target.kind==='reminder'?<Button disabled={busy} onClick={()=>void remove()}>移除提醒</Button>:<Button onClick={()=>{close();dialog({type:'state',id:task!.id,action:'delete'});}}>{task!.recurrence?'删除整个重复系列':'删除事件'}</Button>}
   {target.kind==='reminder'&&<Button onClick={()=>{close();dialog({type:'state',id:task!.id,action:'delete'});}}>删除事项</Button>}
  </div>}
  {record&&record.status!=='ended'&&<p>这次专注尚未结束，结束后可以校正或删除。</p>}
 </div></Modal>;
}
