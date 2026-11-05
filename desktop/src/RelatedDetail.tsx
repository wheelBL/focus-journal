export {NoteTaskCreator} from './NoteTaskCreator';
import React,{useMemo,useState} from 'react';
import {outlineIndex} from '../core/outline';
import {ItemInspectorBase} from './ItemInspectorBase';
import {useWorkspaceJournal,Button} from './ui';

/** Each visited detail stays mounted, preserving editor drafts and reading positions. */
export function RelatedDetail({id,onClose,rootBackLabel='返回原内容'}:{id:string;onClose:()=>void;rootBackLabel?:string}){
 const {data,run,dialog}=useWorkspaceJournal(),index=useMemo(()=>outlineIndex(data.state),[data.state]);
 const [stack,setStack]=useState([id]),[tabs,setTabs]=useState<Record<number,'details'|'records'|'review'>>({});
 const back=()=>stack.length>1?setStack(s=>s.slice(0,-1)):onClose();
 return <section className="related-detail" aria-label="关联内容详情" onKeyDown={e=>{if(e.altKey&&e.key==='ArrowLeft'){e.preventDefault();e.stopPropagation();back();}}}><div className="related-return"><Button aria-label={stack.length>1?'返回上一内容':rootBackLabel} onClick={back}>← {stack.length>1?'返回上一内容':rootBackLabel}</Button></div>{stack.map((itemId,at)=>{const node=index.nodes.get(itemId);return <div key={`${at}:${itemId}`} className="related-detail-page" hidden={at!==stack.length-1}>{node?<ItemInspectorBase node={node} index={index} tab={tabs[at]??'details'} setTab={tab=>setTabs(previous=>({...previous,[at]:tab}))} onRelated={next=>setStack(s=>[...s,next])} onClose={back} onSelect={next=>setStack(s=>[...s,next])} onFocus={next=>setStack(s=>[...s,next])} onEdit={()=>{}} onStart={()=>run({type:'focus.start',payload:{taskId:itemId,skipEstimate:true}})} onStop={async()=>{const sessionId=data.timers.find(t=>t.taskId===itemId)?.sessionId;if(sessionId){await run({type:'focus.stop',payload:{sessionId}});dialog({type:'summary',id:sessionId});}}} onPatch={(field,value)=>run({type:'outline.patch',payload:{id:itemId,field,value}})}/>:<p>关联内容已不存在。<Button onClick={back}>返回</Button></p>}</div>;})}</section>;
}
