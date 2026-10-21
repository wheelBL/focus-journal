import type {Task} from './types';

export type ItemType='task'|'note'|'event';
export const isNote=(item:Partial<Task>|null|undefined)=>item?.itemType==='note';
export const isEvent=(item:Partial<Task>|null|undefined)=>item?.itemType==='event';
export const isTask=(item:Partial<Task>|null|undefined)=>!item?.itemType||item.itemType==='task';
export const isInformation=(item:Partial<Task>|null|undefined)=>!!item&&!isTask(item);
export const itemTypeLabels={task:'事项',note:'笔记／信息',event:'事件'};

/** A leading hyphen and space is the Bullet Journal information marker. */
export function captureItem(value:string,type:ItemType='task'):{title:string;itemType:ItemType}{
 const match=/^\s*([-–.•oO○])\s+/.exec(value);
 return {title:(match?value.slice(match[0].length):value).trim(),itemType:match?'-–'.includes(match[1])?'note':'oO○'.includes(match[1])?'event':'task':type};
}
export function requireAction(item:Task){
 if(!isTask(item))throw new Error(`这是${itemTypeLabels[item.itemType!]}，请先转为事项，再设置计划、估计或计时。`);
}
