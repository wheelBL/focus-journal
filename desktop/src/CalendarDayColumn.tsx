import React,{useEffect,useRef,useState} from 'react';
import {slotMinute,selectionRange,minuteInput} from './calendar-selection';

interface Props {day:string;hourHeight:number;now:string;onRange:(start:string,end:string)=>void;onReminder:(at:string)=>void;children:React.ReactNode}
export function CalendarDayColumn({day,hourHeight,now,onRange,onReminder,children}:Props){
 const ref=useRef<HTMLDivElement>(null),drag=useRef<{id:number;anchor:number;edge:number;y:number;startY:number;moved:boolean}|null>(null);
 const [range,setRange]=useState<ReturnType<typeof selectionRange>|null>(null);
 const frame=useRef<number|null>(null),height=hourHeight*24;
 const cancel=()=>{const d=drag.current;drag.current=null;if(frame.current!==null)cancelAnimationFrame(frame.current);frame.current=null;setRange(null);if(d&&ref.current?.hasPointerCapture(d.id))ref.current.releasePointerCapture(d.id);};
 useEffect(()=>()=>{if(frame.current!==null)cancelAnimationFrame(frame.current);},[]);
 const update=(y:number)=>{const d=drag.current,el=ref.current;if(!d||!el)return;const r=el.getBoundingClientRect();d.y=y;d.edge=Math.max(0,Math.min(1440,Math.round((y-r.top)/Math.max(r.height,1)*96)*15));d.moved||=Math.abs(y-d.startY)>4;if(d.moved)setRange(selectionRange(day,d.anchor,d.edge));};
 const autoScroll=()=>{const d=drag.current,scroll=ref.current?.closest('.calendar-scroll');if(!d||!scroll)return;const r=scroll.getBoundingClientRect();if(d.moved){const delta=d.y<r.top+28?-10:d.y>r.bottom-28?10:0;if(delta){scroll.scrollTop+=delta;update(d.y);}}frame.current=requestAnimationFrame(autoScroll);};
 const openAt=(y:number)=>{const r=ref.current!.getBoundingClientRect(),from=slotMinute(y-r.top,r.height);onRange(minuteInput(day,from),minuteInput(day,Math.min(1440,from+30)));};
 const today=new Date(now),current=day===`${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
 return <div ref={ref} className={`day-column ${range?'is-selecting':''}`} style={{height}} tabIndex={0} aria-label={`${day}，拖选时段或双击添加提醒`}
  onPointerDown={e=>{if(e.button!==0||(e.target as HTMLElement).closest('button'))return;const r=e.currentTarget.getBoundingClientRect(),anchor=slotMinute(e.clientY-r.top,r.height);drag.current={id:e.pointerId,anchor,edge:anchor,y:e.clientY,startY:e.clientY,moved:false};e.currentTarget.setPointerCapture(e.pointerId);e.currentTarget.focus({preventScroll:true});frame.current=requestAnimationFrame(autoScroll);}}
  onPointerMove={e=>{if(drag.current?.id===e.pointerId)update(e.clientY);}}
  onPointerUp={e=>{const d=drag.current;if(!d||d.id!==e.pointerId)return;update(e.clientY);const selected=selectionRange(day,d.anchor,d.edge),moved=d.moved;cancel();if(moved)onRange(selected.start,selected.end);}}
  onPointerCancel={cancel} onLostPointerCapture={()=>{if(drag.current)cancel();}}
  onDoubleClick={e=>{if((e.target as HTMLElement).closest('button'))return;cancel();const r=e.currentTarget.getBoundingClientRect();onReminder(minuteInput(day,slotMinute(e.clientY-r.top,r.height)));}}
  onContextMenu={e=>{if((e.target as HTMLElement).closest('button'))return;e.preventDefault();cancel();openAt(e.clientY);}}
  onKeyDown={e=>{if(e.key==='Escape'){cancel();return;}if(e.target!==e.currentTarget)return;if(e.key==='Enter'||e.key==='ContextMenu'||e.key==='F10'&&e.shiftKey){e.preventDefault();onRange(`${day}T09:00`,`${day}T09:30`);}}}>
  {Array.from({length:24},(_,i)=><div key={i} className="hour-line" style={{top:i*hourHeight}}/>)}{children}
  {current&&<div className="calendar-now-line" aria-label="当前时间" style={{top:(today.getHours()*60+today.getMinutes())/60*hourHeight}}/>}
  {range&&<div className="calendar-selection" style={{top:range.from/60*hourHeight,height:(range.to-range.from)/60*hourHeight}}><strong>{range.start.slice(11)}–{range.end.slice(11)}</strong><span>{range.to-range.from} 分钟</span></div>}
 </div>;
}
