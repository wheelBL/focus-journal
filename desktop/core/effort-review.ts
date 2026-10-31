import {outlineIndex} from './outline';
import {periodEffort} from './review';
import {estimateProgressFrom} from './item-state';
import {localDate,type JournalState,type Session,type Estimate,type Task} from './types';

/** Build once per state/date range; list rendering never rescans all history per item. */
export function effortReviewIndex(state:JournalState,start:string,end:string,endedOnly=false){
 const history=endedOnly?state.sessions.filter(s=>s.status==='ended'):state.sessions;
 const tree=outlineIndex(endedOnly?{...state,sessions:history}:state),sessions=new Map<string,Session[]>(),summaries=new Map<string,string>(),estimates=new Map<string,Estimate>(),summaryRanks=new Map<string,number>(),periodSummaryRanks=new Map<string,number>(),periodSummaries=new Map<string,string>(),sessionRanks=new Map(state.sessions.map((s,i)=>[s.id,i]));
 for(const session of history){if(session.taskId===null)continue;const list=sessions.get(session.taskId)??[];list.push(session);sessions.set(session.taskId,list);if(session.summary){summaries.set(session.taskId,session.summary);summaryRanks.set(session.taskId,sessionRanks.get(session.id)!);if(periodEffort([session],start,end).cumulativeMs>0){periodSummaries.set(session.taskId,session.summary);periodSummaryRanks.set(session.taskId,sessionRanks.get(session.id)!);}}}
 for(const estimate of state.estimates)estimates.set(estimate.taskId,estimate);
 const spent=new Map<string,number>();
 for(const [id,list] of sessions)spent.set(id,periodEffort(list,start,end).cumulativeMs);
 const reviews=new Map(state.reviews.map(review=>[review.taskId,review]));
 const progress=new Map(state.tasks.map(task=>[task.id,estimateProgressFrom(task,tree.stats.get(task.id)?.ownMs??0,estimates.get(task.id))]));
 const paths=new Map<string,string>(),fullPaths=new Map<string,string>(),projectPaths=new Map<string,string>();
 for(const node of tree.ordered){const parentPath=node.parentId?fullPaths.get(node.parentId)??'':'',projectPath=node.parentId?projectPaths.get(node.parentId)??'':'';fullPaths.set(node.id,[parentPath,node.title].filter(Boolean).join(' / '));paths.set(node.id,projectPath||'最外层');projectPaths.set(node.id,node.kind==='project'?[projectPath,node.title].filter(Boolean).join(' / '):projectPath);}
 const reviewOutcomes=new Map(state.reviews.filter(r=>localDate(r.updatedAt)>=start&&localDate(r.updatedAt)<=end&&r.outcome).map(r=>[r.taskId,r.outcome]));
 const projectLatest=new Map([...periodSummaries,...reviewOutcomes]);
 return {tree,spent,progress,paths,fullPaths,reviews,summaries,estimates,summaryRanks,periodSummaryRanks,periodSummaries,sessionRanks,reviewOutcomes,projectLatest};
}
export type EffortReviewIndex=ReturnType<typeof effortReviewIndex>;
/** Add current active records to a history-only index, never to a prior live overlay. */
export function overlayEffortReview(history:EffortReviewIndex,active:Session[],start:string,end:string):EffortReviewIndex{
 if(!active.length)return history;
 const spent=new Map(history.spent),progress=new Map(history.progress),summaries=new Map(history.summaries),periodSummaries=new Map(history.periodSummaries),own=new Map<string,number>(),summaryRanks=new Map(history.summaryRanks),periodSummaryRanks=new Map(history.periodSummaryRanks);
 for(const session of active){if(session.taskId===null)continue;const id=session.taskId,ms=periodEffort([session],start,end).cumulativeMs;spent.set(id,(spent.get(id)??0)+ms);own.set(id,(own.get(id)??0)+session.durationMs);
  const rank=history.sessionRanks.get(session.id)??Number.MAX_SAFE_INTEGER;
  if(session.summary&&rank>=(summaryRanks.get(id)??-1)){summaries.set(id,session.summary);summaryRanks.set(id,rank);}
  if(ms>0&&session.summary&&rank>=(periodSummaryRanks.get(id)??-1)){periodSummaries.set(id,session.summary);periodSummaryRanks.set(id,rank);}
 }
 for(const [id,ms] of own){const task=history.tree.nodes.get(id)?.record as Task|undefined;if(task)progress.set(id,estimateProgressFrom(task,(history.tree.stats.get(id)?.ownMs??0)+ms,history.estimates.get(id)));}
 return {...history,spent,progress,summaries,periodSummaries,summaryRanks,periodSummaryRanks,projectLatest:new Map([...periodSummaries,...history.reviewOutcomes])};
}
