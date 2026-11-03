import React from 'react';
import {Alert20Regular} from '@fluentui/react-icons';
import type {Task} from '../core/types';
import {effectiveItemReminder,reminderTime} from '../core/item-reminders';
import {Button,minuteText,useWorkspaceJournal} from './ui';
import {EditValue} from './InlineEdit';
import {TagEditor} from './Tags';
import {ItemReminderControl} from './ItemReminder';
import {RecurrenceControl} from './RecurrenceControl';
import {ItemActivity} from './ItemActivity';
import {useDialogAction} from './useDialogAction';

/** Pure reminders have an alert acknowledgement, never task completion or new effort. */
export function ReminderContent({task,onEdit}:{task:Task;onEdit?:()=>void}){
 const {data,run,dialog,busy}=useWorkspaceJournal(),action=useDialogAction();
 const records=data.state.sessions.filter(s=>s.taskId===task.id),reminder=effectiveItemReminder(task);
 const patch=(field:string,value:string)=>{onEdit?.();return run({type:'outline.patch',payload:{id:task.id,field,value}});};
 return <div className="note-content reminder-content"><p className="note-kind"><Alert20Regular/>纯提醒</p><p className="muted">到时提醒，知道了以后等待下一次。无需完成，不计入待办或完成统计。</p><ItemReminderControl task={task}/><RecurrenceControl task={task}/>{reminder?.state==='pending'&&<Button disabled={busy||action.saving} onClick={()=>void action.perform(()=>run({type:'item-reminder.dismiss',payload:{id:task.id}}))}>知道了</Button>}<TagEditor task={task} onEdit={onEdit}/><section className="inspector-field inspector-description"><EditValue label="提醒说明" value={task.description??''} multiline empty="添加提醒内容…" onSave={value=>patch('description',value)}/></section>{records.length>0&&<details className="inspector-history"><summary>历史投入 · {minuteText(records.reduce((sum,s)=>sum+s.durationMs,0))}</summary><p className="muted">转为提醒前记录的投入仍然保留。</p>{records.map(s=><article key={s.id}><strong>{s.date} · {minuteText(s.durationMs)}</strong><p>{s.summary||'尚未填写推进内容'}</p></article>)}</details>}<ItemActivity id={task.id}/>{task.reminderHistory&&<p className="muted">转为事项会恢复原计划、截止时间、估计、今日重点、提醒与重复、审视和项目标记；已有投入不变。</p>}{action.error&&<p role="alert" className="form-error">{action.error}</p>}<div className="actions"><Button disabled={busy||action.saving||!!task.deletedAt||task.archived} onClick={()=>void action.perform(()=>patch('itemType','task'))}>转为事项</Button><Button subtle disabled={busy||action.saving} onClick={()=>dialog({type:'state',id:task.id,action:task.deletedAt?'restore':'delete'})}>{task.deletedAt?'恢复提醒':'移入回收站'}</Button></div></div>;
}

export {ReminderConvertDialog} from './ReminderConvertDialog';
