import React,{useEffect,useMemo,useState,useRef} from 'react';
import {ChevronDown20Regular,ChevronRight20Regular,Folder20Regular,Add20Regular} from '@fluentui/react-icons';
import {contentGroups} from '../core/content-workspace';
import {outlineIndex,outlinePath} from '../core/outline';
import {useWorkspaceJournal} from './ui';
import {useContentScope} from './content-navigation';
import {readLocal,writeLocal} from './workspace-state';
import './content-navigation.css';

export function ContentGroups(){
 const {data,run,busy}=useWorkspaceJournal(),{scopeId,setScopeId}=useContentScope(data.dataPath);
 const index=useMemo(()=>outlineIndex(data.state),[data.state]),groups=useMemo(()=>contentGroups(data.state),[data.state]);
 const storageKey=`journal.group-collapse.${data.dataPath}`;
 const [collapsed,setCollapsed]=useState<Set<string>>(()=>new Set(readLocal<string[]>(storageKey,[]))),[adding,setAdding]=useState(false),[title,setTitle]=useState(''),[error,setError]=useState(''),[saving,setSaving]=useState(false);
 useEffect(()=>{writeLocal(storageKey,[...collapsed]);},[collapsed,storageKey]);
 useEffect(()=>{if(scopeId)setCollapsed(old=>{const next=new Set(old);for(const parent of outlinePath(index,scopeId).slice(0,-1))next.delete(parent.id);return next;});},[scopeId]);
 const entries=useMemo(()=>{const ids=new Set(groups.map(g=>g.id)),rows=groups.map(group=>({group,parents:outlinePath(index,group.id).slice(0,-1).filter(p=>ids.has(p.id))})),parentsWithChildren=new Set(rows.map(row=>row.parents.at(-1)?.id));return rows.map(row=>({...row,hasChildren:parentsWithChildren.has(row.group.id)}));},[groups,index]);
 const pending=useRef(false);
 const create=async(e:React.FormEvent)=>{e.preventDefault();if(pending.current||busy||!title.trim())return;pending.current=true;setSaving(true);setError('');try{const result=await run({type:'outline.create',payload:{title:title.trim(),kind:'group',parentId:scopeId}});setScopeId(result.state.tasks.at(-1)!.id);setTitle('');setAdding(false);}catch(e){setError((e as Error).message);}finally{pending.current=false;setSaving(false);}};
 return <section className="shared-content-groups"><div className="group-section-heading"><h2 className="context-heading">分组</h2><button aria-label="新增分组" title="在当前范围中新增分组" onClick={()=>{setAdding(!adding);setError('');}} disabled={saving}><Add20Regular/></button></div><nav aria-label="共享分组" className="context-nav"><button className={!scopeId?'selected':''} aria-pressed={!scopeId} onClick={()=>setScopeId(null)}><Folder20Regular/><span>全部分组</span></button>{entries.filter(e=>!e.parents.some(p=>collapsed.has(p.id))).map(({group,parents,hasChildren})=><div key={group.id} data-content-group={group.id} className="shared-group-row" style={{paddingLeft:Math.min(parents.length,8)*10}}>{hasChildren?<button className="group-chevron" aria-label={`${collapsed.has(group.id)?'展开':'折叠'}分组 ${group.title}`} aria-expanded={!collapsed.has(group.id)} onClick={()=>setCollapsed(old=>{const next=new Set(old);next.has(group.id)?next.delete(group.id):next.add(group.id);return next;})}>{collapsed.has(group.id)?<ChevronRight20Regular/>:<ChevronDown20Regular/>}</button>:<span className="group-chevron"/>}<button className={scopeId===group.id?'selected':''} aria-pressed={scopeId===group.id} title={outlinePath(index,group.id).map(n=>n.title).join(' / ')} onClick={()=>setScopeId(group.id)}><Folder20Regular/><span>{group.title}</span></button></div>)}</nav>{adding&&<form onSubmit={e=>void create(e)} className="shared-group-create"><input aria-label="新分组名称" autoFocus value={title} maxLength={120} disabled={saving} onChange={e=>setTitle(e.target.value)} onKeyDown={e=>{e.stopPropagation();if(e.key==='Escape'&&!saving)setAdding(false);}}/><div><button disabled={saving||busy||!title.trim()} type="submit">保存</button><button type="button" disabled={saving} onClick={()=>setAdding(false)}>取消</button></div>{error&&<p role="alert">{error}</p>}</form>}</section>;
}
