import {randomUUID} from 'node:crypto';
import type {JournalState,Tag} from './types';
import {normalizedTag,tagKey} from './filters';
import {remapFilterTag,ruleTagIds,rulesFor} from './filter-rules';

export function tagName(value:unknown){if(typeof value!=='string')throw new Error('请输入标签名称。');const name=normalizedTag(value);if(!name||name.length>40)throw new Error('标签名称需要 1–40 个字。');return name;}
export function attachTag(s:JournalState,itemId:unknown,name:unknown){
 const item=s.tasks.find(t=>t.id===itemId);if(!item)throw new Error('事项不存在。');const label=tagName(name);
 let tag=s.tags.find(t=>tagKey(t.name)===tagKey(label));if(!tag){tag={id:randomUUID(),name:label};s.tags.push(tag);}
 item.tagIds=[...new Set([...(item.tagIds??[]),tag.id])];
}
export function renameTag(s:JournalState,id:unknown,name:unknown){
 const tag=s.tags.find(t=>t.id===id);if(!tag)throw new Error('标签不存在。');const label=tagName(name),other=s.tags.find(t=>t.id!==id&&tagKey(t.name)===tagKey(label));
 if(!other){tag.name=label;return;}
 for(const item of s.tasks)item.tagIds=[...new Set((item.tagIds??[]).map(t=>t===id?other.id:t))];
 for(const view of s.views)view.filter=remapFilterTag(view.filter,String(id),other.id);
 s.tags=s.tags.filter(t=>t.id!==id);
}
export function deleteTag(s:JournalState,id:unknown){
 if(!s.tags.some(t=>t.id===id))throw new Error('标签不存在。');s.tags=s.tags.filter(t=>t.id!==id);
 for(const item of s.tasks)item.tagIds=(item.tagIds??[]).filter(t=>t!==id);
 for(const view of s.views)view.filter=remapFilterTag(view.filter,String(id),null);
}

// Restore only organizing fields; live timer segments, completions and work records are never rolled back.
export function organizingUndo(before:JournalState,after:JournalState):(state:JournalState)=>void{
 const changes:{id:string;key:string;before:unknown;after:unknown}[]=[];
 for(const a of before.tasks){const b=after.tasks.find(t=>t.id===a.id);if(!b)continue;for(const key of ['itemType','title','description','isProject','tagIds','plannedDate','dueAt','eventAt','eventEnd','focusDate','recurrence'] as const)if(JSON.stringify(a[key])!==JSON.stringify(b[key]))changes.push({id:a.id,key,before:structuredClone(a[key]),after:structuredClone(b[key])});}
 const tagIds=new Set([...before.tags,...after.tags].map(t=>t.id));
 const tags=[...tagIds].filter(id=>JSON.stringify(before.tags.find(t=>t.id===id))!==JSON.stringify(after.tags.find(t=>t.id===id))).map(id=>({id,before:before.tags.find(t=>t.id===id),after:after.tags.find(t=>t.id===id)}));
 const views=before.views.map(v=>({id:v.id,before:v.filter,after:after.views.find(a=>a.id===v.id)?.filter})).filter(v=>JSON.stringify(v.before)!==JSON.stringify(v.after));
 return s=>{
  for(const c of changes){const item=s.tasks.find(t=>t.id===c.id);if(item&&JSON.stringify((item as any)[c.key])===JSON.stringify(c.after))(item as any)[c.key]=structuredClone(c.before);}
  for(const v of views){const item=s.views.find(a=>a.id===v.id);if(item&&JSON.stringify(item.filter)===JSON.stringify(v.after))item.filter=structuredClone(v.before);}
  for(const t of tags){const i=s.tags.findIndex(a=>a.id===t.id);if(JSON.stringify(s.tags[i])!==JSON.stringify(t.after))continue;if(t.before){if(i<0)s.tags.push(structuredClone(t.before));else s.tags[i]=structuredClone(t.before);}else if(!s.tasks.some(a=>a.tagIds?.includes(t.id))&&!s.views.some(v=>ruleTagIds(rulesFor(v.filter)).includes(t.id)))s.tags=s.tags.filter(a=>a.id!==t.id);}
 };
}
