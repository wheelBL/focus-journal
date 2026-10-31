import React,{useState} from 'react';
import {Tag20Regular} from '@fluentui/react-icons';
import {useJournal,Button,Modal} from './ui';
import {EditValue} from './InlineEdit';
import {tagKey} from '../core/filters';
import {ruleTagIds,rulesFor} from '../core/filter-rules';
import type {Task} from '../core/types';
import {useDialogAction} from './useDialogAction';

export function TagEditor({task,onEdit}:{task:Task;onEdit?:()=>void}){
 const {data,run,busy}=useJournal(),[name,setName]=useState(''),action=useDialogAction();
 const add=async(e:React.FormEvent)=>{e.preventDefault();if(!name.trim()||busy)return;const submitted=name;onEdit?.();if(await action.perform(()=>run({type:'tag.attach',payload:{id:task.id,name:submitted}})))setName(current=>current===submitted?'':current);};
 return <section className="tag-editor"><label htmlFor={`tag-${task.id}`}><Tag20Regular/>标签</label><div className="tag-chips">{task.tagIds?.map(id=>{const tag=data.state.tags.find(t=>t.id===id);return tag&&<span className="tag-chip" key={id}>{tag.name}<button type="button" aria-label={`从此事项移除标签 ${tag.name}`} disabled={busy} onClick={()=>{onEdit?.();void run({type:'tag.detach',payload:{id:task.id,tagId:id}}).catch(()=>{});}}>×</button></span>;})}</div><form aria-busy={action.saving} onSubmit={e=>void add(e)}><input id={`tag-${task.id}`} aria-label="自定义标签" value={name} readOnly={action.saving} maxLength={40} autoComplete="off" placeholder="输入标签，Enter 添加" onChange={e=>{if(!action.saving)setName(e.target.value);}} onKeyDown={e=>{e.stopPropagation();if(e.nativeEvent.isComposing&&e.key==='Enter')e.preventDefault();}}/><Button type="submit" disabled={!name.trim()||busy||action.saving}>{action.saving?'添加中…':'添加'}</Button></form>{action.error&&<small role="alert" className="form-error">{action.error}</small>}</section>;
}
export function TagManager({onClose,onChange}:{onClose:()=>void;onChange:(oldId:string,newId:string|null)=>void}){
 const {data,run,busy}=useJournal(),[deleting,setDeleting]=useState<string|null>(null);
 return <Modal title="管理标签" onClose={onClose}><p className="muted">改名会更新所有关联事项和常用视图；改成已有名称时合并同名标签。</p><div className="tag-manager">{!data.state.tags.length&&<p>还没有标签。在事项详情中输入名称即可创建。</p>}{data.state.tags.map(tag=><div className="tag-manager-row" key={tag.id}><div><EditValue label={`标签名称 ${tag.name}`} value={tag.name} onSave={async name=>{const result=await run({type:'tag.rename',payload:{id:tag.id,name}});onChange(tag.id,result.state.tags.find(t=>tagKey(t.name)===tagKey(name))?.id??tag.id);}}/><small>{data.state.tasks.filter(t=>t.tagIds?.includes(tag.id)).length} 个事项 · {data.state.views.filter(v=>ruleTagIds(rulesFor(v.filter)).includes(tag.id)).length} 个视图</small></div>{deleting!==tag.id?<Button subtle onClick={()=>setDeleting(tag.id)}>删除</Button>:<div className="tag-delete-confirm"><p>删除标签会解除全部关联，并移除常用视图中的此条件。</p><Button disabled={busy} onClick={()=>void run({type:'tag.delete',payload:{id:tag.id}}).then(()=>{onChange(tag.id,null);setDeleting(null);}).catch(()=>{})}>确认删除标签</Button><Button subtle onClick={()=>setDeleting(null)}>取消</Button></div>}</div>)}</div></Modal>;
}
