import {localDate,type InboxReviewSettings,type JournalState} from './types';
import {outlineNodes} from './outline';

export function inboxReviewSettings(state:JournalState):InboxReviewSettings{return {enabled:true,time:'09:00',pendingDate:null,lastHandledDate:null,snoozedUntil:null,...state.settings.inboxReview};}
export function validateInboxReviewSettings(value:InboxReviewSettings){
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).sort().join(',')!=='enabled,lastHandledDate,pendingDate,snoozedUntil,time'||typeof value.enabled!=='boolean'||!/^([01]\d|2[0-3]):[0-5]\d$/.test(value.time))throw new Error('收件箱提醒时间无效。');
 for(const date of [value.pendingDate,value.lastHandledDate])if(date!==null&&(!/^\d{4}-\d{2}-\d{2}$/.test(date)||localDate(new Date(`${date}T12:00:00`))!==date))throw new Error('收件箱提醒日期无效。');
 if(value.snoozedUntil!==null&&(typeof value.snoozedUntil!=='string'||!Number.isFinite(Date.parse(value.snoozedUntil))||new Date(value.snoozedUntil).toISOString()!==value.snoozedUntil))throw new Error('收件箱稍后提醒时间无效。');
 if(value.snoozedUntil&&!value.pendingDate)throw new Error('收件箱提醒状态无效。');return value;
}
export function inboxItems(state:JournalState){
 const nodes=new Map(outlineNodes(state).map(n=>[n.id,n])),inbox=nodes.get('inbox');if(!inbox)return [];
 let node:typeof inbox|undefined=inbox;const visited=new Set<string>();
 while(node){if(visited.has(node.id))return [];visited.add(node.id);const t=node.record as import('./types').Task;if(t.deletedAt||t.archived||t.status!=='open')return [];if(node.parentId&&!nodes.has(node.parentId))return [];node=node.parentId?nodes.get(node.parentId):undefined;}
 return state.tasks.filter(t=>t.parentId==='inbox'&&t.status==='open'&&!t.deletedAt&&!t.archived);
}
export function inboxReviewDue(state:JournalState,now:string){
 const settings=inboxReviewSettings(state),today=localDate(now);if(!settings.enabled||!inboxItems(state).length)return false;
 if(settings.pendingDate){return settings.snoozedUntil!==null&&Date.parse(settings.snoozedUntil)<=Date.parse(now);}
 return settings.lastHandledDate!==today&&now>=new Date(`${today}T${settings.time}:00`).toISOString();
}
