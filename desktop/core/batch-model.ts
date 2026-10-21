import {branchIds,outlineIndex,outlinePath} from './outline';
import {isTask} from './item-kind';
import type {JournalState} from './types';
export type BatchAction='tag'|'untag'|'plannedDate'|'dueAt'|'move'|'done'|'cancelled'|'open'|'pause'|'resume'|'delete';
export const batchLabels:Record<BatchAction,string>={tag:'添加标签',untag:'移除标签',plannedDate:'计划开始',dueAt:'截止时间',move:'移动到',done:'完成',cancelled:'取消',open:'重新打开',pause:'暂停事项',resume:'恢复事项',delete:'移入回收站'};
const lifecycle=new Set<BatchAction>(['done','cancelled','open','pause','resume','delete']);
export const isBatchLifecycle=(action:unknown)=>lifecycle.has(action as BatchAction);
export function batchImpact(s:JournalState,ids:string[],action:BatchAction){
 const index=outlineIndex(s),selected=new Set(ids.filter(id=>index.nodes.has(id)));
 const roots=[...selected].filter(id=>!outlinePath(index,id).slice(0,-1).some(n=>selected.has(n.id)));
 const cascade=['done','cancelled','delete'].includes(action);
 // Information is skipped for execution changes, including any branch it owns.
 const actionRoots=['done','cancelled','pause'].includes(action)?[...selected].filter(id=>isTask(index.nodes.get(id)!.record)):roots;
 const affected=new Set([...selected,...(cascade?actionRoots.flatMap(id=>[...branchIds(index,id)]):[])]);
 const records=s.tasks.filter(t=>affected.has(t.id)),eligible=records.filter(t=>(['tag','untag','move','delete'].includes(action)||isTask(t))&&(!['done','cancelled'].includes(action)||!t.deletedAt&&(selected.has(t.id)||t.status==='open'))),skipped=records.filter(t=>!isTask(t)&&!['tag','untag','move','delete'].includes(action)).length;
 const branch=new Set(actionRoots.flatMap(id=>[...branchIds(index,id)])),timers=s.sessions.filter(r=>r.status!=='ended'&&(r.taskId!==null&&branch.has(r.taskId)));
 return {roots,eligible,skipped,timers:cascade||action==='pause'?timers:[],descendants:cascade?eligible.filter(t=>!selected.has(t.id)).length:0};
}
