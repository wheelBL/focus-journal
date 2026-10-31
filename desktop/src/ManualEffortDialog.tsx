import React,{useMemo,useState} from 'react';
import {effortDestinations} from '../core/effort-destination';
import {outlineIndex,outlinePath} from '../core/outline';
import {localDate} from '../core/types';
import {Button,Field,Modal,minuteText,timeText,useJournal} from './ui';
import {useDialogAction} from './useDialogAction';

const dateTimeInput=(iso:string|null|undefined,date:string,time:string)=>iso?`${localDate(iso)}T${timeText(iso)}`:`${date}T${time}`;

export function ManualForm({id,initialTask}:{id?:string;initialTask?:string}){
 const {data,date,run,dialog,notify}=useJournal(),record=data.state.sessions.find(s=>s.id===id);
 const items=useMemo(()=>effortDestinations(data.state,record?.taskId),[data.state.tasks,record?.taskId]);
 const index=useMemo(()=>outlineIndex(data.state),[data.state.tasks]);
 const [taskId,setTask]=useState(record?record.taskId??'':items.find(t=>t.id===(initialTask??data.state.settings.selectedTaskId))?.id??'');
 const [mode,setMode]=useState<'keep'|'range'|'duration'>(record?'keep':'range'),[query,setQuery]=useState('');
 const paths=useMemo(()=>new Map(items.map(task=>[task.id,outlinePath(index,task.id).map(node=>node.title).join(' / ')])),[items,index]);
 const matches=items.filter(task=>paths.get(task.id)!.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())),visible=matches.slice(0,40),selected=items.find(task=>task.id===taskId);
 const [recordDate,setDate]=useState(record?.date??date),[start,setStart]=useState(dateTimeInput(record?.start,date,'09:00')),[end,setEnd]=useState(dateTimeInput(record?.end,date,'09:25'));
 const [minutes,setMinutes]=useState(String(record?Math.round(record.durationMs/60000*100)/100:25)),[summary,setSummary]=useState(record?.summary??''),[reason,setReason]=useState('');
 const {perform,dismiss,saving,error}=useDialogAction(),close=()=>dismiss(()=>dialog(null));
 const duration=mode==='keep'?record?.durationMs??0:mode==='range'?Date.parse(end)-Date.parse(start):Number(minutes)*60000;
 const validDuration=mode==='keep'?!!record:Number.isFinite(duration)&&duration>0&&duration<=86400000;
 const save=async()=>{if(await perform(()=>run({type:'session.manual',payload:{id,taskId,summary,reason,...mode==='keep'?{preserveTiming:true}:{date:recordDate,minutes:mode==='duration'?Number(minutes):25,start:mode==='range'?new Date(start).toISOString():null,end:mode==='range'?new Date(end).toISOString():null}}}))){dialog(null);notify(mode==='keep'?'归属和进展已保存，原始时段保持不变。':'投入记录已保存，事项和日历已更新。');}};
 return <Modal title={id?'校正投入记录':'补记实际投入'} onClose={close} busy={saving}>
  {id&&!record?<><p>这段投入已更新或移入已删除投入，请返回查看。</p><Button onClick={close}>返回</Button></>:!items.length?<><p>还没有可补记投入的事项。可以先新建一件事。</p><footer className="modal-actions"><Button onClick={close}>取消</Button><Button primary onClick={()=>dialog({type:'task'})}>新建事项</Button></footer></>:<form onSubmit={e=>{e.preventDefault();void save();}}><fieldset disabled={saving} className="dialog-fields">
   {items.length>8&&<Field label="查找事项"><input type="search" aria-label="查找补记事项" value={query} onChange={e=>setQuery(e.target.value)} placeholder="按名称或路径搜索"/></Field>}
   <Field label="这段时间推进了哪个事项"><select aria-label="这段时间推进了哪个任务" value={taskId} onChange={e=>setTask(e.target.value)} required><option value="">选择一个事项</option>{selected&&!visible.includes(selected)&&<option value={selected.id}>{paths.get(selected.id)}（已选择）</option>}{visible.map(t=><option key={t.id} value={t.id}>{paths.get(t.id)}</option>)}</select></Field>{matches.length>40&&<p className="muted">显示前 40 项，输入名称或路径缩小范围。</p>}
   <div className="segmented field" role="group" aria-label="投入时间编辑方式">{record&&<button type="button" aria-pressed={mode==='keep'} className={mode==='keep'?'active':''} onClick={()=>setMode('keep')}>保留原始时段</button>}<button type="button" aria-pressed={mode==='range'} className={mode==='range'?'active':''} onClick={()=>setMode('range')}>{record?'修改起止时间':'知道起止时间'}</button><button type="button" aria-pressed={mode==='duration'} className={mode==='duration'?'active':''} onClick={()=>setMode('duration')}>{record?'修改日期和时长':'只记得日期和时长'}</button></div>
   {mode==='keep'&&record?<p className="info-line">{record.date} · {record.start?`${timeText(record.start)}–${record.end&&localDate(record.end)!==record.date?`${localDate(record.end)} `:''}${timeText(record.end)}`:'未指定具体时间'} · {minuteText(record.durationMs)}{record.segments.length>1?` · ${record.segments.length} 段投入，已扣除暂停`:''}。修改归属或进展不会改变这些时段。</p>:mode==='range'?<div className="form-grid"><Field label="实际开始"><input aria-label="实际开始" type="datetime-local" required value={start} onChange={e=>setStart(e.target.value)}/></Field><Field label="实际结束"><input aria-label="实际结束" type="datetime-local" required value={end} onChange={e=>setEnd(e.target.value)}/></Field></div>:<div className="form-grid"><Field label="投入日期"><input aria-label="投入日期" type="date" required value={recordDate} onChange={e=>setDate(e.target.value)}/></Field><Field label="实际投入（分钟）"><input aria-label="实际投入（分钟）" type="number" min={0.1} max={1440} step="any" required value={minutes} onChange={e=>setMinutes(e.target.value)}/></Field></div>}
   {mode!=='keep'&&<p className="manual-duration-preview" role="status">{validDuration?`将记录 ${minuteText(duration)}${mode==='duration'?' · 不指定具体时段':''}`:'请输入有效时长；结束应晚于开始，单次不超过 24 小时。'}</p>}
   {record&&mode!=='keep'&&record.segments.length>0&&<p className="info-line">{mode==='range'?'保存后会用这一个连续时段替换原记录；如有暂停，请在实际时长中核对。':'保存后不再指定具体时段，记录会移到日历的“时间未指定”。'}原始片段会保留在修改历史中。</p>}
   <Field label="这段时间的进展（可选）"><textarea aria-label="这段时间的进展" rows={2} maxLength={2000} value={summary} onChange={e=>setSummary(e.target.value)}/></Field>
   {record&&<Field label="校正原因"><input aria-label="校正原因" required value={reason} maxLength={2000} onChange={e=>setReason(e.target.value)} placeholder={mode==='keep'?'例如：补充成果或修正归属':'例如：忘记暂停，扣除离开电脑的时间'}/></Field>}
   <p className="muted">具体时间段不能与同一事项的已有投入重叠。未指定时间的记录会在日历中单独列出。</p>
   {error&&<p role="alert" className="form-error">{error}</p>}
   <footer className="modal-actions"><Button subtle type="button" disabled={saving} onClick={close}>取消</Button><Button primary type="submit" disabled={saving||!selected||!validDuration}>{saving?'正在保存…':'保存记录'}</Button></footer>
  </fieldset></form>}
 </Modal>;
}
