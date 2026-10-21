import type {JournalState} from './types';

export function sessionTitle(state:JournalState,taskId:string|null):string {
  return taskId===null?'未关联事项':state.tasks.find(t=>t.id===taskId)?.title??'事项';
}
