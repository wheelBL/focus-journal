import {isInformation} from './item-kind';
import type {JournalState,Project,Task} from './types';

export type OutlineNode={id:string;kind:'project'|'task';title:string;parentId:string|null;order:number;record:Project|Task};
export type OutlineStats={tasks:number;done:number;ownMs:number;totalMs:number;childEstimate:number;ownEstimate:number|null};
export type OutlineIndex={nodes:Map<string,OutlineNode>;children:Map<string|null,OutlineNode[]>;ordered:OutlineNode[];stats:Map<string,OutlineStats>};
export type OutlinePosition={id:string;parentId:string|null;beforeId:string|null};

export function outlineNodes(state:JournalState):OutlineNode[]{
  if(state.schemaVersion<4)return [...state.projects.map((p,i)=>({id:p.id,kind:'project' as const,title:p.name,parentId:p.parentId??null,order:p.order??i,record:p})),...state.tasks.map((t,i)=>({id:t.id,kind:'task' as const,title:t.title,parentId:t.parentId===undefined?t.projectId:t.parentId,order:t.order??i,record:t}))];
  const legacy=state.schemaVersion<13&&!state.tasks.some(t=>t.id==='inbox')?state.projects.filter(p=>p.id==='inbox').map(p=>({id:p.id,kind:'project' as const,title:p.name,parentId:p.parentId??null,order:p.order??0,record:p})):[];
  return [...legacy,...state.tasks.map((t,i)=>({id:t.id,kind:t.isProject?'project' as const:'task' as const,title:t.title,parentId:t.parentId??null,order:t.order??i,record:t}))];
}

// Iterative traversal keeps deeply nested user outlines off the JavaScript call stack.
export function outlineIndex(state:JournalState):OutlineIndex {
  const nodes=new Map(outlineNodes(state).map(n=>[n.id,n])),children=new Map<string|null,OutlineNode[]>();
  for(const node of nodes.values()){const list=children.get(node.parentId)??[];list.push(node);children.set(node.parentId,list);}
  for(const list of children.values())list.sort((a,b)=>a.order-b.order||a.id.localeCompare(b.id));
  const ordered:OutlineNode[]=[],stack=[...(children.get(null)??[])].reverse(),seen=new Set<string>();
  while(stack.length){const node=stack.pop()!;if(seen.has(node.id))continue;seen.add(node.id);ordered.push(node);const nested=children.get(node.id)??[];for(let i=nested.length-1;i>=0;i--)stack.push(nested[i]);}
  const effort=new Map<string,number>();for(const s of state.sessions)if(s.taskId!==null)effort.set(s.taskId,(effort.get(s.taskId)??0)+s.durationMs);
  const stats=new Map<string,OutlineStats>();
  for(let i=ordered.length-1;i>=0;i--){const n=ordered[i],task='status' in n.record?n.record as Task:null;
    const ownMs=effort.get(n.id)??0,value:OutlineStats={tasks:task&&!isInformation(task)?1:0,done:task?.status==='done'?1:0,ownMs,totalMs:ownMs,childEstimate:0,ownEstimate:task?.estimateMinutes??null};
    for(const child of children.get(n.id)??[]){const c=stats.get(child.id)!;value.tasks+=c.tasks;value.done+=c.done;value.totalMs+=c.totalMs;value.childEstimate+=c.ownEstimate??c.childEstimate;}
    stats.set(n.id,value);
  }
  return {nodes,children,ordered,stats};
}

export function outlinePath(index:OutlineIndex,id:string):OutlineNode[]{
  const result:OutlineNode[]=[],seen=new Set<string>();let current=index.nodes.get(id);
  while(current&&!seen.has(current.id)){seen.add(current.id);result.push(current);current=current.parentId?index.nodes.get(current.parentId):undefined;}
  return result.reverse();
}
export function branchIds(index:OutlineIndex,id:string):Set<string>{
  const ids=new Set<string>(),stack=[id];while(stack.length){const next=stack.pop()!;if(ids.has(next))continue;ids.add(next);for(const child of index.children.get(next)??[])stack.push(child.id);}return ids;
}

export function inheritedProjects(state:JournalState):Map<string,string|null>{
  const index=outlineIndex(state),owners=new Map<string,string|null>();
  for(const n of index.ordered)owners.set(n.id,n.kind==='project'?n.id:((n.parentId&&owners.get(n.parentId))||(state.schemaVersion<13?'inbox':null)));
  return owners;
}
export function syncProjectOwnership(state:JournalState){
  const owners=inheritedProjects(state);for(const t of state.tasks)t.projectId=owners.get(t.id)??null;
}
// Tasks are canonical items. Projects remains a compatibility projection for old views/exports.
export function ensureOutlineFields(state:JournalState){
  state.tags??=[];state.views??=[];state.moves??=[];state.itemReviews??=[];state.deletedSessions??=[];
  const known=new Set(state.tasks.map(t=>t.id));
  state.projects.forEach((p,i)=>{p.parentId??=null;p.order??=i;if(!known.has(p.id))state.tasks.push({id:p.id,projectId:p.id,title:p.name,description:p.description,isProject:true,archived:p.archived,tagIds:[],parentId:p.parentId,order:p.order,outcome:'',nextAction:'',estimateMinutes:null,plannedDate:null,dueAt:null,status:'open',createdAt:p.createdAt,startedAt:null,completedAt:null});});
  state.tasks.forEach((t,i)=>{if(t.parentId===undefined)t.parentId=t.projectId;if(t.order===undefined)t.order=i;t.dueAt??=null;t.isProject??=false;t.description??='';t.archived??=false;t.tagIds??=[];t.availability??='active';t.deletedAt??=null;t.reviewSchedule??=null;t.reminder??=null;t.itemType??='task';t.eventAt??=null;t.eventEnd??=null;t.focusDate??=null;t.updatedAt??=t.createdAt;});
  state.projects=state.tasks.filter(t=>t.isProject).map(t=>({id:t.id,name:t.title,description:t.description!,archived:t.archived!,createdAt:t.createdAt,parentId:t.parentId,order:t.order}));
  if(state.settings.rest===undefined||state.schemaVersion<15&&state.settings.rest===null&&state.settings.breakUntil)state.settings.rest=state.settings.breakUntil?{id:`legacy-break-${state.settings.breakUntil}`,phase:'running',sessionId:null,minutes:state.settings.breakMinutes,notify:false}:null;
  state.schemaVersion=16;
}
export function migrateOutline(state:JournalState):JournalState{
  const next=structuredClone(state);ensureOutlineFields(next);assertOutline(next);syncProjectOwnership(next);return next;
}

export function assertOutline(state:JournalState){
  const all=outlineNodes(state),nodes=new Map(all.map(n=>[n.id,n]));
  if(nodes.size!==all.length)throw new Error('项目与任务的标识不能重复。');
  for(const n of all){
    if(n.record.parentId===undefined||n.record.order===undefined||!Number.isFinite(n.order)||n.order<0)throw new Error('任务层级数据无效。');
    if(n.parentId!==null&&(typeof n.parentId!=='string'||!nodes.has(n.parentId)))throw new Error('父级不存在。');
  }
  const visited=new Set<string>();
  for(const n of all){let current:OutlineNode|undefined=n;const chain=new Set<string>();
    while(current&&!visited.has(current.id)){if(chain.has(current.id))throw new Error('不能将项目或任务移动到自身或自己的子项中。');chain.add(current.id);current=current.parentId?nodes.get(current.parentId):undefined;}
    for(const id of chain)visited.add(id);
  }
}
export function assertParentAvailable(state:JournalState,parentId:string|null){
  if(parentId===null)return;const index=outlineIndex(state);if(!index.nodes.has(parentId))throw new Error('父级不存在。');
  for(const n of outlinePath(index,parentId)){
    if((n.record as Task).deletedAt)throw new Error('请先从回收站恢复父事项。');
    if((n.record as Project).archived)throw new Error('请先恢复已归档的父项目。');
    if('status' in n.record&&(n.record as Task).status!=='open')throw new Error('请先重新打开父任务，再放入子项。');
  }
}
export function currentPosition(state:JournalState,id:string):OutlinePosition{
  const index=outlineIndex(state),node=index.nodes.get(id);if(!node)throw new Error('找不到这个项目或任务。');
  const siblings=index.children.get(node.parentId)??[];return {id,parentId:node.parentId,beforeId:siblings[siblings.findIndex(n=>n.id===id)+1]?.id??null};
}
export function moveBranch(state:JournalState,id:string,parentId:string|null,beforeId:string|null=null){
  const index=outlineIndex(state),node=index.nodes.get(id);if(!node)throw new Error('找不到这个项目或任务。');
  if(parentId!==null&&branchIds(index,id).has(parentId))throw new Error('不能将项目或任务移动到自身或自己的子项中。');
  assertParentAvailable(state,parentId);
  const destination=(index.children.get(parentId)??[]).filter(n=>n.id!==id);
  const insert=beforeId===null?destination.length:destination.findIndex(n=>n.id===beforeId);
  if(insert<0)throw new Error('目标位置已经改变，请重试。');
  const oldParent=node.parentId;node.record.parentId=parentId;destination.splice(insert,0,node);
  destination.forEach((n,i)=>{n.record.order=i;});
  if(oldParent!==parentId)(index.children.get(oldParent)??[]).filter(n=>n.id!==id).forEach((n,i)=>{n.record.order=i;});
  syncProjectOwnership(state);
}
export function moveRelative(state:JournalState,id:string,targetId:string|null,position:'inside'|'before'|'after'|'root'){
  if(position==='root'){moveBranch(state,id,null);return;}
  const index=outlineIndex(state),target=targetId?index.nodes.get(targetId):undefined;
  if(!target)throw new Error('请选择移动目标。');if(id===target.id)throw new Error('不能移动到自身。');
  if(position==='inside')moveBranch(state,id,target.id);
  else {const siblings=(index.children.get(target.parentId)??[]).filter(n=>n.id!==id);const before=position==='before'?target.id:siblings[siblings.findIndex(n=>n.id===target.id)+1]?.id??null;moveBranch(state,id,target.parentId,before);}
}
export function openDescendants(state:JournalState,id:string){const ids=branchIds(outlineIndex(state),id);return state.tasks.filter(t=>t.id!==id&&ids.has(t.id)&&!isInformation(t)&&t.status==='open'&&!t.deletedAt);}
