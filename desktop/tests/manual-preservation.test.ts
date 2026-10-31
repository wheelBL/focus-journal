import {test} from 'node:test';
import assert from 'node:assert/strict';
import {JournalService} from '../core/service';
import {emptyState,type JournalState} from '../core/types';
import {calendarEntries} from '../src/calendar-layout';

class Store{path='manual preservation tests';state=emptyState();fail=false;load(){return structuredClone(this.state);}save(state:JournalState){if(this.fail)throw Error('disk full');this.state=structuredClone(state);}close(){}}
function setup(){
 const store=new Store(),clock={time:Date.parse('2026-10-19T10:00:00'),mono:0,now(){return this.time;},monotonic(){return this.mono;},advance(ms:number){this.time+=ms;this.mono+=ms;}},service=new JournalService(store,clock);
 const add=(title:string)=>service.execute({type:'task.save',payload:{title,parentId:'inbox'}}).state.tasks.at(-1)!.id;
 const taskId=add('原归属'),otherId=add('新归属');service.execute({type:'focus.start',payload:{taskId,startedAt:'2026-10-19T09:50:00'}});clock.advance(5*60000);service.execute({type:'focus.pause',payload:{taskId}});clock.advance(10*60000);service.execute({type:'focus.resume',payload:{taskId}});clock.advance(5*60000);service.execute({type:'focus.stop',payload:{taskId}});
 const original=service.snapshot().state.sessions[0];return {store,clock,service,taskId,otherId,original,save:(extra:Record<string,unknown>={})=>service.execute({type:'session.manual',payload:{id:original.id,taskId,preserveTiming:true,reason:'补充成果',...extra}})};
}

test('metadata correction preserves exact timed evidence, paused gaps, provenance and reminder offsets',()=>{
 const h=setup();try{
  const result=h.save({summary:'成果已补充'}),record=result.state.sessions[0];
  assert.deepEqual({...record,summary:h.original.summary,updatedAt:h.original.updatedAt},h.original);
  assert.equal(record.summary,'成果已补充');assert.equal(record.manual,false);assert.equal(record.targetOffsetMs,h.original.targetOffsetMs);
  assert.deepEqual(calendarEntries(result.state,'2026-10-19',['effort']).map(entry=>[entry.top,entry.height]),calendarEntries({...result.state,sessions:[h.original]},'2026-10-19',['effort']).map(entry=>[entry.top,entry.height]));
  assert.deepEqual(JSON.parse(result.state.audit.at(-1)!.before),h.original);assert.equal(result.state.audit.at(-1)!.reason,'补充成果');
 }finally{h.service.shutdown();}
});

test('reassignment validates individual segments, allows work in a paused gap, and updates both owners',()=>{
 const h=setup();try{
  h.service.execute({type:'session.manual',payload:{taskId:h.otherId,date:'2026-10-19',minutes:4,start:'2026-10-19T10:06:00',end:'2026-10-19T10:10:00'}});
  const result=h.save({taskId:h.otherId}),record=result.state.sessions.find(record=>record.id===h.original.id)!;
  assert.deepEqual(record.segments,h.original.segments);assert.equal(record.taskId,h.otherId);
  assert.equal(result.state.tasks.find(task=>task.id===h.taskId)!.startedAt,null);assert.equal(result.state.tasks.find(task=>task.id===h.otherId)!.startedAt,h.original.start);
 }finally{h.service.shutdown();}
 const overlap=setup();try{
  overlap.service.execute({type:'session.manual',payload:{taskId:overlap.otherId,date:'2026-10-19',minutes:5,start:'2026-10-19T10:00:00',end:'2026-10-19T10:05:00'}});
  const before=overlap.service.exportJson();assert.throws(()=>overlap.save({taskId:overlap.otherId}),/重叠/);assert.equal(overlap.service.exportJson(),before);
 }finally{overlap.service.shutdown();}
});

test('preserving timing rejects mixed timing fields, missing reasons, new and active records atomically',()=>{
 const h=setup();try{
  const before=h.service.exportJson();for(const extra of [{minutes:20},{date:'2026-10-19'},{start:null},{end:h.original.end},{reason:''},{preserveTiming:'true'}]){assert.throws(()=>h.save(extra));assert.equal(h.service.exportJson(),before);}
  assert.throws(()=>h.service.execute({type:'session.manual',payload:{taskId:h.taskId,preserveTiming:true,reason:'不应创建'}}),/已有投入/);assert.equal(h.service.exportJson(),before);
  const running=h.service.execute({type:'focus.start',payload:{taskId:h.taskId}}).timer!.sessionId;
  assert.throws(()=>h.save({id:running}),/请先结束/);
 }finally{h.service.shutdown();}
});

test('failed preservation leaves original evidence and audit unchanged; explicit duration replacement remains supported',()=>{
 const h=setup();try{
  const before=h.service.exportJson();h.store.fail=true;assert.throws(()=>h.save({summary:'失败不改写'}),/disk full/);h.store.fail=false;assert.equal(h.service.exportJson(),before);
  const result=h.service.execute({type:'session.manual',payload:{id:h.original.id,taskId:h.taskId,date:'2026-10-19',minutes:18,summary:'明确改为总时长',reason:'扣除遗漏的休息'}}),record=result.state.sessions[0];
  assert.equal(record.durationMs,18*60000);assert.equal(record.start,null);assert.deepEqual(record.segments,[]);assert.equal(record.manual,true);assert.deepEqual(JSON.parse(result.state.audit.at(-1)!.before),h.original);
 }finally{h.service.shutdown();}
});

test('zero-second and unassigned ended records preserve timing when an explicit destination is chosen',()=>{
 const h=setup();try{
  const id=h.service.execute({type:'focus.start-unassigned'}).timers.at(-1)!.sessionId;h.service.execute({type:'focus.stop',payload:{sessionId:id}});const original=h.service.snapshot().state.sessions.find(record=>record.id===id)!;assert.equal(original.durationMs,0);assert.equal(original.taskId,null);
  const before=h.service.exportJson();assert.throws(()=>h.save({id,taskId:null}),/找不到/);assert.equal(h.service.exportJson(),before);
  const result=h.save({id,taskId:h.otherId,summary:'即时完成的记录'}).state.sessions.find(record=>record.id===id)!;assert.equal(result.durationMs,0);assert.deepEqual(result.segments,original.segments);assert.equal(result.start,original.start);assert.equal(result.taskId,h.otherId);assert.equal(result.manual,false);
 }finally{h.service.shutdown();}
});
