import React,{useDeferredValue,useMemo,useState} from 'react';
import {Note20Regular} from '@fluentui/react-icons';
import {isEvent,isInformation,isGroup} from '../core/item-kind';
import {localDate} from '../core/types';
import {searchIndex,searchMatches} from './search-model';
import {useWorkspaceJournal,Button,Empty,minuteText,timeText} from './ui';
import {useEffortDeltas} from './useOutlineEffort';

const PAGE_SIZE=60;
export function SearchResults({query}:{query:string}){
 const {data,dialog}=useWorkspaceJournal(),[includeHidden,setIncludeHidden]=useState(false),[page,setPage]=useState({key:'',limit:PAGE_SIZE});
 const deferred=useDeferredValue(query),index=useMemo(()=>searchIndex(data.state),[data.state]);
 const effort=useEffortDeltas(data.state);
 const matches=useMemo(()=>searchMatches(index,deferred,includeHidden),[index,deferred,includeHidden]);
 const key=`${deferred}\n${includeHidden}`,limit=page.key===key?page.limit:PAGE_SIZE,total=matches.items.length+matches.notes.length;
 const items=matches.items.slice(0,limit),notes=matches.notes.slice(0,Math.max(0,limit-items.length));
 return <section className="page search-page" aria-busy={query!==deferred}>
  <header className="page-header"><div><p className="eyebrow">事项与笔记 · 按名称、内容、项目路径和标签查找</p><h1>搜索结果 <small>{total} 条</small></h1></div><label><input type="checkbox" checked={includeHidden} onChange={e=>setIncludeHidden(e.target.checked)}/>包含已删除和归档</label></header>
  <p className="muted" role="status">{query!==deferred?'正在搜索…':total>limit?`已显示 ${limit} / ${total} 条结果`:`共 ${total} 条结果`}</p>
  {items.map(({task,path,spentMs,hidden})=><div className="project-task" key={task.id} data-search-item={task.id}><div><button className="task-link" onClick={()=>dialog({type:'detail',id:task.id})}>{task.title}</button><p>{path} · {hidden?'已删除或归档 · ':''}{isInformation(task)?isGroup(task)?'分组':isEvent(task)?'事件':'笔记／信息':task.status==='done'?'已完成':task.status==='open'?'未完成':'已取消'}</p></div><span>{isInformation(task)?'':minuteText(spentMs+(effort.get(task.id)??0))}</span></div>)}
  {notes.map(({note,hidden})=><div className="search-note" key={note.id}><Note20Regular/><div><p>{note.text}</p><small>{hidden?'已删除或归档 · ':''}{localDate(note.createdAt)} {timeText(note.createdAt)}</small></div></div>)}
  {total>limit&&<Button onClick={()=>setPage({key,limit:limit+PAGE_SIZE})}>显示更多（还有 {total-limit} 条）</Button>}
  {!total&&<Empty title="没有找到匹配内容" text={includeHidden?'试试事项名称、项目路径、标签或笔记中的关键词。':'试试其他关键词；需要查找旧内容时，可勾选“包含已删除和归档”。'}/>}
 </section>;
}
