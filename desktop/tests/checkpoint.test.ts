import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {JournalService} from '../core/service';
import {SqliteJournalStore} from '../core/store';
import {emptyState,type JournalState} from '../core/types';

class Clock {time=Date.parse('2026-10-22T09:00:00+08:00');mono=0;now(){return this.time;}monotonic(){return this.mono;}advance(ms:number){this.time+=ms;this.mono+=ms;}}
class SlowStore {
 path='isolated checkpoint test';state=emptyState();delay=0;fail=false;
 constructor(private clock:Clock){}
 load(){return structuredClone(this.state);}
 save(state:JournalState){this.clock.advance(this.delay);if(this.fail)throw Error('disk full');this.state=structuredClone(state);}
 close(){}
}
function setup(){const clock=new Clock(),store=new SlowStore(clock),service=new JournalService(store,clock);return {clock,store,service};}
function start(service:JournalService){return service.execute({type:'focus.start-unassigned'}).state.sessions.at(-1)!.id;}
const durations=(s:JournalService)=>s.clockSnapshot().sessions.map(s=>s.durationMs);

test('slow successful checkpoints keep work elapsed while saving and do not invalidate content revisions',()=>{
 const {clock,store,service}=setup();start(service);start(service);const paused=start(service);service.execute({type:'focus.pause',payload:{sessionId:paused}});
 const revision=service.snapshot().revision;store.delay=500;clock.advance(10000);assert.deepEqual(service.tick(),[]);
 assert.deepEqual(store.state.sessions.map(s=>s.durationMs),[10000,10000,0]);assert.deepEqual(durations(service),[10500,10500,0]);assert.equal(service.snapshot().revision,revision);
 clock.advance(10000);service.tick();assert.deepEqual(durations(service),[21000,21000,0]);assert.deepEqual(store.state.sessions.map(s=>s.durationMs),[20500,20500,0]);
 const recovered=new JournalService(store,clock);assert.ok(recovered.clockSnapshot().sessions.every(s=>s.status==='paused'));assert.deepEqual(durations(recovered),[20500,20500,0]);
});

test('failed delayed checkpoints leave durable state and revision intact; retries count elapsed time once',()=>{
 const {clock,store,service}=setup();start(service);const before=structuredClone(store.state),revision=service.snapshot().revision;
 clock.advance(10000);store.delay=500;store.fail=true;assert.throws(()=>service.tick(),/disk full/);assert.deepEqual(store.state,before);assert.equal(service.snapshot().revision,revision);assert.deepEqual(durations(service),[10500]);
 clock.advance(1000);store.fail=false;service.tick();assert.equal(store.state.sessions[0].durationMs,11500);assert.deepEqual(durations(service),[12000]);
});

test('start, pause, resume and stopping one of multiple timers use the command instant, not save completion',()=>{
 const {clock,store,service}=setup();store.delay=500;const first=start(service);assert.deepEqual(durations(service),[500]);
 const second=start(service);assert.deepEqual(durations(service),[1000,500]);
 clock.advance(1000);service.execute({type:'focus.pause',payload:{sessionId:first}});assert.deepEqual(durations(service),[2000,2000]);
 service.execute({type:'focus.resume',payload:{sessionId:first}});assert.deepEqual(durations(service),[2500,2500]);
 service.execute({type:'focus.stop',payload:{sessionId:first}});const state=service.snapshot().state;
 assert.equal(state.sessions.find(s=>s.id===first)!.durationMs,2500);assert.equal(state.sessions.find(s=>s.id===second)!.durationMs,3000);
 const stopped=state.sessions.find(s=>s.id===first)!;assert.equal(stopped.durationMs,stopped.segments.reduce((sum,s)=>sum+s.durationMs,0));
});

test('failed domain saves preserve active timing and atomic task content',()=>{
 const {clock,store,service}=setup();start(service);clock.advance(1000);store.delay=500;store.fail=true;const revision=service.snapshot().revision;
 assert.throws(()=>service.execute({type:'task.save',payload:{title:'不得部分保存'}}),/disk full/);
 assert.deepEqual(durations(service),[1500]);assert.equal(service.snapshot().revision,revision);assert.equal(service.snapshot().state.tasks.some(t=>t.title==='不得部分保存'),false);
});

test('timer targets still change revision and deliver exactly one alert after lightweight checkpoints',()=>{
 const {clock,service}=setup();start(service);const revision=service.snapshot().revision!;clock.advance(10000);service.tick();assert.equal(service.snapshot().revision,revision);
 clock.advance(25*60000-10000);assert.equal(service.tick().length,1);assert.equal(service.snapshot().revision,revision+1);assert.equal(service.clockSnapshot().sessions[0].reminder!.state,'pending');
 clock.advance(10000);assert.deepEqual(service.tick(),[]);assert.equal(service.snapshot().revision,revision+1);
});

test('SQLite checkpoints change only existing running records and recover paused at their durable time',()=>{
 const folder=mkdtempSync(path.join(tmpdir(),'journal-checkpoint-'));try{
  const file=path.join(folder,'journal.sqlite'),clock=new Clock(),store=new SqliteJournalStore(file),service=new JournalService(store,clock);
  const id=service.execute({type:'task.save',payload:{title:'保留事项',estimateMinutes:25}}).state.tasks.at(-1)!.id;
  service.execute({type:'session.manual',payload:{taskId:id,date:'2026-10-21',minutes:20,summary:'保留历史'}});start(service);const paused=start(service);service.execute({type:'focus.pause',payload:{sessionId:paused}});
  const before=store.load(),revision=service.snapshot().revision;clock.advance(12000);service.tick();const after=store.load();
  assert.deepEqual({...after,sessions:before.sessions},before);assert.deepEqual(after.sessions[0],before.sessions[0]);assert.deepEqual(after.sessions[2],before.sessions[2]);assert.equal(after.sessions[1].durationMs,12000);assert.equal(service.snapshot().revision,revision);
  assert.throws(()=>store.saveSessionCheckpoint([{...after.sessions[1],id:'unknown'}]),/尚未保存/);assert.deepEqual(store.load(),after);store.close();
  const recovered=new JournalService(new SqliteJournalStore(file),clock);assert.equal(recovered.snapshot().state.sessions[1].durationMs,12000);assert.ok(recovered.clockSnapshot().sessions.every(s=>s.status==='paused'));recovered.shutdown();
 }finally{rmSync(folder,{recursive:true,force:true});}
});

test('SQLite multi-timer checkpoint rolls back all rows on failure and keeps its write cache retryable',()=>{
 const folder=mkdtempSync(path.join(tmpdir(),'journal-checkpoint-atomic-'));try{
  const file=path.join(folder,'journal.sqlite'),clock=new Clock(),store=new SqliteJournalStore(file),service=new JournalService(store,clock);start(service);const second=start(service),before=store.load();
  const db=new DatabaseSync(file);db.exec(`CREATE TRIGGER block_checkpoint BEFORE UPDATE ON records WHEN NEW.kind='sessions' AND NEW.id='${second}' BEGIN SELECT RAISE(ABORT,'checkpoint failed'); END;`);
  const revision=service.snapshot().revision;clock.advance(10000);assert.throws(()=>service.tick(),/checkpoint failed/);
  // Inspect SQLite directly so load() cannot repair an incorrectly published write cache.
  const records=db.prepare("SELECT id,data FROM records WHERE kind='sessions'").all() as {id:string;data:string}[];
  for(const record of records)assert.deepEqual(JSON.parse(record.data),before.sessions.find(s=>s.id===record.id));assert.equal(service.snapshot().revision,revision);
  db.exec('DROP TRIGGER block_checkpoint');clock.advance(1000);service.tick();assert.deepEqual(store.load().sessions.map(s=>s.durationMs),[11000,11000]);
  db.close();service.shutdown();
 }finally{rmSync(folder,{recursive:true,force:true});}
});

test('SQLite checkpoints survive a failed full save, a retried edit and later recovery without cache rollback',()=>{
 const folder=mkdtempSync(path.join(tmpdir(),'journal-checkpoint-continuity-'));try{
  const file=path.join(folder,'journal.sqlite'),clock=new Clock(),store=new SqliteJournalStore(file),service=new JournalService(store,clock);
  const id=service.execute({type:'task.save',payload:{title:'原始内容'}}).state.tasks.at(-1)!.id;start(service);start(service);
  clock.advance(10000);service.tick();const revision=service.snapshot().revision;
  const db=new DatabaseSync(file),durable=()=>db.prepare("SELECT data FROM records WHERE kind='sessions' ORDER BY id").all().map(row=>(JSON.parse(String(row.data)) as {durationMs:number}).durationMs);
  db.exec(`CREATE TRIGGER block_edit BEFORE UPDATE ON records WHEN NEW.kind='tasks' AND NEW.id='${id}' BEGIN SELECT RAISE(ABORT,'edit failed'); END;`);
  clock.advance(2500);assert.throws(()=>service.execute({type:'outline.patch',payload:{id,field:'title',value:'更新内容'}}),/edit failed/);
  assert.deepEqual(durable(),[10000,10000]);assert.equal(service.snapshot().revision,revision);assert.equal(service.snapshot().state.tasks.find(t=>t.id===id)!.title,'原始内容');assert.deepEqual(durations(service),[12500,12500]);
  db.exec('DROP TRIGGER block_edit');clock.advance(500);service.execute({type:'outline.patch',payload:{id,field:'title',value:'更新内容'}});
  assert.deepEqual(durable(),[13000,13000]);assert.equal(service.snapshot().revision,revision!+1);
  clock.advance(10000);service.tick();assert.deepEqual(durable(),[23000,23000]);assert.equal(service.snapshot().revision,revision!+1);db.close();store.close();
  const recovered=new JournalService(new SqliteJournalStore(file),clock);assert.deepEqual(durations(recovered),[23000,23000]);assert.ok(recovered.clockSnapshot().sessions.every(s=>s.status==='paused'));assert.equal(recovered.snapshot().state.tasks.find(t=>t.id===id)!.title,'更新内容');recovered.shutdown();
 }finally{rmSync(folder,{recursive:true,force:true});}
});
