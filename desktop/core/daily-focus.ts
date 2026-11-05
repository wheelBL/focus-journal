import {isInformation} from './item-kind';
import type {OutlineIndex} from './outline';
import type {Task} from './types';

export function isCurrentFocus(task:Task,date:string){return !!task.focusDate&&task.focusDate<=date&&(!task.focusStartedOn||task.focusStartedOn<=date)&&task.focusActive===true&&!task.ownership&&task.status==='open'&&!isInformation(task)&&!task.deletedAt&&!task.archived;}
export function isDailyFocus(task:Task,date:string){return isCurrentFocus(task,date);}
export function dailyFocusItems(index:OutlineIndex,date:string){
 const hidden=new Set<string>(),items:Task[]=[];
 for(const node of index.ordered){const task=node.record as Task;if(task.archived||task.deletedAt||node.parentId&&hidden.has(node.parentId)){hidden.add(node.id);continue;}if(isDailyFocus(task,date))items.push(task);}
 return items;
}
