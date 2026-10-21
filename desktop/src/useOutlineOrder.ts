import {useRef,useMemo} from 'react';
import {itemOrdering} from '../core/item-order';
import type {ItemFilter} from '../core/types';
import type {OutlineIndex,OutlineNode} from '../core/outline';

/** Hold visual positions during editing/capture; stored hierarchy stays authoritative. */
export function useOutlineOrder(index:OutlineIndex,sort:NonNullable<ItemFilter['sort']>,now:string,layout:'tree'|'flat',locked:boolean){
 const previous=useRef(new Map<string|null,string[]>()),ordering=useMemo(()=>itemOrdering(index,sort,now,layout==='tree'),[index,sort,now,layout]),sorter=ordering.sorted;
 const groupKey=(nodes:OutlineNode[])=>layout==='flat'?'__flat__':nodes[0]?.parentId??null;
 const cached=useMemo(()=>{let cache=new WeakMap<OutlineNode[],OutlineNode[]>();return {reset:()=>{cache=new WeakMap();},sorted:(nodes:OutlineNode[])=>{
  if(!nodes.length)return nodes;
  const hit=cache.get(nodes);if(hit)return hit;
  const key=groupKey(nodes),fresh=sorter(nodes),ids=new Set(nodes.map(n=>n.id)),old=previous.current.get(key);
  if(!locked||!old){previous.current.set(key,fresh.map(n=>n.id));cache.set(nodes,fresh);return fresh;}
  const order=old.filter(id=>ids.has(id)),known=new Set(order);for(const n of fresh)if(!known.has(n.id)){order.push(n.id);known.add(n.id);}
  previous.current.set(key,order);const positions=new Map(order.map((id,i)=>[id,i]));
  const result=[...nodes].sort((a,b)=>positions.get(a.id)!-positions.get(b.id)!);cache.set(nodes,result);return result;
 }};},[ordering,locked,layout]);
 const placeCreated=(id:string,parentId:string|null,afterId:string|null)=>{
  const key=layout==='flat'?'__flat__':parentId,list=(previous.current.get(key)??[]).filter(x=>x!==id),at=afterId?list.indexOf(afterId):-1;
  list.splice(at<0?list.length:at+1,0,id);previous.current.set(key,list);cached.reset();
 };
 return {sorted:cached.sorted,placeCreated,reason:ordering.reason};
}
