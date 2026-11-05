import React,{useMemo} from 'react';
import {isTask} from '../core/item-kind';
import {deriveDependencyStatuses,previewDependencyChange} from '../core/dependencies';
import type {Task} from '../core/types';
import {Button,useWorkspaceJournal} from './ui';
import {useDialogAction} from './useDialogAction';
import './dependencies.css';
import {useContentMemory} from './content-page-state';
import {outlineIndex,outlinePath} from '../core/outline';
import {deadlineText} from './ui';
type Draft={ids:string[];mode:'follow'|'fixed';query:string};
export function DependencyEditor({task,onOpen}:{task:Task;onOpen:(id:string)=>void}){
 const {data,run,busy}=useWorkspaceJournal(),[draft,setDraft]=useContentMemory<Draft|null>(`journal.dependencies.${data.dataPath}.${task.id}`,null),write=useDialogAction();
 const index=useMemo(()=>outlineIndex(data.state),[data.state]),tasks=useMemo(()=>new Map(data.state.tasks.map(t=>[t.id,t])),[data.state]);
 const ids=draft?.ids??task.dependencyPlan?.predecessors.map(p=>p.id)??[],mode=draft?.mode??task.dependencyPlan?.mode??'follow';
 const update=(patch:Partial<Draft>)=>setDraft(old=>({ids:old?.ids??ids,mode:old?.mode??mode,query:old?.query??'',...patch}));
 const clear=()=>setDraft(null);
 const candidates=useMemo(()=>{
  if(!draft)return [];
  const next=new Map<string,string[]>(),children=new Map<string,string[]>();
  const add=(map:Map<string,string[]>,from:string,to:string)=>{const list=map.get(from)??[];list.push(to);map.set(from,list);};
  for(const t of tasks.values()){if(t.parentId){add(next,t.id,t.parentId);add(children,t.parentId,t.id);}for(const p of t.dependencyPlan?.predecessors??[])add(next,p.id,t.id);}
  const reachable=(edges:Map<string,string[]>)=>{const seen=new Set([task.id]),queue=[task.id];for(let at=0;at<queue.length;at++)for(const id of edges.get(queue[at])??[])if(!seen.has(id)){seen.add(id);queue.push(id);}return seen;};
  const forbidden=reachable(next);for(const id of reachable(children))forbidden.add(id);
  const unavailable=new Set([...tasks.values()].filter(t=>t.deletedAt||t.archived).map(t=>t.id)),hidden=[...unavailable];
  for(let at=0;at<hidden.length;at++)for(const id of children.get(hidden[at])??[])if(!unavailable.has(id)){unavailable.add(id);hidden.push(id);}
  const selected=new Set(ids),query=draft.query.toLocaleLowerCase();
  return [...tasks.values()].filter(t=>isTask(t)&&!unavailable.has(t.id)&&t.status!=='cancelled'&&t.status!=='handed-off'&&!t.recurrence&&!forbidden.has(t.id)&&!selected.has(t.id)&&t.title.toLocaleLowerCase().includes(query));
 },[tasks,task.id,draft]);
 const preview=useMemo(()=>{if(!draft)return {value:null,error:''};try{return {value:previewDependencyChange(data.state,{type:'dependency.set',payload:{id:task.id,predecessorIds:ids,mode}}),error:''};}catch(e){return {value:null,error:e instanceof Error?e.message:String(e)};}},[data.state,task.id,draft]);
 const status=useMemo(()=>deriveDependencyStatuses(preview.value?.state??data.state).get(task.id),[preview.value,data.state,task.id]),plan=preview.value?.state.tasks.find(t=>t.id===task.id)?.dependencyPlan??task.dependencyPlan;
 const save=async()=>{const submitted=JSON.stringify(draft);if(await write.perform(()=>run({type:'dependency.set',payload:{id:task.id,predecessorIds:ids,mode}})))setDraft(current=>JSON.stringify(current)===submitted?null:current);};
 return <section className="inspector-field dependency-editor" aria-label="任务依赖" data-operation-entry="items.inspector.dependencies"><label>前置任务</label><ul>{ids.map(id=>{const item=tasks.get(id),offset=plan?.predecessors.find(p=>p.id===id)?.offset;return <li key={id}><button className="text-button" onClick={()=>onOpen(id)}>{item?.title??'前置已不可用'}</button><small>{offset?`间隔 ${offset.unit==='days'?`${offset.value} 天`:`${Math.round(offset.value/60000)} 分钟`}`:'缺少截止日期，尚无间隔'}</small><Button subtle disabled={write.saving} aria-label={`移除前置 ${item?.title??id}`} onClick={()=>update({ids:ids.filter(value=>value!==id)})}>移除</Button></li>;})}</ul>
 {!draft&&<Button subtle onClick={()=>update({})}>{ids.length?'编辑前置任务':'添加前置任务'}</Button>}
 {(ids.length>0||draft)&&<label>截止安排<select aria-label="依赖截止安排" value={mode} disabled={write.saving} onChange={e=>update({mode:e.target.value as Draft['mode']})}><option value="follow">截止跟随前置</option><option value="fixed">截止固定</option></select></label>}
 {status?.waiting&&<small>等待前置完成；仍可提前开始。</small>}{status?.missingBaseline&&<small>请设置前置与本任务的截止日期以建立间隔。</small>}{status?.conflict&&<p role="status">固定截止早于前置安排，请检查日期。</p>}
 {draft&&<fieldset disabled={write.saving}><input aria-label="搜索前置任务" placeholder="搜索全部分组中的任务" value={draft.query} onChange={e=>update({query:e.target.value})}/><div className="dependency-options">{candidates.slice(0,40).map(t=><button key={t.id} onClick={()=>update({ids:[...ids,t.id]})}>{t.title}<small>{outlinePath(index,t.id).slice(0,-1).map(n=>n.title).join(" / ")||"最外层"}</small></button>)}{candidates.length>40&&<small>显示前 40 项，请输入名称缩小范围。</small>}{!candidates.length&&<small>没有可选任务</small>}</div>{preview.value&&<div aria-label="单项依赖日期预览">{preview.value.changedIds.map(id=>{const before=data.state.tasks.find(t=>t.id===id),after=preview.value!.state.tasks.find(t=>t.id===id);return before?.dueAt!==after?.dueAt||before?.plannedDate!==after?.plannedDate?<p key={id}>{after?.title}：截止 {deadlineText(before?.dueAt)} → {deadlineText(after?.dueAt)}；计划开始 {before?.plannedDate??"未设置"} → {after?.plannedDate??"未设置"}</p>:null;})}</div>}{preview.error&&<p role="alert">{preview.error}</p>}{write.error&&<p role="alert">{write.error}</p>}<div className="actions"><Button disabled={write.saving} onClick={()=>clear()}>取消依赖修改</Button><Button primary data-operation-entry="items.inspector.dependencies" disabled={busy||write.saving||!!preview.error} onClick={()=>void save()}>{write.saving?'保存中…':'保存依赖'}</Button></div></fieldset>}
 </section>;
}
