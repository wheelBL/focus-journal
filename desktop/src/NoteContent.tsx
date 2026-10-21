import {isEvent} from '../core/item-kind';
import React from 'react';
import {Subtract20Regular,Calendar20Regular} from '@fluentui/react-icons';
import type {Task} from '../core/types';
import {EditValue} from './InlineEdit';
import {TagEditor} from './Tags';
import {useWorkspaceJournal,Button,localDateTimeInput} from './ui';

/** Pure information has no estimate, completion checkbox, plan or timer. */
export function NoteContent({task,onEdit}:{task:Task;onEdit?:()=>void}){
 const {run,dialog,busy}=useWorkspaceJournal();
 const patch=(field:string,value:string)=>{onEdit?.();return run({type:'outline.patch',payload:{id:task.id,field,value}});};
 return <div className="note-content"><p className="note-kind">{isEvent(task)?<Calendar20Regular/>:<Subtract20Regular/>}{isEvent(task)?'事件内容':'笔记／信息'}</p><TagEditor task={task} onEdit={onEdit}/><section className="inspector-field inspector-description"><EditValue label="笔记内容" value={task.description??''} multiline empty="记录信息、想法或参考内容…" onSave={value=>patch('description',value)}/></section><div className="note-dates"><span>创建于 {localDateTimeInput(task.createdAt).replace('T',' ')}</span><span>更新于 {localDateTimeInput(task.updatedAt??task.createdAt).replace('T',' ')}</span></div><div className="actions"><Button disabled={busy||!!task.deletedAt} onClick={()=>void patch('itemType','task').catch(()=>{})}>转为事项</Button><Button subtle onClick={()=>dialog({type:'state',id:task.id,action:task.deletedAt?'restore':'delete'})}>{task.deletedAt?'恢复笔记':'移入回收站'}</Button></div></div>;
}
