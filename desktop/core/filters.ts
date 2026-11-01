import {isGroup} from './item-kind';
import {localDate,shiftDate,type ItemFilter,type JournalState,type Task} from './types';
import {branchIds,outlineIndex,outlinePath,type OutlineIndex} from './outline';
import {rulesFor,matchesRules,validateRules,withRules} from './filter-rules';

export const emptyFilter=():ItemFilter=>({view:'all',query:'',showDone:false,scopeId:null,tagIds:[],tagMode:'all',planned:'any',completed:'any',due:'any',projectsOnly:false});
export function isFiltered(f:ItemFilter){const r=rulesFor(f);return !!(f.trash||f.query||f.scopeId||r.children.length||r.mode==='any');}
export function normalizedTag(value:string){return value.normalize('NFKC').trim().replace(/\s+/g,' ');}
export function tagKey(value:string){return normalizedTag(value).toLocaleLowerCase();}
export function validateFilter(value:unknown,state:JournalState):ItemFilter{
 if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('筛选条件无效。');
 const f=value as ItemFilter,one=(v:string,list:string[])=>list.includes(v);
 if(!one(f.view,['all','actions','unplanned','done'])||typeof f.query!=='string'||f.query.length>120||typeof f.showDone!=='boolean'||typeof f.projectsOnly!=='boolean'||!one(f.tagMode,['all','any'])||!one(f.planned,['any','today','through-today','unplanned'])||!one(f.completed,['any','today','this-week'])||!one(f.due,['any','today','this-week','overdue'])||!Array.isArray(f.tagIds)||f.tagIds.length>100||f.tagIds.some(id=>typeof id!=='string'||!state.tags.some(t=>t.id===id))||(f.scopeId!==null&&!state.tasks.some(t=>t.id===f.scopeId)&&!(state.schemaVersion<13&&f.scopeId==='inbox')))throw new Error('筛选条件无效。');
 if(f.trash!==undefined&&typeof f.trash!=='boolean')throw new Error('回收站筛选无效。');
 if(f.sort!==undefined&&!one(f.sort,['smart','manual','due','planned','title','created']))throw new Error('排序方式无效。');
 const normalized={...emptyFilter(),...f,tagIds:[...new Set(f.tagIds)]};
 return f.rules===undefined?normalized:withRules(normalized,validateRules(f.rules,state));
}
export function dateMatches(value:string|null|undefined,period:'today'|'this-week',now:string){
 if(!value)return false;const day=localDate(value.length===10?`${value}T12:00:00`:value),today=localDate(now);
 if(period==='today')return day===today;
 const weekday=new Date(`${today}T12:00:00`).getDay(),monday=shiftDate(today,-(weekday+6)%7);return day>=monday&&day<=shiftDate(monday,6);
}
export function filterOutline(state:JournalState,f:ItemFilter,now:string,retainedId:string|null=null,index:OutlineIndex=outlineIndex(state)){
 const matches=new Set<string>(),keep=new Set<string>(),hidden=new Set<string>(),scope=f.scopeId?branchIds(index,f.scopeId):new Set(index.nodes.keys()),tagLabels=new Map(state.tags.map(t=>[t.id,t.name]));
 for(const n of index.ordered){const t=n.record as Task;if(t.archived||(!f.trash&&t.deletedAt)||n.parentId&&hidden.has(n.parentId))hidden.add(n.id);}
 const q=f.query.trim().toLocaleLowerCase(),rules=rulesFor(f);
 for(const n of index.ordered){
  if(hidden.has(n.id)||!scope.has(n.id))continue;const t=n.record as Task;
  const tagNames=(t.tagIds??[]).map(id=>tagLabels.get(id)??'').join(' ');
  if(!!t.deletedAt!==!!f.trash)continue;
  if(q&&!`${t.title} ${t.description??''} ${tagNames}`.toLocaleLowerCase().includes(q))continue;
  const defaultClosed=['done','cancelled','handed-off'];
  const defaultVisibility=rules.mode==='all'&&defaultClosed.every(value=>rules.children.some(r=>r.kind==='condition'&&r.field==='status'&&r.op==='is-not'&&r.value===value))&&rules.children.filter(r=>r.kind==='condition'&&r.field==='status').length===3;
  const itemRules=isGroup(t)&&f.view==='all'&&defaultVisibility?{...rules,children:rules.children.filter(r=>!(r.kind==='condition'&&r.field==='status'&&r.op==='is-not'&&defaultClosed.includes(String(r.value))))}:rules;
  if(!matchesRules(itemRules,t,index,now))continue;
  matches.add(n.id);
 }
 const retain=retainedId&&index.nodes.has(retainedId)&&!hidden.has(retainedId)?retainedId:null;
 for(const id of matches)keep.add(id);
 for(let i=index.ordered.length-1;i>=0;i--){const n=index.ordered[i];if(keep.has(n.id)&&n.parentId&&scope.has(n.parentId))keep.add(n.parentId);}
 if(retain){
  for(const n of outlinePath(index,retain))keep.add(n.id);
  // An edited item may leave a nested scope. Keep the original scope connected too.
  if(f.scopeId&&keep.has(f.scopeId)&&!scope.has(retain))for(const n of outlinePath(index,f.scopeId))keep.add(n.id);
 }

 return {index,matches,keep,retained:retain&&!matches.has(retain)?retain:null};
}
