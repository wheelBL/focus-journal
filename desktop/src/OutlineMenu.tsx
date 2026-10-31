import {isMac,shortcutLabel} from './platform';
import {withOperationEntry} from './operation-entry';
import {localDate} from '../core/types';
import {useDailyFocus} from './FocusToggle';
import React,{useEffect,useRef} from 'react';
import {isEvent,isInformation,type ItemType} from '../core/item-kind';
import {blockedReason} from '../core/item-state';
import type {OutlineIndex,OutlineNode} from '../core/outline';
import type {Task} from '../core/types';
import {useJournal} from './ui';

export type OutlineMenuState={id:string|null;x:number;y:number};
/** Context actions only; all mutations go through the workspace command callbacks. */
export function OutlineMenu({menu,index,close,create,rename,patch,stateAction,undo,restoreFocus,scopeId}:{scopeId?:string|null;menu:OutlineMenuState;index:OutlineIndex;close:()=>void;create:(parentId:string|null,afterId?:string|null,type?:ItemType)=>void;rename:(id:string)=>void;patch:(node:OutlineNode,field:string,value:unknown)=>Promise<unknown>;stateAction:(id:string,action:'done'|'reopen'|'pause'|'resume'|'cancel'|'delete'|'restore')=>Promise<unknown>;undo:()=>Promise<unknown>;restoreFocus:()=>void}){
 const toggleFocus=useDailyFocus();
 const {data,run,dialog,busy}=useJournal(),ref=useRef<HTMLDivElement>(null),node=menu.id?index.nodes.get(menu.id):undefined,task=node?.record as Task|undefined,note=isInformation(task);
 const finish=(work:()=>unknown)=>{
  restoreFocus();const anchor=document.activeElement;let moved=false;
  const cleanup=()=>{observer.disconnect();document.removeEventListener('focusin',changed);document.removeEventListener('pointerdown',changed);clearTimeout(timeout);};
  const changed=()=>{moved=true;cleanup();};
  const restore=()=>{if(anchor&&!anchor.isConnected){if(!moved&&document.activeElement===document.body&&!document.querySelector('dialog[open]'))restoreFocus();cleanup();}};
  const observer=new window.MutationObserver(restore),timeout=setTimeout(cleanup,1500);
  observer.observe(document.body,{childList:true,subtree:true});document.addEventListener('focusin',changed);document.addEventListener('pointerdown',changed);
  close();try{void Promise.resolve(withOperationEntry('items.context',work)).then(restore,restore);}catch{cleanup();}
 };
 useEffect(()=>{ref.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();const outside=(e:PointerEvent)=>{if(!ref.current?.contains(e.target as Node))close();};window.addEventListener('pointerdown',outside);return()=>window.removeEventListener('pointerdown',outside);},[]);
 return <div className="tree-context-menu" ref={ref} role="menu" aria-label="事项操作" style={{left:menu.x,top:menu.y}} onContextMenu={e=>e.preventDefault()} onKeyDown={e=>{
  if(['ArrowDown','ArrowUp','Home','End'].includes(e.key)){e.preventDefault();const buttons=[...e.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')],i=buttons.indexOf(document.activeElement as HTMLButtonElement),at=e.key==='Home'?0:e.key==='End'?buttons.length-1:(i+(e.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length;buttons[at]?.focus();}
  if(e.key==='Escape'){e.stopPropagation();close();restoreFocus();}
 }}>
  {node?<><button role="menuitem" onClick={()=>create(node.id===scopeId?node.id:node.parentId,node.id===scopeId?null:node.id)}>{node.id===scopeId?'新增范围内事项':'新增同级事项'} <kbd>{isMac()?'⌘ ⇧ N':'Insert'}</kbd></button><button role="menuitem" disabled={!!task&&(task.status!=='open'||!!task.deletedAt)} onClick={()=>create(node.id)}>新增子事项 <kbd>{isMac()?'⌘ ⌥ N':'Ctrl Insert'}</kbd></button><button role="menuitem" onClick={()=>create(node.id===scopeId?node.id:node.parentId,node.id===scopeId?null:node.id,'note')}>{node.id===scopeId?'新增范围内笔记':'新增同级笔记'}</button><button role="menuitem" disabled={!!task&&(task.status!=='open'||!!task.deletedAt)} onClick={()=>create(node.id,null,'note')}>新增子笔记</button><button role="menuitem" onClick={()=>create(node.id===scopeId?node.id:node.parentId,node.id===scopeId?null:node.id,'event')}>新增同级事件</button>
   {task&&<><hr/>{!note&&['open','handed-off'].includes(task.status)&&!task.deletedAt&&<button role="menuitem" onClick={()=>finish(()=>dialog({type:'handoff',id:task.id}))}>{task.ownership?'调整交接 / 重新接手…':'交接给他人…'}</button>}{!note&&task.status==='done'&&<button role="menuitem" onClick={()=>finish(()=>dialog({type:'completion',id:task.id}))}>调整完成归属</button>}{(!note||isEvent(task))&&<button role="menuitem" onClick={()=>finish(()=>dialog({type:'repeat',id:task.id}))}>重复安排…</button>}<button role="menuitem" onClick={()=>finish(()=>rename(node.id))}>重命名 <kbd>F2</kbd></button>{note?<button role="menuitem" disabled={busy||!!task.deletedAt} onClick={()=>finish(()=>patch(node,'itemType','task'))}>转为事项</button>:<>
    <button role="menuitem" onClick={()=>finish(()=>dialog({type:'schedule',id:node.id}))}>定期审视…</button><button role="menuitemcheckbox" aria-checked={!!task.isProject} onClick={()=>finish(()=>patch(node,'isProject',!task.isProject))}>{task.isProject?'取消项目标记':'标记为项目'}</button>
    {task.status==='handed-off'&&!task.deletedAt&&<button role="menuitem" onClick={()=>finish(()=>stateAction(node.id,'done'))}>记录他人完成…</button>}<button role="menuitem" onClick={()=>finish(()=>stateAction(node.id,task.status==='open'?'done':'reopen'))}>{task.status==='open'?'完成事项':task.status==='handed-off'?'重新接手':'重新打开'}</button>
    {task.status==='open'&&!task.deletedAt&&<><button role="menuitem" disabled={!!blockedReason(index,task.id)} onClick={()=>finish(()=>run({type:'focus.switch',payload:{taskId:task.id,skipEstimate:true}}))}>切换计时到此项</button><button role="menuitem" onClick={()=>finish(()=>toggleFocus(task))}>{task.focusDate===localDate(data.now)?'移出今日重点':'加入今日重点'}</button><button role="menuitem" onClick={()=>finish(()=>stateAction(node.id,task.availability==='paused'?'resume':'pause'))}>{task.availability==='paused'?'恢复事项':'暂停事项'}</button><button role="menuitem" onClick={()=>finish(()=>stateAction(node.id,'cancel'))}>取消事项</button></>}
   </>}<button role="menuitem" onClick={()=>finish(()=>stateAction(node.id,task.deletedAt?'restore':'delete'))}>{task.deletedAt?'恢复整支':'移入回收站'}</button></>}
  </>:<><button role="menuitem" onClick={()=>create(null)}>新增最外层事项</button><button role="menuitem" onClick={()=>create(null,null,'note')}>新增最外层笔记</button></>}
  <hr/><button role="menuitem" disabled={!data.undoLabel||busy} onClick={()=>finish(undo)}>撤销{data.undoLabel?`：${data.undoLabel}`:''} <kbd>{shortcutLabel('Ctrl Z')}</kbd></button>
 </div>;
}
