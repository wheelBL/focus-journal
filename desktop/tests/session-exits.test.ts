import {test} from 'node:test';
import assert from 'node:assert/strict';
import {JournalService,parseJournalBackup} from '../core/service';
import {emptyState,type JournalState} from '../core/types';
import {periodEffort} from '../core/review';
import {parseSyncDocument,syncDocument} from '../core/sync-data';

class Store{path='session exits test';state=emptyState();fail=false;load(){return structuredClone(this.state);}save(state:JournalState){if(this.fail)throw Error('disk full');this.state=structuredClone(state);}close(){}}
function setup(){
 const store=new Store(),clock={time:Date.parse('2026-10-22T10:00:00+08:00'),now(){return this.time;},monotonic(){return this.time;}};
 const service=new JournalService(store,clock),add=(title:string,parentId:string|null=null)=>service.execute({type:'task.save',payload:{title,parentId}}).state.tasks.at(-1)!.id;
 return {store,clock,service,add};
}

test('discard atomically preserves edited progress and all timing evidence across backup, sync and reload',()=>{
 const h=setup(),id=h.service.execute({type:'focus.start-unassigned'}).timer!.sessionId;
 h.clock.time+=60000;h.service.execute({type:'focus.pause',payload:{sessionId:id}});h.clock.time+=60000;h.service.execute({type:'focus.resume',payload:{sessionId:id}});h.clock.time+=120000;
 const record=h.service.execute({type:'focus.stop',payload:{sessionId:id,rest:true}}).state.sessions[0],before=h.service.exportJson();
 h.store.fail=true;assert.throws(()=>h.service.execute({type:'session.delete',payload:{id,summary:'新的进展'}}),/disk full/);assert.equal(h.service.exportJson(),before);h.store.fail=false;
 let s=h.service.execute({type:'session.delete',payload:{id,summary:'新的进展'}}).state;
 assert.equal(periodEffort(s.sessions,'2026-10-22','2026-10-22').cumulativeMs,0);assert.equal(s.deletedSessions[0].summary,'新的进展');assert.deepEqual(s.deletedSessions[0].segments,record.segments);assert.equal(s.settings.rest!.phase,'running');
 assert.deepEqual(parseJournalBackup(h.service.exportJson()).deletedSessions,s.deletedSessions);assert.deepEqual(parseSyncDocument(syncDocument(s)).state.deletedSessions,s.deletedSessions);
 h.service.shutdown();const reload=new JournalService(h.store,h.clock);s=reload.execute({type:'session.restore',payload:{id}}).state;
 assert.equal(s.sessions[0].id,id);assert.equal(s.sessions[0].taskId,null);assert.equal(s.sessions[0].summary,'新的进展');assert.deepEqual(s.sessions[0].segments,record.segments);assert.equal(periodEffort(s.sessions,'2026-10-22','2026-10-22').cumulativeMs,180000);assert.equal(reload.snapshot().timers.length,0);
});

test('invalid discard progress never removes a record or creates a partial audit',()=>{
 const h=setup(),id=h.service.execute({type:'focus.start-unassigned'}).timer!.sessionId;h.clock.time+=60000;h.service.execute({type:'focus.stop',payload:{sessionId:id}});
 const before=h.service.exportJson();assert.throws(()=>h.service.execute({type:'session.delete',payload:{id,summary:'a'.repeat(2001)}}),/超过/);assert.equal(h.service.exportJson(),before);
});

test('new manual or calendar effort rejects hidden branches while historical corrections remain possible',()=>{
 const h=setup(),parent=h.add('归档项目'),child=h.add('历史事项',parent),deletedParent=h.add('删除的项目'),deletedChild=h.add('隐藏事项',deletedParent);
 const record=h.service.execute({type:'session.manual',payload:{taskId:child,date:'2026-10-21',minutes:10}}).state.sessions[0];
 h.service.execute({type:'outline.patch',payload:{id:parent,field:'isProject',value:true}});h.service.execute({type:'task.status',payload:{id:child,status:'done'}});h.service.execute({type:'project.archive',payload:{id:parent}});
 h.service.execute({type:'item.change',payload:{id:deletedParent,action:'delete',confirmBranch:true}});
 const before=h.service.exportJson();
 for(const taskId of [child,deletedChild]){
  assert.throws(()=>h.service.execute({type:'session.manual',payload:{taskId,date:'2026-10-21',minutes:5}}),/恢复/);
  assert.throws(()=>h.service.execute({type:'calendar.save',payload:{mode:'effort',taskId,start:'2026-10-21T10:00',end:'2026-10-21T10:05'}}),/恢复/);
 }
 assert.equal(h.service.exportJson(),before);
 const state=h.service.execute({type:'session.manual',payload:{id:record.id,taskId:child,date:'2026-10-21',minutes:8,reason:'校正历史'}}).state;
 assert.equal(state.sessions[0].durationMs,480000);assert.equal(state.tasks.find(t=>t.id===child)!.status,'done');assert.equal(state.tasks.find(t=>t.id===parent)!.archived,true);
});

test('saving summary and starting rest is atomic, including estimates and storage failures',()=>{
 const h=setup(),taskId=h.add('已关联事项');h.service.execute({type:'focus.start',payload:{taskId}});h.clock.time+=60000;
 const id=h.service.execute({type:'focus.stop',payload:{taskId}}).state.sessions[0].id;
 const other=h.service.execute({type:'focus.start-unassigned'}).timer!.sessionId;const before=h.service.exportJson();
 const command={type:'session.summary',payload:{id,summary:'新的小结',remainingMinutes:10,rest:true}};
 assert.throws(()=>h.service.execute(command),/暂停或结束/);assert.equal(h.service.exportJson(),before);
 h.service.execute({type:'focus.pause',payload:{sessionId:other}});const paused=h.service.exportJson();h.store.fail=true;assert.throws(()=>h.service.execute(command),/disk full/);assert.equal(h.service.exportJson(),paused);h.store.fail=false;
 const state=h.service.execute(command).state;assert.equal(state.sessions.find(s=>s.id===id)!.summary,'新的小结');assert.equal(state.estimates.length,1);assert.equal(state.settings.rest!.phase,'running');assert.equal(h.service.snapshot().timers[0].paused,true);
});
