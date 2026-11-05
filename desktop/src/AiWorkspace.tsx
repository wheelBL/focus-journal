import React,{useCallback,useEffect,useLayoutEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import type {AiPurpose} from '../core/ai-assistant-types';
import {AiAssistant} from './AiAssistant';
import {RelatedDetail} from './RelatedDetail';
import {readLocal,writeLocal} from './workspace-state';
import './ai-workspace.css';

export type AiWorkspaceRequest={sequence:number;itemId?:string;purpose?:AiPurpose};
export type AiWorkspaceLayout={open:boolean;expanded:boolean;detail:boolean;width:number;running:boolean};
export const initialAiLayout:AiWorkspaceLayout={open:false,expanded:false,detail:false,width:480,running:false};

/** Owns workspace placement only. Conversation, proposals and drafts stay in AiAssistant. */
export function AiWorkspace({request,slot,view,onLayout,onSettings}:{request:AiWorkspaceRequest|null;slot:HTMLElement|null;view:string;onLayout:(layout:AiWorkspaceLayout)=>void;onSettings:()=>void}){
 const [open,setOpen]=useState(false),[expanded,setExpanded]=useState(false),[running,setRunning]=useState(false);
 const [detailId,setDetailId]=useState<string|null>(null),[visited,setVisited]=useState<string[]>([]);
 const [width,setWidth]=useState(()=>{const saved=readLocal('journal.ai-panel-width',480);return typeof saved==='number'&&Number.isFinite(saved)?Math.max(380,Math.min(700,saved)):480;});
 const origin=useRef<HTMLElement|null>(null),lastView=useRef(view),drag=useRef<{x:number;width:number}|null>(null);
 const panelRef=useRef<HTMLDivElement>(null);
 useEffect(()=>{if(request){origin.current=document.activeElement instanceof HTMLElement?document.activeElement:null;setDetailId(null);setOpen(true);}},[request?.sequence]);
 useEffect(()=>{if(lastView.current!==view){lastView.current=view;setDetailId(null);}},[view]);
 useLayoutEffect(()=>onLayout({open,expanded,detail:!!detailId,width,running}),[open,expanded,detailId,width,running,onLayout]);
 useEffect(()=>{writeLocal('journal.ai-panel-width',width);},[width]);
 const focusComposer=useCallback(()=>{requestAnimationFrame(()=>panelRef.current?.querySelector<HTMLTextAreaElement>('textarea[aria-label="给 AI 的问题"]')?.focus({preventScroll:true}));},[]);
 const back=()=>{setDetailId(null);setOpen(true);focusComposer();};
 const close=()=>{const target=origin.current;setOpen(false);setDetailId(null);requestAnimationFrame(()=>{if(target?.isConnected&&!target.closest('[hidden],[inert]'))target.focus({preventScroll:true});});};
 const showItem=(id:string)=>{setVisited(ids=>ids.includes(id)?ids:[...ids,id]);setDetailId(id);setExpanded(false);};
 const changeWidth=(next:number)=>setWidth(Math.max(380,Math.min(700,next)));
 if(!request)return null;
 return <>
  <div className="ai-related-pane" hidden={!open||!detailId} inert={!open||!detailId}>
   {visited.map(id=><div className="ai-related-page" key={id} hidden={detailId!==id} inert={detailId!==id}><RelatedDetail id={id} onClose={back} rootBackLabel="返回 AI 对话"/></div>)}
  </div>
  {slot&&createPortal(<div ref={panelRef} className="ai-workspace-frame" data-ai-workspace hidden={!open} inert={!open}>
   <div className="ai-workspace-resizer" role="separator" aria-label="调整 AI 助手宽度" aria-orientation="vertical" aria-valuenow={width} aria-valuemin={380} aria-valuemax={700} tabIndex={0}
    onKeyDown={event=>{if(event.key==='ArrowLeft'||event.key==='ArrowRight'){event.preventDefault();event.stopPropagation();changeWidth(width+(event.key==='ArrowLeft'?20:-20));}}}
    onPointerDown={event=>{if(event.button!==0)return;drag.current={x:event.clientX,width};event.currentTarget.setPointerCapture(event.pointerId);event.preventDefault();}}
    onPointerMove={event=>{if(drag.current)changeWidth(drag.current.width+drag.current.x-event.clientX);}}
    onPointerUp={event=>{drag.current=null;if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);}}
    onPointerCancel={()=>{drag.current=null;}}/>
   <AiAssistant open={open} requestSequence={request.sequence} itemId={request.itemId} initialPurpose={request.purpose} onClose={close} onSettings={()=>{close();onSettings();}} onOpenItem={showItem} expanded={expanded} onExpandChange={setExpanded} onBusyChange={setRunning}/>
  </div>,slot)}
 </>;
}
