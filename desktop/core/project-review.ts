import {outlineIndex,type OutlineIndex} from './outline';
import {isTask} from './item-kind';
import {localDate,type JournalState,type Task} from './types';
import {periodEffort} from './review';
export function projectReview(state:JournalState,start:string,end:string,allowed?:Set<string>,prepared?:{tree:OutlineIndex;spent:Map<string,number>;projectLatest:Map<string,string>}){
 const index=prepared?.tree??outlineIndex(state),spent=prepared?.spent??new Map<string,number>(),latest=prepared?.projectLatest??new Map<string,string>();
 if(!prepared){for(const session of state.sessions){if(session.taskId===null)continue;const ms=periodEffort([session],start,end).cumulativeMs;spent.set(session.taskId,(spent.get(session.taskId)??0)+ms);if(ms>0&&session.summary)latest.set(session.taskId,session.summary);}
 for(const review of state.reviews)if(localDate(review.updatedAt)>=start&&localDate(review.updatedAt)<=end&&review.outcome)latest.set(review.taskId,review.outcome);}
 // Share project ancestry. Each item is visited only for projects that actually contain it.
 const projects=index.ordered.filter(n=>(n.record as Task).isProject),ancestors=new Map<string,string[]>(),groups=new Map(projects.map(p=>[p.id,[] as Task[]]));
 for(const node of index.ordered){const inherited=node.parentId?ancestors.get(node.parentId)??[]:[];ancestors.set(node.id,(node.record as Task).isProject?[...inherited,node.id]:inherited);}
 for(const task of state.tasks)if(isTask(task)&&(!allowed||allowed.has(task.id)))for(const id of ancestors.get(task.id)??[])groups.get(id)!.push(task);
 return projects.map(project=>{
  const items=groups.get(project.id)!,completed=items.filter(t=>t.completedAt&&localDate(t.completedAt)>=start&&localDate(t.completedAt)<=end&&t.status==='done'),ongoing=items.filter(t=>t.status==='open'&&(spent.get(t.id)??0)>0).sort((a,b)=>(spent.get(b.id)??0)-(spent.get(a.id)??0));
  return {id:project.id,title:project.title,ms:items.reduce((n,t)=>n+(spent.get(t.id)??0),0),completed,ongoing,unrecorded:items.filter(t=>t.status==='open'&&!t.deletedAt&&!(spent.get(t.id)??0)),details:[...completed,...ongoing].map(t=>({task:t,ms:spent.get(t.id)??0,outcome:latest.get(t.id)??null}))};
 }).filter(p=>p.details.length||p.unrecorded.length);
}
