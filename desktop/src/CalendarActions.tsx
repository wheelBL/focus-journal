import React,{useState} from 'react';
import {sessionTitle} from '../core/session-label';
import {localDate,type Session} from '../core/types';
import {useJournal,Button,Modal,minuteText,timeText} from './ui';

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
 const record=target.kind==='effort'?data.state.sessions.find(s=>s.id===target.id):null;
 const task=data.state.tasks.find(t=>t.id===(record?record.taskId:target.id));
 if(target.kind==='effort'&&!record||target.kind!=='effort'&&!task)return null;
 const remove=async()=>{try{await run(record?{type:'session.delete',payload:{id:record.id}}:{type:'item-reminder.set',payload:{id:task!.id,at:null}});notify(record?'投入已删除，可在日历的“已删除投入”中恢复':'提醒已移除');close();}catch{}};
 return <Modal title={record?'这段投入':'日历操作'} onClose={close}><div className="calendar-block-popover">
  <h3>{record?sessionTitle(data.state,record.taskId):task!.title}</h3>
  {record?<><p>{record.date} · {minuteText(record.durationMs)} · {record.manual?'手动补记':'计时记录'}</p>{record.segments.map((seg,i)=><p key={i}>{localDate(seg.start)} {timeText(seg.start)}–{timeText(seg.end)}</p>)}{record.summary&&<p>{record.summary}</p>}</>:<p>{target.kind==='reminder'?'移除提醒不会删除事项，也不会改变实际投入。':task!.recurrence?'这是重复事件；删除会将整个系列移入事项回收站。':'删除会将事件移入事项回收站。'}</p>}
  {confirm?<section className="calendar-delete-confirm" role="alert"><p>删除这次投入的全部片段，共 {minuteText(record!.durationMs)}？关联事项会保留，累计投入与回顾会同步扣除；可以恢复。</p><div className="actions"><Button disabled={busy} onClick={()=>void remove()}>确认删除投入</Button><Button onClick={()=>setConfirm(false)}>取消</Button></div></section>:<div className="actions">
   {record&&<Button primary disabled={record.status!=='ended'} onClick={()=>{close();dialog({type:task?'manual':'assign',id:record.id});}}>{task?'校正这段投入':'补充事项'}</Button>}
   {task&&<Button onClick={()=>{close();dialog({type:'detail',id:task.id});}}>查看事项</Button>}
   {record?<Button disabled={busy||record.status!=='ended'} onClick={()=>setConfirm(true)}>删除投入记录</Button>:target.kind==='reminder'?<Button disabled={busy} onClick={()=>void remove()}>移除提醒</Button>:<Button onClick={()=>{close();dialog({type:'state',id:task!.id,action:'delete'});}}>{task!.recurrence?'删除整个重复系列':'删除事件'}</Button>}
   {target.kind==='reminder'&&<Button onClick={()=>{close();dialog({type:'state',id:task!.id,action:'delete'});}}>删除事项</Button>}
  </div>}
  {record&&record.status!=='ended'&&<p>这次专注尚未结束，结束后可以校正或删除。</p>}
 </div></Modal>;
}

function DeletedEffortDialog({close}:{close:()=>void}){
 const {data,run,busy,notify}=useJournal();
 const records=[...data.state.deletedSessions].sort((a,b)=>b.deletedAt.localeCompare(a.deletedAt));
 const restore=async(record:Session)=>{try{await run({type:'session.restore',payload:{id:record.id}});notify('投入已恢复，事项累计时间已更新');}catch{}};
 return <Modal title="已删除投入" onClose={close}><p>恢复后重新计入关联事项、日历和回顾。事项本身的完成状态不变。</p><div className="calendar-trash-list">{records.length?records.map(record=><article key={record.id}><div><strong>{sessionTitle(data.state,record.taskId)}</strong><p>{record.date} · {record.start?`${timeText(record.start)}–${timeText(record.end)}`:'未指定时间'} · {minuteText(record.durationMs)}</p>{record.summary&&<p>{record.summary}</p>}</div><Button disabled={busy} aria-label={`恢复投入 ${sessionTitle(data.state,record.taskId)}`} onClick={()=>void restore(record)}>恢复</Button></article>):<p>没有已删除的投入记录。</p>}</div></Modal>;
}
