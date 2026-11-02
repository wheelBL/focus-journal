import React,{useEffect,useMemo,useRef,useState} from 'react';
import type {Task} from '../core/types';
import {contentGroupId,contentGroups} from '../core/content-workspace';
import {outlineIndex,outlinePath} from '../core/outline';
import {useWorkspaceJournal,Button} from './ui';
import {readLocal,writeLocal} from './workspace-state';

/** Generation keeps the source note and records an explicit relationship. */
export function NoteTaskCreator({note,initialTitle='',onClose}:{note:Task;initialTitle?:string;onClose:()=>void}){
 const {data,run}=useWorkspaceJournal(),key=`journal.note-task.${data.dataPath}.${note.id}`;
 const [draft,setDraft]=useState(()=>readLocal(key,{title:initialTitle.slice(0,120),parentId:contentGroupId(data.state,note.id)??''})),[error,setError]=useState(''),[pending,setPending]=useState(false),[created,setCreated]=useState<Task|null>(null);
 const saving=useRef(false),mounted=useRef(true),close=useRef(onClose);close.current=onClose;
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
 useEffect(()=>{writeLocal(key,draft);},[key,draft]);
 const groups=contentGroups(data.state),index=useMemo(()=>outlineIndex(data.state),[data.state]);
 const save=async()=>{if(saving.current||!draft.title.trim())return;saving.current=true;setPending(true);setError('');try{const result=await run({type:'note.create-task',payload:{id:note.id,title:draft.title.trim(),parentId:draft.parentId||null}});writeLocal(key,null);const linked=result.state.tasks.find(t=>t.id===note.id)?.relatedTaskIds??[];if(mounted.current)setCreated(result.state.tasks.find(t=>t.id===linked.at(-1))??null);}catch(e){if(mounted.current)setError(e instanceof Error?e.message:String(e));}finally{saving.current=false;if(mounted.current)setPending(false);}};
 const start=async()=>{if(!created||saving.current)return;saving.current=true;setPending(true);setError('');try{await run({type:'focus.start',payload:{taskId:created.id,skipEstimate:true}});if(mounted.current)close.current();}catch(e){if(mounted.current)setError(e instanceof Error?e.message:String(e));}finally{saving.current=false;if(mounted.current)setPending(false);}};
 return <section className="note-task-creator" aria-label="从笔记生成任务" aria-busy={pending} onKeyDown={e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();if(!saving.current)close.current();}}}>{created?<><p role="status">已生成任务「{created.title}」，原笔记已保留并关联。</p><Button disabled={pending} primary onClick={()=>void start()}>开始新任务计时</Button><Button disabled={pending} onClick={()=>close.current()}>继续写笔记</Button></>:<form onSubmit={e=>{e.preventDefault();void save();}} onKeyDown={e=>{if(e.key==='Enter'&&(e.ctrlKey||e.metaKey)){e.preventDefault();e.stopPropagation();void save();}}}><h3>从笔记生成任务</h3><label>任务名称<input autoFocus aria-label="生成任务名称" maxLength={120} value={draft.title} readOnly={pending} onChange={e=>setDraft({...draft,title:e.target.value})}/></label><label>所属分组<select aria-label="生成任务所属分组" value={draft.parentId} disabled={pending} onChange={e=>setDraft({...draft,parentId:e.target.value})}><option value="">全部分组 · 最外层</option>{groups.map(g=><option key={g.id} value={g.id}>{outlinePath(index,g.id).map(n=>n.title).join(' / ')}</option>)}</select></label><p className="muted">保存会新增任务并关联这篇笔记，笔记正文继续保留。</p><div className="actions"><Button primary type="submit" disabled={pending||!draft.title.trim()}>{pending?'正在保存…':'生成任务'}</Button><Button type="button" disabled={pending} onClick={()=>close.current()}>返回笔记</Button></div></form>}{error&&<p role="alert" className="form-error">{error}</p>}</section>;
}
