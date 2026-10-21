import {randomUUID} from 'node:crypto';
import type {JournalState} from './types';

/** A rest cycle is device-local workflow state; it never creates effort. */
export function clearBreak(s:JournalState){
 s.settings.breakUntil=null;s.settings.rest=null;
}
export function offerBreak(s:JournalState,sessionId:string){
 if(s.sessions.some(r=>r.status==='running')||['running','ready'].includes(s.settings.rest?.phase??''))return;
 s.settings.breakUntil=null;
 s.settings.rest={id:randomUUID(),phase:'offered',sessionId,minutes:s.settings.breakMinutes,notify:false};
}
export function startBreak(s:JournalState,now:string,sessionId?:unknown){
 if(s.sessions.some(r=>r.status==='running'))throw new Error('请先暂停或结束所有正在计时的事项，再开始休息。');
 if(s.settings.rest?.phase==='running')return;
 const source=sessionId===undefined?s.settings.rest?.sessionId??null:sessionId;
 if(source!==null&&!s.sessions.some(r=>r.id===source&&r.status==='ended'))throw new Error('请选择已经结束的投入记录。');
 s.settings.rest={id:randomUUID(),phase:'running',sessionId:source as string|null,minutes:s.settings.breakMinutes,notify:false};
 s.settings.breakUntil=new Date(Date.parse(now)+s.settings.breakMinutes*60000).toISOString();
}
export function finishBreak(s:JournalState,notify:boolean){
 if(s.settings.rest?.phase!=='running')throw new Error('没有正在进行的休息。');
 s.settings.breakUntil=null;s.settings.rest.phase='ready';s.settings.rest.notify=notify;
}
