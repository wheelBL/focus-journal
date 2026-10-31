import {isTask} from './item-kind';
import {outlineIndex,outlinePath} from './outline';
import type {JournalState,Task} from './types';

/** Finished tasks can receive historical effort; hidden branches cannot receive new effort. */
export function isEffortDestination(state:JournalState,task:Task,index=outlineIndex(state)){
 return isTask(task)&&!outlinePath(index,task.id).some(n=>n.record.archived||('deletedAt' in n.record&&n.record.deletedAt));
}

export function effortDestinations(state:JournalState,currentId?:string|null){
 const index=outlineIndex(state);
 // Preserve the owner when correcting an existing historical record in a hidden branch.
 return state.tasks.filter(t=>isTask(t)&&(t.id===currentId||isEffortDestination(state,t,index)));
}
