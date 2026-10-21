import {randomUUID} from 'node:crypto';
import type {JournalState} from './types';

function refreshStartedAt(state:JournalState,taskId:string|null,now:string){
 const task=state.tasks.find(t=>t.id===taskId);if(!task)return;
 task.startedAt=state.sessions.filter(s=>s.taskId===taskId&&s.start).map(s=>s.start!).sort((a,b)=>Date.parse(a)-Date.parse(b))[0]??null;
 task.updatedAt=now;
}

/** Keep deleted effort outside live projections, with its original identity and evidence. */
export function deleteSession(state:JournalState,id:unknown,now:string){
 const record=state.sessions.find(s=>s.id===id);if(!record)throw new Error('投入记录不存在。');
 if(record.status!=='ended')throw new Error('请先结束这次计时，再删除投入记录。');
 state.audit.push({id:randomUUID(),entityId:record.id,before:JSON.stringify(record),reason:'删除投入记录',createdAt:now});
 state.deletedSessions.push({...record,deletedAt:now});
 state.sessions=state.sessions.filter(s=>s.id!==id);
 if(state.settings.rest&&state.settings.rest.sessionId===id)state.settings.rest.sessionId=null;
 refreshStartedAt(state,record.taskId,now);
}

export function restoreSession(state:JournalState,id:unknown,now:string){
 const record=state.deletedSessions.find(s=>s.id===id);if(!record)throw new Error('已删除投入不存在。');
 if(state.sessions.some(s=>s.id===id))throw new Error('这段投入已存在。');
 if(record.taskId!==null&&!state.tasks.some(t=>t.id===record.taskId))throw new Error('关联事项不存在，无法恢复。');
 if(record.taskId!==null&&state.sessions.some(s=>s.taskId===record.taskId&&s.segments.some(a=>record.segments.some(b=>Date.parse(a.start)<Date.parse(b.end)&&Date.parse(a.end)>Date.parse(b.start)))))throw new Error('这段投入与同一事项的现有记录重叠，请先校正现有记录再恢复。');
 const {deletedAt,...session}=record;
 state.audit.push({id:randomUUID(),entityId:record.id,before:JSON.stringify(session),reason:'恢复投入记录',createdAt:now});
 state.sessions.push({...session,updatedAt:now});
 state.deletedSessions=state.deletedSessions.filter(s=>s.id!==id);
 refreshStartedAt(state,record.taskId,now);
}
