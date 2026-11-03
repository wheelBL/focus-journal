import {randomUUID} from 'node:crypto';
import type {JournalState,Tag} from './types';
import {normalizedTag,tagKey} from './filters';
import {remapFilterTag} from './filter-rules';

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
