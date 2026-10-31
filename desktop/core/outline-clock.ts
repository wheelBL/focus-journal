import type {OutlineIndex,OutlineStats} from './outline';
import type {Session} from './types';

/** Capture once with the immutable workspace, including paused sessions. */
export function activeEffortBaseline(sessions:readonly Session[]){
 return new Map(sessions.filter(session=>session.status!=='ended').map(session=>[session.id,{taskId:session.taskId,durationMs:session.durationMs}]));
}

/** Clock reads supplement a matching content revision; they never add unknown records. */
export function activeEffortDeltas(baseline:ReturnType<typeof activeEffortBaseline>,sessions:readonly Session[]){
 const own=new Map<string,number>();
 for(const session of sessions){
  const before=baseline.get(session.id);
  if(!before||session.taskId===null||session.taskId!==before.taskId)continue;
  const delta=session.durationMs-before.durationMs;
  if(delta)own.set(session.taskId,(own.get(session.taskId)??0)+delta);
 }
 return own;
}

/** Reuse topology/history and change only affected totals, without mutating the baseline. */
export function overlayOutlineEffort(index:OutlineIndex,own:ReadonlyMap<string,number>):OutlineIndex {
 if(!own.size)return index;
 const changed=new Map<string,OutlineStats>();
 for(const [id,delta] of own){
  let node=index.nodes.get(id);const seen=new Set<string>();
  while(node&&!seen.has(node.id)){
   seen.add(node.id);const before=changed.get(node.id)??index.stats.get(node.id);
   if(before)changed.set(node.id,{...before,ownMs:before.ownMs+(node.id===id?delta:0),totalMs:before.totalMs+delta});
   node=node.parentId?index.nodes.get(node.parentId):undefined;
  }
 }
 if(!changed.size)return index;
 const stats=new Map(index.stats);for(const [id,value] of changed)stats.set(id,value);
 return {...index,stats};
}
