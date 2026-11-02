import {isGroup,isTask} from '../core/item-kind';
import type {Task} from '../core/types';
import type {OutlineIndex,OutlineNode} from '../core/outline';
export interface OutlineRow {node:OutlineNode;depth:number;position:number;size:number}
/** Transparent legacy information ancestors preserve task reachability without becoming task rows. */
export function projectedChildren(index:OutlineIndex,id:string|null,keep:Set<string>,taskOnly=false):OutlineNode[]{
 const result:OutlineNode[]=[],stack=[...(index.children.get(id)??[])].reverse();
 while(stack.length){const node=stack.pop()!;if(!keep.has(node.id))continue;if(!taskOnly||isTask(node.record as Task)||isGroup(node.record as Task))result.push(node);else{const nested=index.children.get(node.id)??[];for(let i=nested.length-1;i>=0;i--)stack.push(nested[i]);}}
 return result;
}
/** A logical, filtered projection; it never rewrites the canonical hierarchy. */
export function projectOutline(index:OutlineIndex,keep:Set<string>,matches:Set<string>,pinned:string|null,scope:string|null,collapsed:Set<string>,layout:'tree'|'flat',sorted:(nodes:OutlineNode[])=>OutlineNode[],taskOnly=false):OutlineRow[]{
 if(layout==='flat'){const nodes=sorted(index.ordered).filter(n=>(matches.has(n.id)||n.id===pinned)&&(!taskOnly||isTask(n.record as Task)));return nodes.map((node,i)=>({node,depth:0,position:i+1,size:nodes.length}));}
 const children=(id:string|null)=>sorted(projectedChildren(index,id,keep,taskOnly));
 const scopeNode=scope?index.nodes.get(scope):undefined;
 const roots=scopeNode&&keep.has(scopeNode.id)?(!taskOnly||isTask(scopeNode.record as Task)||isGroup(scopeNode.record as Task)?[scopeNode]:children(scopeNode.id)):scope?[]:children(null),rows:OutlineRow[]=[],stack=roots.map((node,i)=>({node,depth:0,position:i+1,size:roots.length})).reverse();
 while(stack.length){const row=stack.pop()!;rows.push(row);if(!collapsed.has(row.node.id)){const nested=children(row.node.id);for(let i=nested.length-1;i>=0;i--)stack.push({node:nested[i],depth:row.depth+1,position:i+1,size:nested.length});}}
 return rows;
}
