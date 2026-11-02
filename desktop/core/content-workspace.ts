import type {JournalState,Task} from './types';
import {outlineIndex,outlinePath,branchIds} from './outline';
import {isGroup,isNote,isTask} from './item-kind';

/** Scope is the closest containing group or legacy project, never the item itself. */
export function contentGroupId(state:JournalState,id:string):string|null {
 const path=outlinePath(outlineIndex(state),id);path.pop();return [...path].reverse().find(n=>isGroup(n.record as Task)||(n.record as Task).isProject)?.id??null;
}
export function contentGroups(state:JournalState):Task[]{const index=outlineIndex(state);return index.ordered.map(n=>n.record as Task).filter(t=>(isGroup(t)||t.isProject)&&visible(index,t.id));}
export function visible(index:ReturnType<typeof outlineIndex>,id:string){return outlinePath(index,id).every(n=>{const t=n.record as Task;return !t.deletedAt&&!t.archived;});}
/** Legacy ancestor and descendant notes supplement explicit associations without duplicates. */
export function relatedNotes(state:JournalState,taskId:string):Task[]{const index=outlineIndex(state),task=state.tasks.find(t=>t.id===taskId);if(!task||!isTask(task)||!visible(index,taskId))return [];const descendants=branchIds(index,taskId),ancestors=new Set(outlinePath(index,taskId).map(n=>n.id));return state.tasks.filter(t=>isNote(t)&&visible(index,t.id)&&(descendants.has(t.id)||ancestors.has(t.id)||t.relatedTaskIds?.includes(taskId)));}
export function relatedTasks(state:JournalState,noteId:string):Task[]{const index=outlineIndex(state),note=state.tasks.find(t=>t.id===noteId);if(!note||!isNote(note)||!visible(index,noteId))return [];const descendants=branchIds(index,noteId),ancestors=new Set(outlinePath(index,noteId).map(n=>n.id)),links=new Set(note.relatedTaskIds??[]);return state.tasks.filter(t=>isTask(t)&&visible(index,t.id)&&(descendants.has(t.id)||ancestors.has(t.id)||links.has(t.id)));}
