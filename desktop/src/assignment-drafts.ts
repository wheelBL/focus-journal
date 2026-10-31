export interface AssignmentDraft {mode:'new'|'existing';title:string;parent:string;query:string;taskId:string;summary:string;summaryBase:string;restAfter:boolean}

// A postponed association is unfinished UI work, not a new item or a journal mutation.
// Keep it across dialog/page changes, isolated by workspace and bounded for long sessions.
const drafts=new Map<string,AssignmentDraft>();
const key=(dataPath:string,id:string)=>JSON.stringify([dataPath,id]);
export function readAssignmentDraft(dataPath:string,id:string){const value=drafts.get(key(dataPath,id));return value?{...value}:undefined;}
export function writeAssignmentDraft(dataPath:string,id:string,draft:AssignmentDraft){
 const idKey=key(dataPath,id);drafts.delete(idKey);drafts.set(idKey,{...draft});
 while(drafts.size>100)drafts.delete(drafts.keys().next().value!);
}
export function clearAssignmentDraft(dataPath:string,id:string){drafts.delete(key(dataPath,id));}
