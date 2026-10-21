import {sessionTitle} from '../core/session-label';
import type {MenuItemConstructorOptions} from 'electron';
import type {Command,Snapshot} from '../core/types';

export function timerMenu(snapshot:Snapshot,perform:(command:Command)=>void):MenuItemConstructorOptions[]{
 return snapshot.timers.length?snapshot.timers.map(timer=>({
  label:`${timer.paused?'已暂停':'计时中'} · ${sessionTitle(snapshot.state,timer.taskId)}`,
  submenu:[
   {label:timer.paused?'恢复计时':'暂停计时',click:()=>perform({type:timer.paused?'focus.resume':'focus.pause',payload:{sessionId:timer.sessionId}})},
   {label:`结束并休息 ${snapshot.state.settings.breakMinutes} 分钟`,enabled:!snapshot.timers.some(t=>t.sessionId!==timer.sessionId&&!t.paused),click:()=>perform({type:'focus.stop',payload:{sessionId:timer.sessionId,rest:true}})},
   {label:'结束本次',click:()=>perform({type:'focus.stop',payload:{sessionId:timer.sessionId}})}
  ]
 })):[{label:'没有进行中的计时器',enabled:false}];
}

export function breakMenu(snapshot:Snapshot,perform:(command:Command)=>void):MenuItemConstructorOptions[]{
 const rest=snapshot.state.settings.rest;if(!rest)return [];
 if(rest.phase==='offered')return [{label:`休息 ${snapshot.state.settings.breakMinutes} 分钟`,click:()=>perform({type:'break.start'})}];
 if(rest.phase==='running')return [{label:'休息计时中',enabled:false},{label:'提前结束休息',click:()=>perform({type:'break.finish'})}];
 return [{label:'休息结束，欢迎回来',enabled:false},{label:'继续专注',click:()=>perform({type:'break.continue'})}];
}
