import type {AiScope,AiConversationTurn,AiSuggestion} from './ai-assistant-types';
import type {AiMessage} from './ai-types';
export interface AiConversation {id:string;scope:AiScope|null;turns:AiConversationTurn[]}
export interface AiConversationPersistence {load():AiConversation|null;save(value:AiConversation):void}
export const sameAiScope=(a:AiScope|null,b:AiScope|null)=>!!a&&!!b&&a.kind===b.kind&&(a.kind!=='item'||a.itemId===b.itemId);
export function historicalSuggestions(items:AiSuggestion[]):AiSuggestion[]{return items.map(s=>({...s,state:s.state==='pending'?'historical':s.state}));}
/** Supply only same-scope recent turns. Each model reply is labelled with confirmed outcomes. */
export function conversationMessages(turns:AiConversationTurn[]):AiMessage[]{
 return turns.slice(-8).flatMap(turn=>{
  const statuses=turn.suggestions.map(s=>`${s.label}（${s.target.slice(0,300)}，建议内容：${s.after.slice(0,500)}）：${s.state==='applied'?'已由用户确认并应用':'未应用，旧建议已失效'}`).join('；');
  return [{role:'user' as const,content:turn.prompt.slice(0,4000)},{role:'assistant' as const,content:`${turn.text.slice(0,6000)}\n[上一轮结果：${statuses||'无已应用建议'}]`}];
 });
}
/** Only bounded, validated visible conversation data is restored; executable plans are never persisted. */
export function parseConversation(value:unknown):AiConversation {
 if(!value||typeof value!=='object')throw Error('invalid conversation');const v=value as AiConversation;
 if(typeof v.id!=='string'||v.id.length>100||!Array.isArray(v.turns)||v.turns.length>20)throw Error('invalid conversation');
 const scope=(s:AiScope|null)=>s===null||!!s&&['item','today','recent','all'].includes(s.kind)&&(s.kind!=='item'||typeof s.itemId==='string'&&s.itemId.length<=100);
 const contextValid=(c:AiConversationTurn['context'])=>c===null||!!c&&typeof c.label==='string'&&c.label.length<=1000&&Number.isInteger(c.itemCount)&&c.itemCount>=0&&c.itemCount<=100&&Number.isInteger(c.recordCount)&&c.recordCount>=0&&c.recordCount<=100&&typeof c.truncated==='boolean'&&Array.isArray(c.items)&&c.items.length<=100&&c.items.every(i=>!!i&&['id','title','path'].every(k=>typeof (i as unknown as Record<string,unknown>)[k]==='string'&&String((i as unknown as Record<string,unknown>)[k]).length<=10000));
 if(!scope(v.scope)||v.turns.some(t=>!t||!scope(t.scope)||!sameAiScope(v.scope,t.scope)||typeof t.id!=='string'||t.id.length>100||typeof t.prompt!=='string'||t.prompt.length>4000||typeof t.text!=='string'||t.text.length>30000||!contextValid(t.context)||!['idle','running','done','cancelled','error'].includes(t.phase)||t.error!==null&&(typeof t.error!=='string'||t.error.length>1000)||!Array.isArray(t.suggestions)||t.suggestions.length>20||t.suggestions.some(s=>!s||!['pending','applied','historical'].includes(s.state)||s.reason!==undefined&&(typeof s.reason!=='string'||s.reason.length>1000)||s.error!==undefined&&(typeof s.error!=='string'||s.error.length>1000)||['id','label','target','before','after'].some(k=>typeof (s as unknown as Record<string,unknown>)[k]!=='string'||String((s as unknown as Record<string,unknown>)[k]).length>10000))))throw Error('invalid conversation');
 const cleanScope=(s:AiScope):AiScope=>s.kind==='item'?{kind:'item',itemId:s.itemId}:{kind:s.kind};
 const turns=v.turns.map(t=>({id:t.id,scope:cleanScope(t.scope),prompt:t.prompt,text:t.text,phase:t.phase==='running'?'cancelled' as const:t.phase,error:t.phase==='running'?'上次生成中断，请继续或重新提问。':t.error,context:t.context?{label:t.context.label,itemCount:t.context.itemCount,recordCount:t.context.recordCount,truncated:t.context.truncated,items:t.context.items.map(i=>({id:i.id,title:i.title,path:i.path}))}:null,suggestions:t.suggestions.map(s=>({id:s.id,label:s.label,target:s.target,before:s.before,after:s.after,state:s.state==='pending'?'historical' as const:s.state,...s.error?{error:s.error}:{},...s.reason?{reason:s.reason}:{}}))}));
 return {id:v.id,scope:v.scope?cleanScope(v.scope):null,turns};
}
