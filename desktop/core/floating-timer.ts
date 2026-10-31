import {breakContinuation} from './break-state';
import {sessionTitle} from './session-label';
import {timerTargetMs} from './timer-target';
import type {ClockSnapshot,JournalState,RestCycle,TimerView} from './types';

export interface FloatingTimerEntry extends TimerView {title:string}
export interface FloatingRest extends RestCycle {remainingMs:number;title:string}
export interface FloatingTimerSource {timers:FloatingTimerEntry[];rest:FloatingRest|null;breakMinutes:number}
export interface FloatingTimerState extends FloatingTimerSource {selectedId:string|null;expanded:boolean}
export type FloatingTimerAction='expand'|'collapse'|'hide'|'select'|'pause'|'resume'|'stop'|'stop-rest'|'rest-start'|'rest-finish'|'rest-continue'|'rest-stop'|'open'|'review';
export interface FloatingTimerApi {
 snapshot():Promise<FloatingTimerState>;
 action(action:FloatingTimerAction,id?:string):Promise<void>;
 onChanged(callback:(value:FloatingTimerState)=>void):()=>void;
}

/** A small read model: never serialize the task tree or historical effort every second. */
export function floatingTimerSource(state:JournalState,clock:ClockSnapshot):FloatingTimerSource {
 const rest=state.settings.rest;
 return {timers:clock.timers.map(timer=>({...timer,title:sessionTitle(state,timer.taskId)})),breakMinutes:state.settings.breakMinutes,
  rest:rest?{...rest,remainingMs:rest.phase==='running'?Math.max(0,Date.parse(state.settings.breakUntil??clock.now)-Date.parse(clock.now)):rest.minutes*60000,title:breakContinuation(state).title}:null};
}
export const restKey=(rest:FloatingRest)=>`rest:${rest.id}`;
export const floatingIds=(source:FloatingTimerSource)=>[...source.timers.map(t=>t.sessionId),...(source.rest?[restKey(source.rest)]:[])];
export function selectFloatingTimer(source:FloatingTimerSource,previous:string|null){
 if(previous&&floatingIds(source).includes(previous))return previous;
 return (source.rest?restKey(source.rest):null)??source.timers.find(t=>!t.paused)?.sessionId??source.timers[0]?.sessionId??null;
}
export function floatingReadout(state:FloatingTimerState){
 const timer=state.timers.find(t=>t.sessionId===state.selectedId);
 if(timer){const over=timer.durationMs>=timerTargetMs(timer);
  const ms=Math.abs(timerTargetMs(timer)-timer.durationMs);
  return {title:timer.title,label:timer.paused?'暂停':over?'超时':'剩余',ms,value:floatingTime(ms,!over),roundUp:!over,tone:timer.paused?'paused':over?'overtime':'running',timer};
 }
 const rest=state.rest;
 const ms=rest?.phase==='ready'?0:rest?.remainingMs??0;
 return {title:rest?.phase==='ready'?'欢迎回来':rest?.phase==='offered'?'这一段已保存':'休息一下',label:rest?.phase==='offered'?'可休息':'休息',ms,value:rest?.phase==='ready'?'已结束':floatingTime(ms,true),roundUp:true,tone:'rest',timer:null};
}
export function floatingTime(ms:number,roundUp=false){const seconds=(roundUp?Math.ceil:Math.floor)(Math.max(0,ms)/1000);return `${String(Math.floor(seconds/60)).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')}`;}

/** Hiding lasts for these sessions, including pause/resume and removing another timer. */
export class FloatingVisibility {
 private hidden=new Set<string>();
 private forced=false;
 hide(source:FloatingTimerSource){for(const id of floatingIds(source))this.hidden.add(id);this.forced=false;}
 open(){this.hidden.clear();this.forced=true;}
 mainChanged(){this.forced=false;}
 visible(source:FloatingTimerSource,mainVisible:boolean,reminderVisible:boolean){
  const ids=floatingIds(source);this.hidden=new Set([...this.hidden].filter(id=>ids.includes(id)));
  return ids.some(id=>!this.hidden.has(id))&&(!mainVisible||this.forced)&&!reminderVisible;
 }
}
