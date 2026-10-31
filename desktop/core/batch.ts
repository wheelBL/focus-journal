import {attachTag} from './organizing';
import {assertParentAvailable,branchIds,moveBranch,outlineIndex,outlinePath} from './outline';
import {isTask} from './item-kind';
import {day,deadline,validateSchedule} from './validation';
import type {JournalState} from './types';
import {batchImpact,batchLabels,type BatchAction} from './batch-model';
export {batchImpact,batchLabels,isBatchLifecycle,type BatchAction} from './batch-model';
export function applyBatch(s:JournalState,p:Record<string,unknown>,now:string){
 if(!Array.isArray(p.ids)||!p.ids.length||p.ids.some(id=>typeof id!=='string'||!s.tasks.some(t=>t.id===id)))throw new Error('请选择仍然存在的事项。');
 if(typeof p.action!=='string'||!Object.hasOwn(batchLabels,p.action))throw new Error('批量操作无效。');
 const action=p.action as BatchAction,impact=batchImpact(s,p.ids,action);
 if(!impact.eligible.length)throw new Error('所选记录不适用这个操作。');
 if(p.confirm!==true)throw new Error('请先查看批量操作的影响。');
 if(action==='move'){
  const parent=p.value==null?null:String(p.value);assertParentAvailable(s,parent);
  for(const id of impact.roots)if(parent&&branchIds(outlineIndex(s),id).has(parent))throw new Error('不能移入自己或自己的后代。');
  for(const id of impact.roots)moveBranch(s,id,parent);return impact;
 }
 const positions=new Map(outlineIndex(s).ordered.map((n,i)=>[n.id,i]));
 if(action==='open')impact.eligible.sort((a,b)=>positions.get(a.id)!-positions.get(b.id)!);
 for(const t of impact.eligible){
  if(action!=='delete'&&t.deletedAt)throw new Error('请先从回收站恢复事项。');
  if(action==='tag')attachTag(s,t.id,p.value);
  else if(action==='untag')t.tagIds=(t.tagIds??[]).filter(id=>id!==p.value);
  else if(action==='plannedDate'){t.plannedDate=p.value?day(p.value):null;validateSchedule(t);}
  else if(action==='dueAt'){t.dueAt=p.value?deadline(p.value):null;validateSchedule(t);}
  else if(action==='pause'||action==='resume')t.availability=action==='pause'?'paused':'active';
  else if(action==='delete')t.deletedAt??=now;
  else{if(action==='open'){assertParentAvailable(s,t.parentId??null);t.ownership=null;}t.status=action;t.completedAt=action==='done'?now:null;}
 }
 for(const timer of impact.timers){if(action==='pause')timer.status='paused';else{timer.status='ended';timer.end=now;}timer.updatedAt=now;}
 return impact;
}
