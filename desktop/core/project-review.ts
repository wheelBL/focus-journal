import {outlineIndex,branchIds} from './outline';
import {isTask} from './item-kind';
import {localDate,type JournalState} from './types';
import {periodEffort} from './review';
export function projectReview(state:JournalState,start:string,end:string,allowed?:Set<string>){
 const index=outlineIndex(state),spent=new Map<string,number>(),latest=new Map<string,string>();
 for(const session of state.sessions){if(session.taskId===null)continue;const ms=periodEffort([session],start,end).cumulativeMs;spent.set(session.taskId,(spent.get(session.taskId)??0)+ms);if(ms>0&&session.summary)latest.set(session.taskId,session.summary);}
 for(const review of state.reviews)if(localDate(review.updatedAt)>=start&&localDate(review.updatedAt)<=end&&review.outcome)latest.set(review.taskId,review.outcome);
 return index.ordered.filter(n=>(n.record as import('./types').Task).isProject).map(project=>{
  const ids=branchIds(index,project.id),items=state.tasks.filter(t=>isTask(t)&&ids.has(t.id)&&(!allowed||allowed.has(t.id))),completed=items.filter(t=>t.completedAt&&localDate(t.completedAt)>=start&&localDate(t.completedAt)<=end&&t.status==='done'),ongoing=items.filter(t=>t.status==='open'&&(spent.get(t.id)??0)>0).sort((a,b)=>(spent.get(b.id)??0)-(spent.get(a.id)??0));
  return {id:project.id,title:project.title,ms:items.reduce((n,t)=>n+(spent.get(t.id)??0),0),completed,ongoing,unrecorded:items.filter(t=>t.status==='open'&&!t.deletedAt&&!(spent.get(t.id)??0)),details:[...completed,...ongoing].map(t=>({task:t,ms:spent.get(t.id)??0,outcome:latest.get(t.id)??null}))};
 }).filter(p=>p.details.length||p.unrecorded.length);
}
