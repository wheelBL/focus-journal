import {isInformation} from './item-kind';
import {outlineIndex,outlinePath,type OutlineIndex} from './outline';
import {deadlineTime} from './deadlines';
import {taskMs,type JournalState,type Task,type Estimate} from './types';

export function blockedReason(index:OutlineIndex,id:string):string|null {
 if(isInformation(index.nodes.get(id)?.record as Task))return '笔记／信息与事件无需计时，可先转为事项。';
 for(const node of outlinePath(index,id).reverse()){
  const task=node.record as Task,who=node.id===id?'此事项':`父级「${task.title}」`;
  if(task.deletedAt)return `${who}在回收站中，请先恢复。`;
  if(task.archived)return `${who}已归档，请先恢复。`;
  if(task.status==='handed-off'&&node.id===id)return '此事项已交接关闭，请先重新接手再计时。';
  if(task.status!=='open'&&task.status!=='handed-off')return `${who}${task.status==='done'?'已完成':'已取消'}，请先重新打开。`;
  if(task.availability==='paused')return `${who}已暂停，恢复事项后才能计时。`;
 }
 return null;
}
export function deadlineConstraint(index:OutlineIndex,id:string):string|null {
 const task=index.nodes.get(id)?.record as Task|undefined;if(!task)return null;
 const ancestors=outlinePath(index,id).slice(0,-1).map(n=>n.record as Task).filter(t=>t.dueAt);
 const parent=ancestors.sort((a,b)=>deadlineTime(a.dueAt!)-deadlineTime(b.dueAt!))[0];if(!parent)return null;
 return task.dueAt&&deadlineTime(task.dueAt)>deadlineTime(parent.dueAt!)?`截止晚于父级「${parent.title}」的约束；请检查计划，子项日期未被改写。`:`父级「${parent.title}」有截止约束，子项日期独立保留。`;
}
export function estimateProgress(state:JournalState,id:string){
 return estimateProgressFrom(state.tasks.find(t=>t.id===id)!,taskMs(state,id),state.estimates.filter(e=>e.taskId===id).at(-1));
}
/** Shared calculation for both individual editors and pre-indexed review lists. */
export function estimateProgressFrom(task:Task,spentMs:number,latest?:Estimate){
 const spent=spentMs/60000;
 const remaining=latest?Math.max(0,latest.remainingMinutes-(latest.spentMinutes===undefined?0:Math.max(0,spent-latest.spentMinutes))):task.estimateMinutes===null?null:Math.max(0,task.estimateMinutes-spent);
 const explicitZero=latest?.remainingMinutes===0;
 const exhausted=task.status==='open'&&remaining===0&&!explicitZero;
 const budget=latest?latest.remainingMinutes:task.estimateMinutes;
 const since=latest?Math.max(0,spent-(latest.spentMinutes??spent)):spent;
 const overrun=budget===null?0:Math.max(0,since-budget);
 return {initial:task.estimateMinutes,spent,remaining,total:remaining===null||exhausted?null:spent+remaining,latest,explicitZero,exhausted,overrun};
}
export function canExecute(state:JournalState,id:string){return !blockedReason(outlineIndex(state),id);}
