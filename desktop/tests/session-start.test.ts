import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readdirSync} from 'node:fs';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {JournalService,parseJournalBackup} from '../core/service';
import {SqliteJournalStore} from '../core/store';
import {emptyState,taskMs,sessionMsOnDate,type JournalState} from '../core/types';
import {outlineIndex} from '../core/outline';
import {periodEffort} from '../core/review';
import {calendarEntries} from '../src/calendar-layout';
import {floatingReadout} from '../core/floating-timer';
import {parseSyncDocument,syncDocument} from '../core/sync-data';

process.env.TZ='Asia/Shanghai';
const minute=60000;
class Store{path='start time test';state=emptyState();fail=false;load(){return structuredClone(this.state);}save(s:JournalState){if(this.fail)throw Error('disk full');this.state=structuredClone(s);}close(){}}
class Clock{time=Date.parse('2026-10-22T10:00:00+08:00');mono=0;now(){return this.time;}monotonic(){return this.mono;}advance(ms:number){this.time+=ms;this.mono+=ms;}}
function setup(){const store=new Store(),clock=new Clock(),s=new JournalService(store,clock);return {store,clock,s};}
const add=(s:JournalService,title='当前工作',parentId:string|null='inbox')=>s.execute({type:'task.save',payload:{title,parentId}}).state.tasks.at(-1)!.id;
const at=(value:string)=>new Date(`2026-10-22T${value}+08:00`).toISOString();
const adjust=(s:JournalService,id:string,startedAt:string)=>s.execute({type:'focus.set-start',payload:{sessionId:id,startedAt}});
const readout=(s:JournalService,id:string)=>floatingReadout({...s.floatingTimerSnapshot(),selectedId:id,expanded:false});

test('backfill updates one record and all effort projections; the next 25 minutes begin now',()=>{
 const {s,clock}=setup(),parent=add(s,'项目',null),taskId=add(s,'正在推进',parent);
 s.execute({type:'task.plan',payload:{id:taskId,date:'2026-10-23',dueAt:'2026-10-25'}});
 const start=s.execute({type:'focus.start',payload:{taskId}}),id=start.timer!.sessionId,original=start.state.sessions[0];clock.advance(minute);
 const next=adjust(s,id,at('09:21:00')),record=next.state.sessions[0],task=next.state.tasks.find(t=>t.id===taskId)!;
 assert.equal(record.id,id);assert.equal(next.state.sessions.length,1);assert.equal(record.manual,false);assert.equal(record.status,'running');assert.equal(record.start,at('09:21:00'));assert.equal(record.durationMs,40*minute);assert.equal(record.targetOffsetMs,40*minute);
 assert.equal(task.startedAt,record.start);assert.equal(task.plannedDate,'2026-10-23');assert.equal(task.dueAt,'2026-10-25');assert.equal(task.estimateMinutes,null);assert.equal(task.status,'open');
 assert.equal(taskMs(next.state,taskId),40*minute);assert.equal(outlineIndex(next.state).stats.get(parent)!.totalMs,40*minute);assert.equal(periodEffort(next.state.sessions,'2026-10-22','2026-10-22').cumulativeMs,40*minute);
 assert.equal(calendarEntries(next.state,'2026-10-22',['effort']).length,1);assert.equal(JSON.parse(next.state.audit.at(-1)!.before).start,original.start);
 assert.deepEqual(next.timers,s.clockSnapshot().timers);assert.equal(readout(s,id).value,'25:00');assert.deepEqual(s.tick(),[]);
 clock.advance(25*minute-1000);assert.deepEqual(s.tick(),[]);assert.equal(readout(s,id).value,'00:01');clock.advance(1000);assert.equal(s.tick().length,1);
 assert.equal(s.reminderSnapshot().alerts[0].targetOffsetMs,40*minute);assert.equal(s.snapshot().timer!.durationMs,65*minute);assert.equal(s.snapshot().state.sessions[0].status,'running');
 clock.advance(minute);assert.equal(readout(s,id).value,'01:00');assert.equal(s.reminderSnapshot().alerts[0].durationMs,66*minute);
});

test('pauses never consume the fresh target and editing a paused timer preserves every later segment',()=>{
 const {s,clock}=setup(),id=s.execute({type:'focus.start-unassigned'}).timer!.sessionId;
 clock.advance(5*minute);s.execute({type:'focus.pause',payload:{sessionId:id}});clock.advance(10*minute);s.execute({type:'focus.resume',payload:{sessionId:id}});clock.advance(5*minute);s.execute({type:'focus.pause',payload:{sessionId:id}});
 const before=s.snapshot().state.sessions[0],next=adjust(s,id,at('09:20:00')),record=next.state.sessions[0];
 assert.equal(next.timer!.paused,true);assert.equal(record.durationMs,50*minute);assert.equal(record.segments[0].end,before.segments[0].end);assert.deepEqual(record.segments.slice(1),before.segments.slice(1));assert.equal(readout(s,id).value,'25:00');
 clock.advance(60*minute);assert.deepEqual(s.tick(),[]);assert.equal(s.snapshot().timer!.durationMs,50*minute);
 s.execute({type:'focus.resume',payload:{sessionId:id}});clock.advance(5*minute);s.execute({type:'focus.pause',payload:{sessionId:id}});clock.advance(30*minute);s.execute({type:'focus.resume',payload:{sessionId:id}});clock.advance(20*minute);
 assert.equal(s.tick().length,1);assert.equal(s.snapshot().timer!.durationMs,75*minute);assert.equal(s.snapshot().state.sessions[0].segments.length,4);
});

test('moving a start later removes only first-segment effort and recomputes the item actual start',()=>{
 const {s,clock}=setup(),taskId=add(s),id=s.execute({type:'focus.start',payload:{taskId}}).timer!.sessionId;clock.advance(10*minute);s.execute({type:'focus.pause',payload:{sessionId:id}});
 const next=adjust(s,id,at('10:05:00'));assert.equal(next.timer!.durationMs,5*minute);assert.equal(next.state.tasks.find(t=>t.id===taskId)!.startedAt,at('10:05:00'));assert.equal(next.timer!.targetOffsetMs,5*minute);assert.equal(next.timer!.paused,true);
});

test('invalid, stale and failed adjustments are atomic, including audit and reminder state',()=>{
 const {s,clock,store}=setup(),id=s.execute({type:'focus.start-unassigned'}).timer!.sessionId;clock.advance(2*minute);s.execute({type:'focus.pause',payload:{sessionId:id}});clock.advance(minute);
 const before=s.exportJson();
 for(const startedAt of [at('10:04:00'),at('10:02:01'),'2026-10-21T09:59:59+08:00','not a time'])assert.throws(()=>adjust(s,id,startedAt));
 assert.throws(()=>adjust(s,'missing',at('09:20:00')),/请选择/);
 assert.throws(()=>s.execute({type:'focus.set-start',payload:{sessionId:id,startedAt:at('09:20:00'),expectedStart:at('09:59:00')}}),/别处调整/);
 assert.equal(s.exportJson(),before);store.fail=true;assert.throws(()=>adjust(s,id,at('09:20:00')),/disk full/);store.fail=false;assert.equal(s.exportJson(),before);
 s.execute({type:'focus.stop',payload:{sessionId:id}});const ended=s.exportJson();assert.throws(()=>adjust(s,id,at('09:20:00')),/已经结束/);assert.equal(s.exportJson(),ended);
});

test('same-item overlap rejects only added time; touching boundaries and other concurrent work remain valid',()=>{
 const {s}=setup(),taskId=add(s),otherId=add(s,'并行工作');
 s.execute({type:'session.manual',payload:{taskId,date:'2026-10-22',start:at('09:00:00'),end:at('09:40:00'),minutes:40}});
 const id=s.execute({type:'focus.start',payload:{taskId}}).timer!.sessionId,other=s.execute({type:'focus.start',payload:{taskId:otherId,startedAt:at('09:30:00')}}).timers.at(-1)!,before=s.exportJson();
 assert.throws(()=>adjust(s,id,at('09:30:00')),/同一事项.*重叠/);assert.equal(s.exportJson(),before);
 const next=adjust(s,id,at('09:40:00'));assert.equal(next.timers.find(t=>t.sessionId===id)!.durationMs,20*minute);assert.deepEqual(next.timers.find(t=>t.sessionId===other.sessionId),other);assert.equal(taskMs(next.state,taskId),60*minute);
 assert.throws(()=>s.execute({type:'focus.start',payload:{taskId,startedAt:at('09:40:00')}}),/已有计时器/);
});

test('backdated atomic starts reject bad dates without creating records or disturbing concurrent work',()=>{
 const {s}=setup(),taskId=add(s),other=s.execute({type:'focus.start-unassigned'}).timer!.sessionId,before=s.exportJson();
 assert.throws(()=>s.execute({type:'focus.start',payload:{taskId,startedAt:at('10:01:00'),mode:'switch'}}),/未来/);assert.equal(s.exportJson(),before);
 const next=s.execute({type:'focus.start',payload:{taskId,startedAt:at('09:20:00')}});assert.match(next.focusReminder!,/每次只做一件/);assert.equal(next.timers.at(-1)!.durationMs,40*minute);assert.equal(next.timers.find(t=>t.sessionId===other)!.durationMs,0);
});

test('cross-midnight backfill stays one session across days, assignment and recoverable discard',()=>{
 const {s,clock}=setup();clock.time=Date.parse('2026-10-22T00:20:00+08:00');const taskCount=s.snapshot().state.tasks.length;
 const id=s.execute({type:'focus.start-unassigned',payload:{startedAt:'2026-10-21T23:40:00+08:00'}}).timer!.sessionId,record=s.snapshot().state.sessions[0];
 assert.equal(record.date,'2026-10-21');assert.equal(s.snapshot().state.tasks.length,taskCount);assert.equal(sessionMsOnDate(record,'2026-10-21'),20*minute);assert.equal(sessionMsOnDate(record,'2026-10-22'),20*minute);
 for(const day of ['2026-10-21','2026-10-22'])assert.equal(calendarEntries(s.snapshot().state,day,['effort']).length,1);
 clock.advance(5*minute);s.execute({type:'focus.stop',payload:{sessionId:id}});const assigned=s.execute({type:'session.assign',payload:{id,title:'补充的事项'}}).state;
 assert.equal(assigned.sessions[0].id,id);assert.equal(assigned.sessions[0].targetOffsetMs,40*minute);assert.equal(assigned.sessions[0].durationMs,45*minute);assert.equal(taskMs(assigned,assigned.tasks.at(-1)!.id),45*minute);
 const before=assigned.sessions[0];s.execute({type:'session.delete',payload:{id}});assert.equal(periodEffort(s.snapshot().state.sessions,'2026-10-21','2026-10-22').cumulativeMs,0);
 const restored=s.execute({type:'session.restore',payload:{id}}).state.sessions[0];assert.deepEqual(restored,{...before,updatedAt:restored.updatedAt});
});

test('editing an already due timer clears its old alert and preserves a fresh target through backup, sync and restart',()=>{
 const {s,clock,store}=setup(),id=s.execute({type:'focus.start-unassigned'}).timer!.sessionId;clock.advance(25*minute);assert.equal(s.tick().length,1);
 adjust(s,id,at('09:45:00'));assert.equal(s.reminderSnapshot().alerts.length,0);assert.equal(readout(s,id).value,'25:00');clock.advance(5*minute);
 const backup=parseJournalBackup(s.exportJson());assert.equal(backup.sessions[0].targetOffsetMs,40*minute);assert.equal(parseSyncDocument(syncDocument(backup)).state.sessions[0].targetOffsetMs,40*minute);
 s.shutdown();clock.advance(120*minute);const resumed=new JournalService(store,clock);assert.equal(resumed.snapshot().timer!.paused,true);assert.equal(resumed.snapshot().timer!.durationMs,45*minute);assert.equal(readout(resumed,id).value,'20:00');assert.deepEqual(resumed.tick(),[]);
 resumed.execute({type:'focus.resume',payload:{sessionId:id}});clock.advance(20*minute);assert.equal(resumed.tick().length,1);assert.equal(resumed.snapshot().timer!.durationMs,65*minute);
});

test('schema 16 SQLite migration backs up old evidence and persists new target offsets through reload',()=>{
 const {s,clock}=setup(),taskId=add(s);s.execute({type:'session.manual',payload:{taskId,date:'2026-10-21',minutes:12,summary:'已有投入'}});const old=s.snapshot().state;old.schemaVersion=16;
 const dir=mkdtempSync(path.resolve('qa-data/session-start-migration-')),file=path.join(dir,'journal.sqlite'),store=new SqliteJournalStore(file);store.save(old);store.close();
 const upgraded=new JournalService(new SqliteJournalStore(file),clock);assert.deepEqual(upgraded.snapshot().state,{...old,schemaVersion:20});
 const backups=readdirSync(path.join(dir,'backups'));assert.equal(backups.length,1);assert.match(backups[0],/before-schema-16-to-20/);
 const db=new DatabaseSync(path.join(dir,'backups',backups[0]),{readOnly:true});try{assert.equal((db.prepare('PRAGMA user_version').get() as any).user_version,16);assert.deepEqual(JSON.parse((db.prepare("SELECT data FROM records WHERE kind='sessions'").get() as any).data),old.sessions[0]);}finally{db.close();}
 const id=upgraded.execute({type:'focus.start',payload:{taskId,startedAt:at('09:20:00')}}).timer!.sessionId;clock.advance(3*minute);upgraded.shutdown();clock.advance(60*minute);
 const reload=new JournalService(new SqliteJournalStore(file),clock);assert.equal(reload.snapshot().timer!.targetOffsetMs,40*minute);assert.equal(reload.snapshot().timer!.durationMs,43*minute);assert.equal(readout(reload,id).value,'22:00');assert.equal(readdirSync(path.join(dir,'backups')).length,1);reload.shutdown();
});

test('backup validation rejects invalid reminder offsets; legacy sessions retain their original target',()=>{
 const {s,clock}=setup(),id=s.execute({type:'focus.start-unassigned'}).timer!.sessionId;
 const source=JSON.parse(s.exportJson());for(const value of [-1,'40',null,Infinity]){const bad=structuredClone(source);bad.state.sessions[0].targetOffsetMs=value;assert.throws(()=>parseJournalBackup(JSON.stringify(bad)));}
 const legacy=structuredClone(source);legacy.version=16;legacy.state.schemaVersion=16;legacy.state.sessions[0].targetOffsetMs=40*minute;assert.throws(()=>parseJournalBackup(JSON.stringify(legacy)));
 assert.equal(s.snapshot().timer!.targetOffsetMs,undefined);clock.advance(25*minute);assert.equal(s.tick().length,1);assert.equal(s.snapshot().timer!.sessionId,id);
});
