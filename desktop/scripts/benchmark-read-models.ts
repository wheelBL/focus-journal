import {performance} from 'node:perf_hooks';
import {emptyState,sessionMsOnDate,shiftDate} from '../core/types';
import {outlineIndex,outlinePath} from '../core/outline';
import {searchIndex,searchMatches} from '../src/search-model';
import {calendarSessionDays} from '../src/calendar-layout';
import {dayProgress,mergeDayProgress} from '../core/today';
import {periodEffort,periodEffortIndex,mergeEffortPeriods} from '../core/review';
import {effortReviewIndex,overlayEffortReview} from '../core/effort-review';
import {projectReview} from '../core/project-review';
import {branchIds} from '../core/outline';
import {isTask} from '../core/item-kind';
import {localDate,type JournalState,type Task} from '../core/types';

// Synthetic, in-memory algorithms only. This does not measure renderer paint or Windows startup.
const state=emptyState(),stamp='2026-10-22T01:00:00.000Z';state.projects=[];
state.tasks=Array.from({length:1500},(_,i)=>({...emptyState().tasks[0],id:`t${i}`,title:`Task ${i}`,description:'Work item',parentId:i%10?`t${i-i%10}`:null,projectId:i%10?`t${i-i%10}`:`t${i}`,order:i,isProject:i%10===0,createdAt:stamp}));
state.sessions=Array.from({length:6000},(_,i)=>{const start=new Date(Date.UTC(2026,0,1+i%300,1)).toISOString(),end=new Date(Date.parse(start)+1800000).toISOString();return {id:`s${i}`,taskId:`t${i%1500}`,date:start.slice(0,10),status:'ended' as const,start,end,durationMs:1800000,targetMinutes:25,segments:[{start,end,durationMs:1800000}],manual:false,summary:'',reminded:false,recovered:false,updatedAt:end};});
const dates=Array.from({length:42},(_,i)=>shiftDate('2026-09-28',i));
function measure(name:string,fn:()=>number){const samples:number[]=[];let result=0;for(let i=0;i<4;i++){const start=performance.now();result=fn();if(i)samples.push(performance.now()-start);}return {name,medianMs:+samples.sort((a,b)=>a-b)[1].toFixed(2),result};}
const oldSearch=()=>state.tasks.filter(task=>`${task.title} ${task.description} ${outlinePath(outlineIndex(state),task.id).filter(n=>n.kind==='project'&&n.id!==task.id).map(n=>n.title).join(' / ')}`.toLocaleLowerCase().includes('task')).length;
const newSearch=()=>searchMatches(searchIndex(state),'task').items.length;
const oldMonth=()=>dates.reduce((total,date)=>total+state.sessions.reduce((sum,session)=>sum+sessionMsOnDate(session,date),0),0);
const newMonth=()=>[...calendarSessionDays(state.sessions,dates,false).values()].reduce((sum,day)=>sum+day.totalMs,0);
if(!process.argv.includes('--workflows-only')){
const result={scope:'Synthetic pure algorithms; 1 warm-up, median of 3 runs; not end-to-end UI timing',tasks:state.tasks.length,sessions:state.sessions.length,results:[measure('search baseline: full outline per candidate',oldSearch),measure('search shared index including build',newSearch),measure('month baseline: 42 full scans',oldMonth),measure('month shared date range',newMonth)]};
if(result.results[0].result!==result.results[1].result||result.results[2].result!==result.results[3].result)throw Error('Benchmark outputs differ');
console.log(JSON.stringify(result,null,2));
}

// Previous project aggregation kept here only as a reproducible benchmark baseline.
function legacyProjects(state:JournalState,start:string,end:string){
 const index=outlineIndex(state),spent=new Map<string,number>(),latest=new Map<string,string>();
 for(const session of state.sessions){if(session.taskId===null)continue;const ms=periodEffort([session],start,end).cumulativeMs;spent.set(session.taskId,(spent.get(session.taskId)??0)+ms);if(ms>0&&session.summary)latest.set(session.taskId,session.summary);}
 for(const review of state.reviews)if(localDate(review.updatedAt)>=start&&localDate(review.updatedAt)<=end&&review.outcome)latest.set(review.taskId,review.outcome);
 return index.ordered.filter(n=>(n.record as Task).isProject).map(project=>{const ids=branchIds(index,project.id),items=state.tasks.filter(t=>isTask(t)&&ids.has(t.id)),completed=items.filter(t=>t.completedAt&&localDate(t.completedAt)>=start&&localDate(t.completedAt)<=end&&t.status==='done'),ongoing=items.filter(t=>t.status==='open'&&(spent.get(t.id)??0)>0).sort((a,b)=>(spent.get(b.id)??0)-(spent.get(a.id)??0));return {id:project.id,ms:items.reduce((n,t)=>n+(spent.get(t.id)??0),0),count:completed.length+ongoing.length+items.filter(t=>t.status==='open'&&!t.deletedAt&&!(spent.get(t.id)??0)).length};});
}
function workflowFixture(count:number){
 const sample=structuredClone(state);sample.tasks=Array.from({length:count},(_,i)=>({...state.tasks[i%state.tasks.length],id:`t${i}`,parentId:i%10?`t${i-i%10}`:null,projectId:`t${i-i%10}`,order:i,isProject:i%10===0}));
 sample.sessions=Array.from({length:count*4},(_,i)=>({...state.sessions[i%state.sessions.length],id:`s${i}`,taskId:`t${i%count}`}));
 const start='2026-10-22T01:00:00.000Z',end='2026-10-22T01:10:00.000Z';sample.sessions.push({id:'active',taskId:'t1',date:'2026-10-22',status:'running',start,end:null,durationMs:600000,targetMinutes:25,segments:[{start,end,durationMs:600000}],manual:false,summary:'Current progress',reminded:false,recovered:false,updatedAt:end});
 return sample;
}
for(const count of [1500,10000]){
 const sample=workflowFixture(count),day='2026-10-22',start='2026-10-01',ended=sample.sessions.filter(s=>s.status==='ended'),active=sample.sessions.filter(s=>s.status!=='ended'),historyState={...sample,sessions:ended},activeState={...sample,tasks:sample.tasks.filter(t=>active.some(s=>s.taskId===t.id)),sessions:active};
 const ranks=new Map(sample.sessions.map((s,i)=>[s.id,i])),dayHistory=dayProgress(historyState,day,ranks),periodHistory=periodEffortIndex(ended,day,day),reviewHistory=effortReviewIndex(sample,start,day,true);
 const oldDay=()=>dayProgress(sample,day).reduce((n,r)=>n+r.minutesMs,0)+periodEffort(sample.sessions,day,day).coveredMs;
 const newDay=()=>mergeDayProgress(dayHistory,dayProgress(activeState,day,ranks)).reduce((n,r)=>n+r.minutesMs,0)+mergeEffortPeriods([periodHistory,periodEffortIndex(active,day,day)]).coveredMs;
 const oldReview=()=>{const model=effortReviewIndex(sample,start,day);return [...model.spent.values()].reduce((a,b)=>a+b,0)+legacyProjects(sample,start,day).reduce((n,p)=>n+p.ms+p.count,0);};
 const projected=(model:ReturnType<typeof effortReviewIndex>)=>[...model.spent.values()].reduce((a,b)=>a+b,0)+projectReview(sample,start,day,undefined,model).reduce((n,p)=>n+p.ms+p.details.length+p.unrecorded.length,0);
 const newReview=()=>projected(overlayEffortReview(reviewHistory,active,start,day));
 const rebuildReview=()=>projected(overlayEffortReview(effortReviewIndex(sample,start,day,true),active,start,day));
 const results=[measure('Today baseline full history on each tick',oldDay),measure('Today cached history plus active tick',newDay),measure('Review baseline full history and per-project scans on each tick',oldReview),measure('Review new static build and active overlay',rebuildReview),measure('Review cached history plus active tick',newReview)];
 if(results[0].result!==results[1].result||results[2].result!==results[3].result||results[2].result!==results[4].result)throw Error('Workflow benchmark outputs differ');
 console.log(JSON.stringify({scope:'Synthetic pure read models; 1 warm-up, median of 3; not renderer paint or launch',tasks:sample.tasks.length,sessions:sample.sessions.length,results},null,2));
}
