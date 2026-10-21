import type {OutlineIndex} from './outline';
import type {Task} from './types';
export interface ParentOption {id:string;label:string}
/** Build paths and inherited availability once; never rebuild an index for each option. */
export function parentOptions(index:OutlineIndex,excluded:string[]=[],keepId?:string|null):ParentOption[]{
 const excludedRoots=new Set(excluded),omitted=new Set<string>(),paths=new Map<string,string>(),available=new Map<string,boolean>(),options:ParentOption[]=[];
 for(const node of index.ordered){
  const parent=node.parentId?paths.get(node.parentId):null,label=parent?`${parent} / ${node.title}`:node.title,task=node.record as Task;
  paths.set(node.id,label);const valid=(!node.parentId||available.get(node.parentId)===true)&&(!task.deletedAt&&!task.archived&&task.status==='open');available.set(node.id,valid);
  if(excludedRoots.has(node.id)||node.parentId&&omitted.has(node.parentId))omitted.add(node.id);
  if(!omitted.has(node.id)&&(valid||node.id===keepId))options.push({id:node.id,label});
 }
 return options;
}
