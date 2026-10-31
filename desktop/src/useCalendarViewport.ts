import {useCallback,useEffect,useLayoutEffect,useRef,type RefObject} from 'react';
import {readLocal,writeLocal} from './workspace-state';

type Mode='day'|'week'|'month';
const key='journal.calendar.scroll-hours';
const validHour=(value:unknown)=>typeof value==='number'&&Number.isFinite(value)&&value>=0&&value<=24?value:7;

/** Keep the viewed time across navigation and zoom; scrolling never re-renders the calendar. */
export function useCalendarViewport(ref:RefObject<HTMLDivElement|null>,mode:Mode,hourHeight:number){
 const positions=useRef<{day:number;week:number}|null>(null);
 if(!positions.current){const stored=readLocal<Record<string,unknown>|null>(key,null);positions.current={day:validHour(stored?.day),week:validHour(stored?.week)};}
 const current=useRef({mode,hourHeight});current.current={mode,hourHeight};
 const pending=useRef<ReturnType<typeof setTimeout>|null>(null);
 const flush=useCallback(()=>{if(pending.current)clearTimeout(pending.current);pending.current=null;writeLocal(key,positions.current);},[]);
 const saveSoon=useCallback(()=>{if(pending.current)clearTimeout(pending.current);pending.current=setTimeout(flush,200);},[flush]);
 useLayoutEffect(()=>{if(mode!=='month'&&ref.current)ref.current.scrollTop=positions.current![mode]*hourHeight;},[ref,mode,hourHeight]);
 const onScroll=useCallback(()=>{const {mode,hourHeight}=current.current;if(mode==='month'||!ref.current)return;positions.current![mode]=Math.min(24,Math.max(0,ref.current.scrollTop/hourHeight));saveSoon();},[ref,saveSoon]);
 const jumpToHour=useCallback((hour:number,target?:'day'|'week')=>{const active=target??(current.current.mode==='month'?'day':current.current.mode);positions.current![active]=Math.max(0,Math.min(23,hour));if(current.current.mode===active&&ref.current)ref.current.scrollTop=positions.current![active]*current.current.hourHeight;saveSoon();},[ref,saveSoon]);
 useEffect(()=>{window.addEventListener('pagehide',flush);return()=>{window.removeEventListener('pagehide',flush);flush();};},[flush]);
 return {onScroll,jumpToHour};
}
