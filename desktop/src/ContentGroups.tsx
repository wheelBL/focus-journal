import React,{useEffect,useId,useLayoutEffect,useMemo,useRef,useState} from 'react';
import {ChevronDown20Regular,ChevronRight20Regular,Folder20Regular,Add20Regular} from '@fluentui/react-icons';
import {contentGroups} from '../core/content-workspace';
import {outlineIndex,outlinePath} from '../core/outline';
import {useWorkspaceJournal} from './ui';
import {readContentScope,useContentScope} from './content-navigation';
import {useContentMemory,useContentMounted} from './content-page-state';
import './content-navigation.css';

export function ContentGroups(){
 const {data}=useWorkspaceJournal();
 return <GroupNavigation key={data.dataPath}/>;
}

function GroupNavigation(){
 const {data}=useWorkspaceJournal(),{scopeId,setScopeId}=useContentScope(data.dataPath);
 const [sectionCollapsed,setSectionCollapsed]=useContentMemory(`journal.group-section-collapse.${data.dataPath}`,false);
 const [collapsedIds,setCollapsedIds]=useContentMemory<string[]>(`journal.group-collapse.${data.dataPath}`,[]);
 const [addingFor,setAddingFor]=useState<{id:string|null}|null>(null);
 const listId=useId(),newGroupInput=useRef<HTMLInputElement>(null),focusNewGroup=useRef(false),addButton=useRef<HTMLButtonElement>(null);
 const adding=addingFor?.id===scopeId;
 const collapsed=useMemo(()=>new Set(collapsedIds),[collapsedIds]);
 const index=useMemo(()=>outlineIndex(data.state),[data.state]);
 const groups=useMemo(()=>contentGroups(data.state),[data.state]);
 const scopePath=scopeId?outlinePath(index,scopeId):[];
 const scopeLabel=scopePath.map(node=>node.title).join(' / ');

 useEffect(()=>{
  if(!scopeId)return;
  const ancestors=new Set(scopePath.slice(0,-1).map(node=>node.id));
  if(collapsedIds.some(id=>ancestors.has(id)))setCollapsedIds(current=>current.filter(id=>!ancestors.has(id)));
 },[scopeId]);

 useLayoutEffect(()=>{
  if(adding&&!sectionCollapsed&&focusNewGroup.current){
   focusNewGroup.current=false;
   newGroupInput.current?.focus();
  }
 },[adding,sectionCollapsed]);

 const entries=useMemo(()=>{
  const groupIds=new Set(groups.map(group=>group.id));
  const rows=groups.map(group=>{
   const path=outlinePath(index,group.id);
   return {group,path:path.map(node=>node.title).join(' / '),parents:path.slice(0,-1).filter(node=>groupIds.has(node.id))};
  });
  const parentsWithChildren=new Set(rows.map(row=>row.parents.at(-1)?.id));
  return rows.map(row=>({...row,hasChildren:parentsWithChildren.has(row.group.id)}));
 },[groups,index]);
 const openCreation=()=>{
  if(adding&&!sectionCollapsed){newGroupInput.current?.focus();return;}
  focusNewGroup.current=true;
  setSectionCollapsed(false);
  setAddingFor({id:scopeId});
 };
 const closeCreation=()=>{setAddingFor(null);if(!sectionCollapsed)addButton.current?.focus();};

 return <section className="shared-content-groups">
  <div className="group-section-heading">
   <h2 className="context-heading"><button type="button" className="group-section-toggle" aria-label={sectionCollapsed?'展开分组列表':'折叠分组列表'} aria-expanded={!sectionCollapsed} aria-controls={listId} onClick={()=>setSectionCollapsed(!sectionCollapsed)}>
    {sectionCollapsed?<ChevronRight20Regular/>:<ChevronDown20Regular/>}<span>分组</span>
   </button></h2>
   <button type="button" ref={addButton} className="group-section-add" aria-label="新增分组" title="在当前范围中新增分组" onClick={openCreation}><Add20Regular/></button>
  </div>
  {sectionCollapsed&&scopeId&&<div className="group-scope-summary">
   <span title={scopeLabel}>{scopeLabel||'当前分组不可用'}</span>
   <button type="button" onClick={()=>setScopeId(null)}>全部分组</button>
  </div>}
  <div id={listId} className="shared-group-body" hidden={sectionCollapsed}>
   {adding&&<GroupCreate key={scopeId??''} scopeId={scopeId} inputRef={newGroupInput} onClose={closeCreation} onSaved={id=>{closeCreation();if(readContentScope(data.dataPath)===scopeId)setScopeId(id);}}/>}
   <nav aria-label="共享分组" className="context-nav">
    <button className={!scopeId?'selected':''} aria-pressed={!scopeId} onClick={()=>setScopeId(null)}><Folder20Regular/><span>全部分组</span></button>
    {entries.filter(entry=>!entry.parents.some(parent=>collapsed.has(parent.id))).map(({group,path,parents,hasChildren})=>
     <div key={group.id} data-content-group={group.id} className="shared-group-row" style={{paddingLeft:Math.min(parents.length,8)*10}}>
      {hasChildren?<button type="button" className="group-chevron" aria-label={`${collapsed.has(group.id)?'展开':'折叠'}分组 ${group.title}`} aria-expanded={!collapsed.has(group.id)} onClick={()=>setCollapsedIds(ids=>ids.includes(group.id)?ids.filter(id=>id!==group.id):[...ids,group.id])}>
       {collapsed.has(group.id)?<ChevronRight20Regular/>:<ChevronDown20Regular/>}
      </button>:<span className="group-chevron"/>}
      <button className={scopeId===group.id?'selected':''} aria-pressed={scopeId===group.id} title={path} onClick={()=>setScopeId(group.id)}><Folder20Regular/><span>{group.title}</span></button>
     </div>
    )}
   </nav>
  </div>
 </section>;
}

function GroupCreate({scopeId,inputRef,onClose,onSaved}:{scopeId:string|null;inputRef:React.RefObject<HTMLInputElement|null>;onClose:()=>void;onSaved:(id:string)=>void}){
 const {data,run,busy}=useWorkspaceJournal();
 const [title,setTitle]=useContentMemory(`journal.new-group.${data.dataPath}.${JSON.stringify(scopeId)}`,'');
 const [error,setError]=useState(''),[saving,setSaving]=useState(false),pending=useRef(false),mounted=useContentMounted();
 const create=async(event:React.FormEvent)=>{
  event.preventDefault();
  if(pending.current||busy||!title.trim())return;
  pending.current=true;
  setSaving(true);
  setError('');
  try{
   const result=await run({type:'outline.create',payload:{title:title.trim(),kind:'group',parentId:scopeId}});
   setTitle(current=>current===title?'':current);
   const id=result.commandResult?.createdItemIds[0];
   if(mounted.current){if(id)onSaved(id);else onClose();}
  }catch(e){
   if(mounted.current)setError((e as Error).message);
  }finally{
   pending.current=false;
   if(mounted.current)setSaving(false);
  }
 };
 return <form aria-label="新增分组" aria-busy={saving} onSubmit={e=>void create(e)} className="shared-group-create">
  <input aria-label="新分组名称" ref={inputRef} value={title} maxLength={120} readOnly={saving} onChange={e=>setTitle(e.target.value)} onKeyDown={e=>{
   e.stopPropagation();
   if(e.nativeEvent.isComposing||e.nativeEvent.keyCode===229){
    if(e.key==='Enter')e.preventDefault();
    return;
   }
   if(e.key==='Escape'&&!pending.current)onClose();
  }}/>
  <div><button disabled={saving||busy||!title.trim()} type="submit">{saving?'正在保存…':'保存'}</button><button type="button" disabled={saving} onClick={onClose}>取消</button></div>
  {error&&<p role="alert">{error}</p>}
 </form>;
}
