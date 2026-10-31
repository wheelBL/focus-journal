import {createHash} from 'node:crypto';
import {parseJournalBackup} from './service';
import {emptyState,type JournalState} from './types';
import type {SyncSummary} from './sync-types';

export const MAX_SYNC_BYTES=24*1024*1024;
const keys=['projects','tasks','tags','views','sessions','deletedSessions','notes','estimates','reviews','audit','moves','itemReviews','activities'] as const;
// Only journal content is portable. Device preferences and live timer/reminder state are local.
export function portableState(source:JournalState):JournalState {
 const state=structuredClone(source);
 state.settings=emptyState().settings;

 for(const s of state.sessions){delete s.reminder;s.reminded=false;if(s.status!=='ended'){s.status='paused';s.recovered=true;}}
 return state;
}
function canonical(value:unknown):unknown {
 if(Array.isArray(value))return value.map(canonical);
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).sort(([a],[b])=>a<b?-1:a>b?1:0).map(([k,v])=>[k,canonical(v)]));
 return value;
}
export function fingerprint(state:JournalState):string {return createHash('sha256').update(JSON.stringify(canonical(portableState(state)))).digest('hex');}
export function syncDocument(state:JournalState,now=new Date().toISOString()):string {
 const result=JSON.stringify({format:'focus-journal-sync',version:1,updatedAt:now,state:portableState(state)},null,2)+'\n';
 if(Buffer.byteLength(result)>MAX_SYNC_BYTES)throw new Error('同步内容超过 24 MB，请先导出备份并整理历史记录。');
 return result;
}
export function parseSyncDocument(content:string):{state:JournalState;updatedAt:string} {
 if(Buffer.byteLength(content)>MAX_SYNC_BYTES)throw new Error('远端同步文件超过 24 MB，未替换本机数据。');
 let data:any;try{data=JSON.parse(content);}catch{throw new Error('远端同步文件不是有效 JSON，未替换本机数据。');}
 if(data?.format!=='focus-journal-sync'||data.version!==1||!data.state||typeof data.updatedAt!=='string'||!Number.isFinite(Date.parse(data.updatedAt)))throw new Error('远端同步文件版本不受支持或内容不完整，未替换本机数据。');
 const state=parseJournalBackup(JSON.stringify({format:'focus-journal',version:data.state.schemaVersion,state:data.state}));
 return {state:portableState(state),updatedAt:new Date(data.updatedAt).toISOString()};
}
export function isEmptyJournal(s:JournalState):boolean {const defaults=emptyState();return keys.every(k=>k==='projects'||k==='tasks'?JSON.stringify(s[k])===JSON.stringify(defaults[k]):(s[k]??[]).length===0);}
export function summarizeSync(s:JournalState):SyncSummary {return {items:s.tasks.length,projects:s.tasks.filter(t=>t.isProject).length,sessions:s.sessions.length,notes:s.notes.length,minutes:Math.round(s.sessions.reduce((n,r)=>n+r.durationMs,0)/60000)};}
