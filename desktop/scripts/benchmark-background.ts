import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
import {emptyState,type JournalState,type Session,type Task,type WorkClock} from '../core/types';
import {outlineIndex,outlinePath} from '../core/outline';
import {scheduledItems} from '../core/item-reminders';
import {JournalService} from '../core/service';
import {SqliteJournalStore} from '../core/store';

/** Isolated synthetic algorithms and in-memory SQLite only; no user's files or GUI. */
function fixture(count:number,deep=false){
 const state=emptyState(),base=state.tasks[0],at='2026-01-01T01:00:00.000Z';state.projects=[];
 state.tasks=Array.from({length:count},(_,i)=>({...base,id:`t${i}`,title:`Task ${i}`,parentId:i&&(deep||i%10)?`t${deep?i-1:i-i%10}`:null,projectId:`t${deep?0:i-i%10}`,isProject:deep?i===0:i%10===0,order:i,createdAt:at,reminder:deep||i%20===0?{at:'2027-01-01T01:00:00.000Z',state:'scheduled' as const,snoozedUntil:null}:null}));
 state.sessions=Array.from({length:count*4},(_,i)=>{const start=new Date(Date.UTC(2026,0,1+i%250,1)).toISOString(),end=new Date(Date.parse(start)+1800000).toISOString();return {id:`s${i}`,taskId:`t${i%count}`,date:start.slice(0,10),start,end,status:'ended' as const,durationMs:1800000,targetMinutes:25,segments:[{start,end,durationMs:1800000}],manual:false,summary:'Synthetic historical record',reminded:false,recovered:false,updatedAt:end};});
 return state;
}
function baselineScheduled(state:JournalState){const candidates=state.tasks.filter(t=>t.reminder&&t.reminder.state!=='dismissed');if(!candidates.length)return [];const index=outlineIndex(state);return candidates.filter(task=>task.status==='open'&&!outlinePath(index,task.id).some(n=>{const t=n.record as Task;return t.archived||t.deletedAt||t.status&&t.status!=='open';}));}
function measure(name:string,action:()=>number){const values:number[]=[];let result=0;for(let i=0;i<8;i++){const before=performance.now();result=action();if(i)values.push(performance.now()-before);}values.sort((a,b)=>a-b);return {name,medianMs:+values[3].toFixed(3),p86Ms:+values[5].toFixed(3),result};}
class Clock implements WorkClock{time=Date.parse('2026-10-22T01:00:00.000Z');mono=0;now(){return this.time;}monotonic(){return this.mono;}advance(ms:number){this.time+=ms;this.mono+=ms;}}
class MeasuredStore extends SqliteJournalStore{
 lastSaveMs=0;checkpoints=0;
 save(state:JournalState){const before=performance.now();super.save(state);this.lastSaveMs=performance.now()-before;}
 saveSessionCheckpoint(sessions:readonly Session[]){const before=performance.now();super.saveSessionCheckpoint(sessions);this.lastSaveMs=performance.now()-before;this.checkpoints++;}
}

const reminderResults=[1500,10000].map(count=>{
 const state=fixture(count);assert.deepEqual(scheduledItems(state).map(t=>t.id),baselineScheduled(state).map(t=>t.id));
 return {tasks:count,sessions:state.sessions.length,results:[measure('Previous complete outline eligibility',()=>baselineScheduled(state).length),measure('Topology-only eligibility',()=>scheduledItems(state).length)]};
});
const deep=fixture(2000,true);assert.deepEqual(scheduledItems(deep).map(t=>t.id),baselineScheduled(deep).map(t=>t.id));
const deepResult={depth:2000,reminders:2000,results:[measure('Previous repeated ancestor paths',()=>baselineScheduled(deep).length),measure('One iterative memoized topology pass',()=>scheduledItems(deep).length)]};
const serviceResults=[1500,10000].map(count=>{
 const state=fixture(count),store=new MeasuredStore(':memory:'),clock=new Clock();store.save(state);const service=new JournalService(store,clock);service.execute({type:'focus.start',payload:{taskId:'t1',targetMinutes:240}});
 const results=[measure('Full snapshot clone and timer projection',()=>service.snapshot().state.sessions.length),measure('Clock-only snapshot',()=>service.clockSnapshot().timers.length),measure('Steady background reads: tick, reminder x2, floating x2',()=>{clock.advance(1);service.tick();service.reminderSnapshot();service.floatingTimerSnapshot();service.reminderSnapshot();service.floatingTimerSnapshot();return service.clockSnapshot().revision;})];
 const snapshot=store.load();results.push(measure('Unchanged SQLite save including full JSON serialization',()=>{store.save(snapshot);return snapshot.sessions.length;}));
 const saveSamples:number[]=[],revisionBefore=service.clockSnapshot().revision;
 results.push(measure('Durable periodic checkpoint including persistence',()=>{clock.advance(10000);service.tick();saveSamples.push(store.lastSaveMs);return service.clockSnapshot().revision;}));
 const revisionAfter=service.clockSnapshot().revision;assert.equal(revisionAfter,revisionBefore);assert.equal(store.checkpoints,8);assert.equal(store.load().sessions.at(-1)!.durationMs,service.clockSnapshot().timers[0].durationMs);saveSamples.shift();saveSamples.sort((a,b)=>a-b);const medianCheckpointSaveMs=+saveSamples[3].toFixed(3);
 service.shutdown();return {tasks:count,sessions:state.sessions.length+1,scope:'In-memory SQLite; excludes actual disk/fsync latency. Clock is deterministic.',results,medianCheckpointSaveMs,checkpoints:store.checkpoints,revisionChanges:revisionAfter-revisionBefore};
});
console.log(JSON.stringify({scope:'Synthetic algorithms and isolated in-memory SQLite; 1 warm-up and median of 7 runs. Not renderer paint, app launch, personal data, or physical disk timing.',reminderResults,deepResult,serviceResults},null,2));
