import {deadlineTime} from './deadlines';
import {isDailyFocus} from './daily-focus';
import {isInformation} from './item-kind';
import {localDate,shiftDate,type ItemFilter,type Task} from './types';
import type {OutlineIndex,OutlineNode} from './outline';

export const sortLabels={smart:'自动：重点优先',due:'截止时间最早',planned:'计划开始最早',created:'创建时间',title:'名称',manual:'手动顺序'} as const;
export const effectiveSort=(filter:ItemFilter)=>filter.sort??'smart';
type Rank=[number,number,number];
const compareRank=(a:Rank,b:Rank)=>a[0]-b[0]||finiteCompare(a[1],b[1])||finiteCompare(a[2],b[2]);
const finiteCompare=(a:number,b:number)=>a===b?0:a<b?-1:1;

/** Pure presentation order. Never rewrites parent/order/history in storage. */
export function itemOrdering(index:OutlineIndex,sort:NonNullable<ItemFilter['sort']>,now:string,branches=true){
 const inserted=new Map([...index.nodes.keys()].map((id,i)=>[id,i]));
 const stable=(a:OutlineNode,b:OutlineNode)=>a.record.createdAt.localeCompare(b.record.createdAt)||inserted.get(a.id)!-inserted.get(b.id)!||a.id.localeCompare(b.id);
 const reasons=new Map<string,string>(),source=new Map<string,string>(),ranks=new Map<string,Rank>(),blocked=new Set<string>(),today=localDate(now),tomorrow=Date.parse(`${shiftDate(today,1)}T00:00:00`),instant=Date.parse(now);
 for(const n of index.ordered){const t=n.record as Task;if(t.deletedAt||t.archived||t.availability==='paused'||t.status&&t.status!=='open'&&t.status!=='handed-off'||n.parentId&&blocked.has(n.parentId))blocked.add(n.id);}
 for(const n of [...index.ordered].reverse()){
  const t=n.record as Task,due=t.dueAt?deadlineTime(t.dueAt):Infinity,planned=t.plannedDate?Date.parse(`${t.plannedDate}T00:00:00`):Infinity;
  const group=t.status&&t.status!=='open'?7:blocked.has(n.id)?5:isInformation(t)?6:t.ownership?4:isDailyFocus(t,today)?-1:due<instant?0:due<tomorrow||planned<tomorrow?1:Math.min(due,planned)<Infinity?2:3;
  let rank:Rank=[group,due,planned];source.set(n.id,n.id);reasons.set(n.id,group===-1?'已加入今日重点':group===0?'截止已过':group===1?due<tomorrow?'今日截止':'计划已开始':group===2?'后续安排':group===3?'未设置日期':group===4?'责任已交接':group===5?'此项或父级暂停 / 不可执行':group===6?'信息按创建顺序':'已经结束');
  if(branches&&!blocked.has(n.id))for(const child of index.children.get(n.id)??[]){const other=ranks.get(child.id)!;if(other[0]<5&&compareRank(other,rank)<0){rank=other;source.set(n.id,source.get(child.id)!);}}
  ranks.set(n.id,rank);
 }
 const sorted=(nodes:OutlineNode[])=>sort==='manual'?nodes:[...nodes].sort((a,b)=>{
  if(sort==='smart')return compareRank(ranks.get(a.id)!,ranks.get(b.id)!)||stable(a,b);
  if(sort==='title')return a.title.localeCompare(b.title,'zh-CN')||stable(a,b);
  if(sort==='created')return stable(a,b);
  const field=sort==='due'?'dueAt':'plannedDate',at=(a.record as Task)[field],bt=(b.record as Task)[field];
  const time=(v:string|null|undefined)=>v?(sort==='due'?deadlineTime(v):Date.parse(`${v}T00:00:00`)):Infinity;
  return finiteCompare(time(at),time(bt))||stable(a,b);
 });
 return {sorted,reason:(id:string)=>{if(sort!=='smart')return sortLabels[sort];const origin=source.get(id);return origin&&origin!==id?`因子项「${index.nodes.get(origin)?.title}」${reasons.get(origin)}`:reasons.get(id)??'';}};
}
export function itemSorter(index:OutlineIndex,sort:NonNullable<ItemFilter['sort']>,now:string,branches=true){return itemOrdering(index,sort,now,branches).sorted;}
