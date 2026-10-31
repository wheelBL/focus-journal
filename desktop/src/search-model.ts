import {outlineIndex} from '../core/outline';
import type {JournalState,Task,Note} from '../core/types';

export interface SearchItem {task:Task;path:string;tags:string[];text:string;hidden:boolean;spentMs:number}
export interface SearchNote {note:Note;text:string;hidden:boolean}
/** One shared outline and lookup pass per journal change, never one tree per result. */
export function searchIndex(state:JournalState){
 const outline=outlineIndex(state),tags=new Map(state.tags.map(t=>[t.id,t.name])),paths=new Map<string,string>(),hidden=new Map<string,boolean>();
 for(const node of outline.ordered){
  const parent=node.parentId?outline.nodes.get(node.parentId):undefined;
  const parentPath=parent?paths.get(parent.id)??'':'';
  paths.set(node.id,parent?.kind==='project'?[parentPath,parent.title].filter(Boolean).join(' / '):parentPath);
  hidden.set(node.id,!!(node.record as Task).deletedAt||!!node.record.archived||!!(node.parentId&&hidden.get(node.parentId)));
 }
 const items:SearchItem[]=state.tasks.map(task=>{const path=paths.get(task.id)||'最外层',names=(task.tagIds??[]).map(id=>tags.get(id)??'');return {task,path,tags:names,text:`${task.title} ${task.description??''} ${path} ${names.join(' ')}`.toLocaleLowerCase(),hidden:hidden.get(task.id)??false,spentMs:outline.stats.get(task.id)?.ownMs??0};});
 const notes:SearchNote[]=state.notes.map(note=>({note,text:note.text.toLocaleLowerCase(),hidden:!!note.taskId&&!!hidden.get(note.taskId)}));
 return {items,notes};
}
export function searchMatches(index:ReturnType<typeof searchIndex>,query:string,includeHidden=false){
 const q=query.toLocaleLowerCase();
 return {items:index.items.filter(item=>(includeHidden||!item.hidden)&&item.text.includes(q)),notes:index.notes.filter(entry=>(includeHidden||!entry.hidden)&&entry.text.includes(q))};
}
