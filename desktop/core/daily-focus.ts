import {isInformation} from './item-kind';
import type {OutlineIndex} from './outline';
import type {Task} from './types';

/** Explicit daily intention, separate from dates, execution and inherited urgency. */
export function isDailyFocus(task:Task,date:string){
 return task.focusDate===date&&task.status==='open'&&!isInformation(task)&&!task.deletedAt&&!task.archived;
}

/** Include selected/running/paused items and completed progress; hide archived/trash branches. */
export function dailyFocusItems(index:OutlineIndex,date:string){
 const hidden=new Set<string>(),items:Task[]=[];
 for(const node of index.ordered){
  const task=node.record as Task;
  if(task.archived||task.deletedAt||node.parentId&&hidden.has(node.parentId)){hidden.add(node.id);continue;}
  if(task.focusDate===date&&!isInformation(task)&&task.status!=='cancelled')items.push(task);
 }
 return items;
}
