import {recordOperation} from './operation-entry';
import React,{useEffect,useId,useRef,useState} from 'react';

/** A small disclosure of secondary actions; fields retain ordinary Tab behavior. */
export function ActionPopover({label,children,className=''}:{label:string;children:React.ReactNode;className?:string}){
 const [open,setOpen]=useState(false),root=useRef<HTMLDivElement>(null),trigger=useRef<HTMLButtonElement>(null),id=useId();
 useEffect(()=>{
  if(!open)return;
  const outside=(event:PointerEvent)=>{if(!root.current?.contains(event.target as Node))setOpen(false);};
  document.addEventListener('pointerdown',outside);return()=>document.removeEventListener('pointerdown',outside);
 },[open]);
 return <div ref={root} className={`action-popover ${className}`} onKeyDown={event=>{if(event.key==='Escape'&&open){event.preventDefault();event.stopPropagation();setOpen(false);trigger.current?.focus();}}} onBlur={event=>{if(event.relatedTarget&&!event.currentTarget.contains(event.relatedTarget as Node))setOpen(false);}}>
  <button ref={trigger} type="button" className="subtle" aria-label={label} aria-expanded={open} aria-controls={id} onClick={()=>{recordOperation(open?'options.close':'options.open',className.includes('inspector')?'items.inspector.more':'items.view-options');setOpen(value=>!value);}}>{label}<span className="disclosure-chevron" aria-hidden="true"/></button>
  <div id={id} className="action-popover-panel" role="group" aria-label={label} hidden={!open} onClick={event=>{const button=(event.target as HTMLElement).closest('button');if(button&&!button.disabled){setOpen(false);trigger.current?.focus();}}}>{children}</div>
 </div>;
}
