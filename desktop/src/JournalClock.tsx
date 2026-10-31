import React,{createContext,useContext,useEffect,useMemo,useRef,useState} from 'react';
import type {ClockSnapshot,Snapshot} from '../core/types';
import {localDate} from '../core/types';
import {api} from './api';
import {AppContext,LiveAppContext} from './journal-context';
export const ClockContext=createContext<ClockSnapshot|null>(null);
/** Aggregate effort needs regular freshness, not a full tree render each second. */
export const EffortClockContext=createContext<ClockSnapshot|null>(null);
/** Only clock consumers re-render every second. Workspace data changes on a service revision. */
export function JournalClock({data,refresh,children}:{data:Snapshot;refresh:()=>Promise<void>;children:React.ReactNode}){
 const context=useContext(AppContext),[clock,setClock]=useState<ClockSnapshot|null>(null),current=useRef(data);current.current=data;
 useEffect(()=>{
  let stopped=false,inFlight=false,pending=false,forceSnapshot=false,ticks=0;
  const visible=()=>!stopped&&!document.hidden;
  const tick=async()=>{
   if(!visible())return;
   inFlight=true;pending=false;const resuming=forceSnapshot;forceSnapshot=false;
   try{
    if(api.clock){
     const next=await api.clock();
     // A hide/show during this request queues a fresh read. Never paint the older response first.
     if(!visible()||forceSnapshot)return;
     if(resuming||next.revision!==current.current.revision||localDate(next.now)!==localDate(current.current.now))await refresh();
     else setClock(next);
    }else if(resuming||current.current.timers.length||current.current.state.settings.breakUntil||++ticks%10===0)await refresh();
   }catch{
    // Returning to the app still catches up through the full snapshot if the small clock read fails.
    if(visible()&&!forceSnapshot&&(resuming||++ticks%10===0)){try{await refresh();}catch{/* A later visible tick retries; keep the last confirmed data. */}}
   }finally{
    inFlight=false;
    if(pending&&visible())void tick();
   }
  };
  const request=(resume=false)=>{if(!visible())return;forceSnapshot||=resume;if(inFlight){pending||=resume;return;}void tick();};
  const visibility=()=>{if(visible())request(true);};
  document.addEventListener('visibilitychange',visibility);
  const interval=setInterval(()=>request(),1000);
  return()=>{stopped=true;clearInterval(interval);document.removeEventListener('visibilitychange',visibility);};
 },[refresh]);
 const activeClock=clock&&clock.revision===data.revision&&Date.parse(clock.now)>=Date.parse(data.now)?clock:null;
 const effortBucket=Math.floor(Date.parse(activeClock?.now??data.now)/10000);
 const effortClock=useMemo(()=>activeClock,[data,effortBucket]);
 const minute=activeClock?Math.floor(Date.parse(activeClock.now)/60000):Math.floor(Date.parse(data.now)/60000);
 const workspaceNow=minute===Math.floor(Date.parse(data.now)/60000)?data.now:new Date(minute*60000).toISOString();
 const workspace=useMemo(()=>workspaceNow===data.now?context:{...context,data:{...data,now:workspaceNow}},[context,data,workspaceNow]);
 // Overlay active sessions once per tick for all consumers, not once per component.
 const live=useMemo(()=>{if(!activeClock)return context;const active=new Map(activeClock.sessions.map(s=>[s.id,s]));return {...context,data:{...data,now:activeClock.now,timers:activeClock.timers,timer:activeClock.timers[0]??null,state:active.size?{...data.state,sessions:data.state.sessions.map(s=>active.get(s.id)??s)}:data.state}};},[context,data,activeClock]);
 return <AppContext.Provider value={workspace}><LiveAppContext.Provider value={live}><ClockContext.Provider value={activeClock}><EffortClockContext.Provider value={effortClock}>{children}</EffortClockContext.Provider></ClockContext.Provider></LiveAppContext.Provider></AppContext.Provider>;
}
