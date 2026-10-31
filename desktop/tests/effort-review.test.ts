import {test} from 'node:test';
import assert from 'node:assert/strict';
import {emptyState,type Task,type Session} from '../core/types';
import {effortReviewIndex,overlayEffortReview} from '../core/effort-review';
import {estimateProgress} from '../core/item-state';
import {periodEffort,periodEffortIndex,mergeEffortPeriods} from '../core/review';
import {dayProgress,mergeDayProgress} from '../core/today';
import {projectReview} from '../core/project-review';

function timed(id:string,taskId:string|null,start:string,end:string,status:Session['status']='ended',summary=''):Session{const durationMs=Date.parse(end)-Date.parse(start);return {id,taskId,date:start.slice(0,10),start,end:status==='ended'?end:null,status,durationMs,targetMinutes:25,segments:[{start,end,durationMs}],manual:false,summary,reminded:false,recovered:false,updatedAt:end};}

test('indexed review matches direct per-item effort and estimates across midnight, parallel work and undated effort',()=>{
 const state=emptyState(),at='2026-10-20T23:30:00+08:00';
 const base={parentId:null,projectId:null,order:0,title:'',outcome:'',nextAction:'',estimateMinutes:60,plannedDate:null,dueAt:null,status:'open',createdAt:at,startedAt:null,completedAt:null} as Task;
 state.tasks=[{...base,id:'a',title:'A',isProject:true},{...base,id:'b',title:'B',parentId:'a'}];
 const session={date:'2026-10-20',start:at,end:'2026-10-21T00:30:00+08:00',status:'ended',targetMinutes:25,durationMs:3600000,manual:false,summary:'推进',reminded:false,recovered:false,segments:[{start:at,end:'2026-10-21T00:30:00+08:00',durationMs:3600000}]} as Session;
 state.sessions=[{...session,id:'s1',taskId:'a'},{...session,id:'s2',taskId:'b'},{...session,id:'s3',taskId:'b',start:null,end:null,segments:[],durationMs:600000,manual:true,summary:'最近推进'}];
 state.estimates=[{id:'e',taskId:'b',remainingMinutes:20,spentMinutes:60,reason:'剩余',createdAt:at}];
 state.reviews=[{taskId:'b',id:'r',outcome:'阶段成果',reason:'',adjustment:'',updatedAt:at}];
 const model=effortReviewIndex(state,'2026-10-20','2026-10-20');
 for(const task of state.tasks){assert.equal(model.spent.get(task.id),periodEffort(state.sessions.filter(s=>s.taskId===task.id),'2026-10-20','2026-10-20').cumulativeMs);assert.deepEqual(model.progress.get(task.id),estimateProgress(state,task.id));}
 assert.equal(model.paths.get('b'),'A');assert.equal(model.summaries.get('b'),'最近推进');assert.equal(model.reviews.get('b')?.outcome,'阶段成果');
 assert.equal(model.spent.get('b'),2400000);
});

test('cached historical interval unions plus active effort preserve cumulative, unplaced and overlap coverage',()=>{
 const history=[timed('a','a','2026-10-20T23:30:00+08:00','2026-10-21T00:30:00+08:00'),timed('b','b','2026-10-21T09:00:00+08:00','2026-10-21T10:00:00+08:00')];
 history.push({...history[1],id:'unknown',segments:[],durationMs:600000});
 history.push({...history[1],id:'legacy',durationMs:300000,segments:[{start:history[1].start!,end:history[1].start!,durationMs:300000}]});
 const active=[timed('live','b','2026-10-21T09:30:00+08:00','2026-10-21T10:30:00+08:00','running'),timed('paused',null,'2026-10-21T10:30:00+08:00','2026-10-21T10:45:00+08:00','paused')];
 const before=JSON.stringify(history),cached=periodEffortIndex(history,'2026-10-21','2026-10-21'),frozen=JSON.stringify(cached);
 for(let i=0;i<2;i++){const {intervals,...actual}=mergeEffortPeriods([cached,periodEffortIndex(active,'2026-10-21','2026-10-21')]);assert.deepEqual(actual,periodEffort([...history,...active],'2026-10-21','2026-10-21'));assert.equal(actual.coveredMs,135*60000);}
 assert.equal(JSON.stringify(cached),frozen);assert.equal(JSON.stringify(history),before);
});

test('live review overlay equals a full rebuild, keeps summary order and never adds effort twice',()=>{
 const state=emptyState(),base=state.tasks[0];state.projects=[];state.tasks=[{...base,id:'p',title:'Parent',parentId:null,isProject:true},{...base,id:'child',title:'Child',parentId:'p',estimateMinutes:120},{...base,id:'nested',title:'Nested',isProject:true,parentId:'p'},{...base,id:'leaf',title:'Leaf',parentId:'nested'},{...base,id:'done',title:'Done',parentId:'nested',status:'done',completedAt:'2026-10-21T04:00:00.000Z'}];
 const live=timed('live','child','2026-10-21T09:30:00+08:00','2026-10-21T10:30:00+08:00','running','旧的并行进展');
 state.sessions=[live,timed('ended','child','2026-10-21T09:00:00+08:00','2026-10-21T09:30:00+08:00','ended','后写的进展'),timed('other','leaf','2026-10-20T23:30:00+08:00','2026-10-21T00:30:00+08:00'),timed('unknown',null,'2026-10-21T09:00:00+08:00','2026-10-21T10:00:00+08:00','running')];
 state.reviews=[{id:'r',taskId:'leaf',outcome:'明确成果',reason:'',adjustment:'',updatedAt:'2026-10-21T04:00:00.000Z'}];
 const start='2026-10-21',end=start,history=effortReviewIndex(state,start,end,true),active=state.sessions.filter(s=>s.status!=='ended'),before=JSON.stringify([...history.spent]);
 for(let i=0;i<2;i++){const overlaid=overlayEffortReview(history,active,start,end),direct=effortReviewIndex(state,start,end);for(const key of ['spent','progress','summaries','paths','fullPaths','projectLatest'] as const)assert.deepEqual(overlaid[key],direct[key],key);assert.deepEqual(projectReview(state,start,end,undefined,overlaid),projectReview(state,start,end));const allowed=new Set(['child']);assert.deepEqual(projectReview(state,start,end,allowed,overlaid),projectReview(state,start,end,allowed));}
 assert.equal(JSON.stringify([...history.spent]),before);assert.equal(history.spent.get('child'),30*60000);
 assert.equal(overlayEffortReview(history,active,start,end).summaries.get('child'),'后写的进展');
});

test('daily overlay preserves latest summaries, completion without effort and unassigned parallel work',()=>{
 const state=emptyState(),base=state.tasks[0];state.tasks=[{...base,id:'a',title:'A'},{...base,id:'done',title:'Done',status:'done',completedAt:'2026-10-21T04:00:00.000Z'}];
 state.sessions=[timed('past','a','2026-10-21T09:00:00+08:00','2026-10-21T09:30:00+08:00','ended','已确认进展'),timed('live','a','2026-10-21T09:30:00+08:00','2026-10-21T10:30:00+08:00','running','新进展'),timed('free',null,'2026-10-21T10:00:00+08:00','2026-10-21T10:30:00+08:00','paused')];
 state.reviews=[{id:'r',taskId:'done',outcome:'没有计时也完成',reason:'',adjustment:'',updatedAt:'2026-10-21T04:00:00.000Z'}];
 const date='2026-10-21',ranks=new Map(state.sessions.map((s,i)=>[s.id,i])),history=dayProgress({...state,sessions:state.sessions.filter(s=>s.status==='ended')},date,ranks),active=dayProgress({...state,tasks:state.tasks.filter(t=>t.id==='a'),sessions:state.sessions.filter(s=>s.status!=='ended')},date,ranks),before=JSON.stringify(history);
 assert.deepEqual(mergeDayProgress(history,active),dayProgress(state,date));assert.deepEqual(mergeDayProgress(history,active),dayProgress(state,date));assert.equal(JSON.stringify(history),before);
});

test('daily history overlays preserve equal timestamps and equal-duration row order using original record ranks',()=>{
 const state=emptyState(),base=state.tasks[0];state.tasks=[{...base,id:'a',title:'A'},{...base,id:'b',title:'B'},{...base,id:'c',title:'C'}];
 const at='2026-10-21T10:00:00+08:00';
 const active=timed('early-active','a',at,'2026-10-21T10:30:00+08:00','paused','同时写入的早期记录');active.updatedAt='2026-10-21T03:00:00.000Z';
 const historical=timed('later-history','a','2026-10-21T09:30:00+08:00',at,'ended','同时写入的后期记录');historical.updatedAt=active.updatedAt;
 state.sessions=[active,timed('active-first','b',at,'2026-10-21T10:30:00+08:00','paused'),historical,timed('history-later','c',at,'2026-10-21T10:30:00+08:00')];
 const ranks=new Map(state.sessions.map((s,i)=>[s.id,i])),date='2026-10-21',history=dayProgress({...state,sessions:state.sessions.filter(s=>s.status==='ended')},date,ranks),live=dayProgress({...state,sessions:state.sessions.filter(s=>s.status!=='ended')},date,ranks);
 assert.deepEqual(mergeDayProgress(history,live),dayProgress(state,date));assert.equal(mergeDayProgress(history,live)[0].summary,historical.summary);assert.equal(mergeDayProgress(history,live)[0].lastSession?.id,historical.id);
 assert.deepEqual(mergeDayProgress(history,live).slice(1).map(r=>r.task?.id),['b','c']);
});
