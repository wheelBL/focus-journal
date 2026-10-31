import React from 'react';
import {sessionTitle} from '../core/session-label';
import {localDate,type Session} from '../core/types';
import {useJournal,Button,Modal,minuteText,timeText} from './ui';
import {useDialogAction} from './useDialogAction';
import './effort-trash.css';

export function DiscardEffortConfirmation({record,summary,onCancel,onDiscard,cancelLabel='返回补充'}:{record:Session;summary?:string;onCancel:()=>void;onDiscard:()=>void;cancelLabel?:string}){
 const {data,run,notify}=useJournal(),action=useDialogAction();
 const discard=async()=>{
  if(await action.perform(()=>run({type:'session.delete',payload:{id:record.id,...summary===undefined?{}:{summary}}}))){
   notify('投入已移入“已删除投入”，不再计入时长，可从今日或日历恢复');onDiscard();
  }
 };
 return <section className="effort-discard" aria-label="确认放弃这段投入" aria-busy={action.saving}>
  <h3>{sessionTitle(data.state,record.taskId)}</h3>
  <p>{record.date} · {timeText(record.start)}–{record.end&&localDate(record.end)!==record.date?`${localDate(record.end)} `:''}{timeText(record.end)} · <strong>{minuteText(record.durationMs)}</strong></p>
  <p>放弃后，这段投入会移入“已删除投入”，不再计入累计时长，也不再列入待补充事项。原始时段和进展保留，可以恢复。</p>
  {record.segments.length>1&&<p className="muted">包含 {record.segments.length} 段投入，暂停时间已扣除。</p>}
  {action.error&&<p className="form-error" role="alert">{action.error}</p>}
  <footer className="modal-actions"><Button autoFocus type="button" disabled={action.saving} onClick={()=>action.dismiss(onCancel)}>{cancelLabel}</Button><Button type="button" className="danger-action" disabled={action.saving} onClick={()=>void discard()}>{action.saving?'正在放弃…':'确认放弃投入'}</Button></footer>
 </section>;
}

export function DiscardEffortDialog({id}:{id:string}){
 const {data,dialog,busy}=useJournal(),record=data.state.sessions.find(s=>s.id===id);
 const close=()=>{if(!busy)dialog(null);};
 return <Modal title="放弃这段投入" onClose={close} busy={busy}>
  {record?.status==='ended'?<DiscardEffortConfirmation record={record} cancelLabel="保留记录" onCancel={close} onDiscard={()=>dialog(null)}/>:<><p>这段投入已更新，请返回查看。</p><Button onClick={close}>返回</Button></>}
 </Modal>;
}

export function DeletedEffortDialog({close}:{close:()=>void}){
 const {data,run,notify}=useJournal(),action=useDialogAction();
 const records=[...data.state.deletedSessions].sort((a,b)=>b.deletedAt.localeCompare(a.deletedAt));
 const restore=async(record:Session)=>{
  if(await action.perform(()=>run({type:'session.restore',payload:{id:record.id}})))notify(record.taskId===null?'投入已恢复，可在待补充事项中继续关联':'投入已恢复，事项累计时间已更新');
 };
 return <Modal title="已删除投入" onClose={()=>action.dismiss(close)} busy={action.saving}>
  <p>恢复后重新计入累计投入、日历和回顾。未关联事项的记录会回到待补充列表；已有事项的完成状态不变。</p>
  {action.error&&<p className="form-error" role="alert">{action.error}</p>}
  <div className="effort-trash-list">{records.length?records.map(record=><article key={record.id}><div><strong>{sessionTitle(data.state,record.taskId)}</strong><p>{record.date} · {record.start?`${timeText(record.start)}–${record.end&&localDate(record.end)!==record.date?`${localDate(record.end)} `:''}${timeText(record.end)}`:'未指定时间'} · {minuteText(record.durationMs)}</p>{record.summary&&<p>{record.summary}</p>}</div><Button disabled={action.saving} aria-label={`恢复投入 ${sessionTitle(data.state,record.taskId)}`} onClick={()=>void restore(record)}>恢复</Button></article>):<p>没有已删除的投入记录。</p>}</div>
  <footer className="modal-actions"><Button disabled={action.saving} onClick={()=>action.dismiss(close)}>关闭</Button></footer>
 </Modal>;
}
