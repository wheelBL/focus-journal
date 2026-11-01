import {ownershipLabel,completionLabels} from './activity';
import type {OutlineIndex} from './outline';
import type {Task,TimerView} from './types';
import {isInformation,isEvent,isGroup} from './item-kind';
import {isDeadlineOverdue} from './deadlines';

export type ProgressKind='waiting'|'progress'|'running'|'timer-paused'|'paused'|'blocked'|'done'|'cancelled'|'handed-off'|'note'|'event'|'deleted'|'group';
export interface ItemPresentation {kind:ProgressKind;label:string;reason:string;branch:boolean;childCount:number;descendantDone:number;descendantTasks:number;ownOverdue:boolean;descendantOverdue:number;progressed:boolean}
/** One tree pass for inherited availability, one for branch progress; no per-row subtree scans. */
export function itemPresentations(index:OutlineIndex,timers:TimerView[],now:string){
 const result=new Map<string,ItemPresentation>(),active=new Map(timers.map(t=>[t.taskId,t])),blocked=new Map<string,string>();
 for(const n of index.ordered){
  const task=n.record as Task,ancestor=n.parentId?blocked.get(n.parentId):undefined;
  if(ancestor)blocked.set(n.id,ancestor);
  else if(task.deletedAt||task.archived||task.status!=='open'&&task.status!=='handed-off'||task.availability==='paused')blocked.set(n.id,task.title);
 }
 const totals=new Map<string,{tasks:number;done:number;open:number;overdue:number;running:number;progressed:boolean}>();
 for(let i=index.ordered.length-1;i>=0;i--){
  const node=index.ordered[i],task=node.record as Task,timer=active.get(node.id),children=(index.children.get(node.id)??[]).filter(n=>!(n.record as Task).deletedAt&&!(n.record as Task).archived),info=isInformation(task);
  const ownOverdue=!task.ownership&&!info&&task.status==='open'&&isDeadlineOverdue(task.dueAt,now),ownProgressed=!!task.startedAt||(index.stats.get(node.id)?.ownMs??0)>0||!!timer;
  let descendantTasks=0,descendantDone=0,descendantOpen=0,descendantOverdue=0,descendantRunning=0,childProgressed=false;
  for(const child of children){const t=totals.get(child.id)!;descendantTasks+=t.tasks;descendantDone+=t.done;descendantOpen+=t.open;descendantOverdue+=t.overdue;descendantRunning+=t.running;childProgressed||=t.progressed||t.done>0;}
  const progressed=ownProgressed||childProgressed,ancestor=node.parentId?blocked.get(node.parentId):undefined;
  let kind:ProgressKind='waiting',label='待启动',reason='尚无实际开始或投入记录';
  if(task.deletedAt){kind='deleted';label='回收站';reason='内容和历史记录保留';}
  else if(isGroup(task)){kind='group';label=(descendantOpen?`${descendantOpen} 个待办`:children.length?'暂无待办':'暂无事项')+(descendantRunning?` · ${descendantRunning} 计时中`:'');reason=[descendantOverdue?`${descendantOverdue} 个子事项逾期`:'',descendantRunning?`${descendantRunning} 个子事项计时中`:''].filter(Boolean).join(' · ')||'分组汇总子事项';}
  else if(info){kind=isEvent(task)?'event':'note';label=isEvent(task)?'事件':'笔记';reason=isEvent(task)?'日历安排，不计为实际投入':'信息记录，没有执行状态';}
  else if(task.status==='done'){kind='done';label=task.completionBy==='other'?'他人完成':task.completionBy==='shared'?'共同完成':'已完成';reason='整体进度完成，个人成果按完成归属分别统计';}
  else if(task.status==='handed-off'){kind='handed-off';label=ownershipLabel(task);reason='本人责任已交接关闭，历史投入保留，不计为完成';}
  else if(task.status==='cancelled'){kind='cancelled';label='已取消';reason='已取消此事项';}
  else if(task.availability==='paused'||task.archived){kind='paused';label='已暂停';reason='事项暂停，与计时暂停不同';}
  else if(ancestor){kind='blocked';label='父项受限';reason=`父级「${ancestor}」已暂停、结束或归档`;}
  else if(timer){kind=timer.paused?'timer-paused':'running';label=timer.paused?'计时暂停':'正在计时';reason=timer.paused?'已暂停计时，事项仍在推进':'当前计时器正在记录实际投入';}
  else if(progressed){kind='progress';label='进行中';reason=ownProgressed?'已有实际开始或投入记录，当前没有运行计时器':'子项已有推进；不修改本项的实际开始时间';}
  totals.set(node.id,{tasks:descendantTasks+(!info?1:0),done:descendantDone+(!info&&task.status==='done'?1:0),open:descendantOpen+(!info&&task.status==='open'?1:0),overdue:descendantOverdue+(ownOverdue?1:0),running:descendantRunning+(!info&&timer&&!timer.paused?1:0),progressed});
  if(task.ownership&&task.status==='open'&&!timer&&!info){label=ownershipLabel(task);reason='责任已转交，历史投入保留';}
  result.set(node.id,{kind,label,reason,branch:children.length>0,childCount:children.length,descendantDone,descendantTasks,ownOverdue,descendantOverdue,progressed});
 }
 return result;
}
