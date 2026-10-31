import React,{useRef,useState} from 'react';
import {localDate} from '../core/types';
import {sessionTitle} from '../core/session-label';
import {Button,Field,Modal,minuteText,timeText,useJournal} from './ui';
import {useDialogAction} from './useDialogAction';
import './session-start.css';

function inputTime(value:string){const date=new Date(value);return `${localDate(date)}T${String(date.getHours()).padStart(2,'0')}:${String(date.getMinutes()).padStart(2,'0')}:${String(date.getSeconds()).padStart(2,'0')}`;}

export function SessionStartControl({sessionId,compact=false}:{sessionId:string;compact?:boolean}){
 const {data,dialog,busy}=useJournal(),record=data.state.sessions.find(s=>s.id===sessionId);
 if(!record||record.status==='ended')return null;
 return <div className={`session-start-control ${compact?'compact':''}`}>
  {!compact&&record.start&&<span>开始于 {localDate(record.start)!==localDate(data.now)?`${localDate(record.start)} `:''}{timeText(record.start)}</span>}
  <Button type="button" subtle disabled={busy} aria-label={`调整开始时间 ${sessionTitle(data.state,record.taskId)}`} title="忘记计时？补入实际开始时间，继续当前计时" onClick={()=>dialog({type:'timer-start',id:sessionId})}>{compact?'开始时间':'调整开始时间'}</Button>
 </div>;
}

export function SessionStartDialog({id}:{id:string}){
 const {data,run,dialog,notify}=useJournal(),record=data.state.sessions.find(s=>s.id===id);
 const original=useRef(record?.start??data.now),initialInput=useRef(inputTime(original.current));
 const [start,setStart]=useState(initialInput.current),{perform,dismiss,saving,error}=useDialogAction();
 const close=()=>dismiss(()=>dialog(null));
 if(!record||record.status==='ended')return <Modal title="调整计时开始时间" onClose={close}><p>这次计时已结束或更新，请返回查看投入记录。</p><Button onClick={close}>返回</Button></Modal>;
 const chosen=start===initialInput.current?original.current:start,at=Date.parse(chosen),delta=Date.parse(record.segments[0].start)-at;
 const valid=Number.isFinite(at)&&at<=Date.parse(data.now)&&at<=Date.parse(record.segments[0].end)&&record.segments[0].durationMs+delta>=0&&Math.abs(delta)<=86400000;
 const total=record.durationMs+delta;
 const save=async()=>{if(await perform(()=>run({type:'focus.set-start',payload:{sessionId:id,startedAt:new Date(chosen).toISOString(),expectedStart:original.current}}))){dialog(null);notify(record.status==='paused'?'开始时间已更新，仍保持暂停；恢复后重新计算下一次提醒':'开始时间已更新，继续计时；下一次提醒从现在开始计算');}};
 return <Modal title="调整计时开始时间" onClose={close} busy={saving}><form onSubmit={e=>{e.preventDefault();void save();}}><fieldset className="dialog-fields" disabled={saving}>
  <p className="dialog-task-title">{sessionTitle(data.state,record.taskId)}</p>
  <Field label="实际开始时间" hint="把已经做过的时间补进当前计时，支持跨日期。"><input autoFocus aria-label="实际开始时间" type="datetime-local" step="1" required value={start} onChange={e=>setStart(e.target.value)}/></Field>
  <div className="session-start-presets" role="group" aria-label="快速选择开始时间">{[5,15,25,40,60].map(minutes=><Button type="button" key={minutes} onClick={()=>setStart(inputTime(new Date(Date.parse(data.now)-minutes*60000).toISOString()))}>{minutes} 分钟前</Button>)}</div>
  <div className="session-start-preview" aria-live="polite">{valid?<><span>{delta>=0?'补入':'减少'} <strong>{minuteText(Math.abs(delta))}</strong></span><span>本次累计 <strong>{minuteText(total)}</strong></span></>:<p>请选择过去的有效时间；不能越过第一次暂停，单次调整最多 24 小时。</p>}</div>
  <p className="session-start-reminder">{record.status==='paused'?'保存后仍保持暂停，恢复后':'保存后继续计时，从现在起'}再专注 <strong>{record.targetMinutes} 分钟</strong>才提醒，暂停不消耗这段时间。</p>
  <p className="muted">保留当前记录及已有暂停片段，事项投入、今日与日历同步更新。{record.taskId===null?'之后仍可补充事项。':'与同一事项的已有投入重叠时会提示，不会重复计入。'}</p>
  {error&&<p role="alert" className="form-error">{error}</p>}
  <footer className="modal-actions"><Button type="button" subtle disabled={saving} onClick={close}>取消</Button><Button type="submit" primary disabled={saving||!valid||at===Date.parse(original.current)}>{saving?'正在保存…':record.status==='paused'?'保存开始时间':'保存并继续计时'}</Button></footer>
 </fieldset></form></Modal>;
}
