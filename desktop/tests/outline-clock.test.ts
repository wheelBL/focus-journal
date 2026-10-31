import {test} from 'node:test';
import assert from 'node:assert/strict';
import {activeEffortBaseline,activeEffortDeltas,overlayOutlineEffort} from '../core/outline-clock';
import {outlineIndex} from '../core/outline';
import {emptyState,type Session,type Task} from '../core/types';

const task=(id:string,parentId:string|null=null):Task=>({...emptyState().tasks[0],id,title:id,parentId,isProject:false,projectId:null});
const session=(id:string,taskId:string|null,durationMs:number,status:Session['status']='running'):Session=>({id,taskId,durationMs,status,date:'2026-10-22',start:'2026-10-22T01:00:00.000Z',end:null,segments:[],targetMinutes:25,manual:false,summary:'',reminded:false,recovered:false,updatedAt:'2026-10-22T01:00:00.000Z'});

test('outline clock overlays own and descendant effort exactly once and shares immutable topology/history',()=>{
 const state=emptyState();state.tasks=[task('root'),task('child','root'),task('leaf','child'),task('other')];
 state.sessions=[session('parent','root',1000),session('child','child',2000),session('leaf','leaf',5000,'paused'),session('history','leaf',10000,'ended'),session('unowned',null,8000)];
 const index=outlineIndex(state),baseline=activeEffortBaseline(state.sessions),live=state.sessions.filter(s=>s.status!=='ended').map(s=>({...s,durationMs:s.durationMs+(s.status==='running'?3000:0)}));
 const result=overlayOutlineEffort(index,activeEffortDeltas(baseline,live));
 const expected=outlineIndex({...state,sessions:state.sessions.map(s=>live.find(now=>now.id===s.id)??s)});
 assert.deepEqual(result.stats,expected.stats);assert.equal(result.stats.get('root')!.ownMs,4000);assert.equal(result.stats.get('root')!.totalMs,24000);
 assert.equal(result.nodes,index.nodes);assert.equal(result.children,index.children);assert.equal(result.ordered,index.ordered);assert.equal(result.stats.get('other'),index.stats.get('other'));assert.equal(result.stats.get('leaf'),index.stats.get('leaf'));assert.equal(index.stats.get('root')!.ownMs,1000);
 const later=live.map(s=>({...s,durationMs:s.durationMs+(s.status==='running'?2000:0)}));
 assert.equal(overlayOutlineEffort(index,activeEffortDeltas(baseline,later)).stats.get('root')!.ownMs,6000,'each overlay subtracts the original snapshot, never the previous overlay');
});

test('outline clock needs no historical session reads and ignores foreign or reassigned session snapshots',()=>{
 const state=emptyState();state.tasks=[task('root'),task('child','root')];state.sessions=[session('active','child',2000),session('old','child',10000,'ended')];
 const index=outlineIndex(state),baseline=activeEffortBaseline(state.sessions);
 Object.defineProperty(state.sessions[1],'durationMs',{get(){throw Error('historical effort was scanned');}});
 const same=activeEffortDeltas(baseline,[session('active','child',2000),session('unknown','child',10000),session('active','root',10000)]);
 assert.equal(overlayOutlineEffort(index,same),index);
 const result=overlayOutlineEffort(index,activeEffortDeltas(baseline,[session('active','child',4000)]));assert.equal(result.stats.get('root')!.totalMs,14000);
});
