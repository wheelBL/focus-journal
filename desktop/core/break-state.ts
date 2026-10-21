import {blockedReason} from './item-state';
import {outlineIndex} from './outline';
import {sessionTitle} from './session-label';
import type {JournalState} from './types';

export function breakContinuation(s:JournalState){
 const taskId=s.sessions.find(r=>r.id===s.settings.rest?.sessionId)?.taskId??null;
 if(taskId===null||!s.tasks.some(t=>t.id===taskId)||blockedReason(outlineIndex(s),taskId))
  return {taskId:null,sessionId:null,title:'先计时，结束后补充事项'};
 const paused=s.sessions.find(r=>r.taskId===taskId&&r.status==='paused');
 return {taskId,sessionId:paused?.id??null,title:sessionTitle(s,taskId)};
}
