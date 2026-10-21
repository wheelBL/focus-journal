import type {OutlineIndex,OutlineNode} from '../core/outline';
export interface OutlineRow {node:OutlineNode;depth:number;position:number;size:number}
/** A logical, filtered tree projection independent of viewport and pointer movement. */
export function projectOutline(index:OutlineIndex,keep:Set<string>,matches:Set<string>,pinned:string|null,scope:string|null,collapsed:Set<string>,layout:'tree'|'flat',sorted:(nodes:OutlineNode[])=>OutlineNode[]):OutlineRow[]{
 if(layout==='flat'){const nodes=sorted(index.ordered).filter(n=>matches.has(n.id)||n.id===pinned);return nodes.map((node,i)=>({node,depth:0,position:i+1,size:nodes.length}));}
 const children=(id:string|null)=>sorted(index.children.get(id)??[]).filter(n=>keep.has(n.id));
 const roots=scope?[index.nodes.get(scope)!].filter(n=>n&&keep.has(n.id)):children(null),rows:OutlineRow[]=[],stack=roots.map((node,i)=>({node,depth:0,position:i+1,size:roots.length})).reverse();
 while(stack.length){const row=stack.pop()!;rows.push(row);if(!collapsed.has(row.node.id)){const nested=children(row.node.id);for(let i=nested.length-1;i>=0;i--)stack.push({node:nested[i],depth:row.depth+1,position:i+1,size:nested.length});}}
 return rows;
}
