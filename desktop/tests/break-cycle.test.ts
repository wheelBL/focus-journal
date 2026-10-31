import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,readdirSync} from 'node:fs';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {JournalService,parseJournalBackup} from '../core/service';
import {SqliteJournalStore} from '../core/store';
import {emptyState,type JournalState} from '../core/types';
import {breakContinuation} from '../core/break-state';
import {fingerprint,parseSyncDocument,syncDocument} from '../core/sync-data';
import {ReminderCadence} from '../core/reminders';
class Store{path='break cycle tests';state=emptyState();fail=false;load(){return structuredClone(this.state);}save(s:JournalState){if(this.fail)throw Error('disk full');this.state=structuredClone(s);}close(){}}
class Clock{time=Date.parse('2026-10-20T10:00:00+08:00');mono=0;now(){return this.time;}monotonic(){return this.mono;}advance(ms:number){this.time+=ms;this.mono+=ms;}}
function setup(){const store=new Store(),clock=new Clock(),s=new JournalService(store,clock);return {s,store,clock};}
const add=(s:JournalService)=>s.execute({type:'task.save',payload:{title:'整理设计'}}).state.tasks.at(-1)!.id;
const start=(s:JournalService,taskId?:string)=>s.execute({type:taskId?'focus.start':'focus.start-unassigned',payload:{taskId}}).timers.at(-1)!.sessionId;

test('25-minute target continues until explicit end-and-rest; five-minute rest never counts as work or autostarts',()=>{
 const {s,clock}=setup(),taskId=add(s),id=start(s,taskId);
 clock.advance(25*60000);s.tick();assert.equal(s.snapshot().timer!.paused,false);assert.equal(s.snapshot().state.settings.rest,null);
 assert.equal(s.reminderSnapshot().alerts[0].canRest,true);
 clock.advance(120000);s.execute({type:'focus.stop',payload:{sessionId:id,rest:true}});
 const original=structuredClone(s.snapshot().state.sessions[0]),until=s.snapshot().state.settings.breakUntil!;
 assert.equal(original.durationMs,27*60000);assert.equal(s.snapshot().timers.length,0);assert.equal(Date.parse(until)-clock.time,300000);
 clock.advance(120000);s.execute({type:'break.start'});assert.equal(s.snapshot().state.settings.breakUntil,until);
 clock.advance(180000);assert.equal(s.tick().length,1);assert.equal(s.tick().length,0);
 assert.deepEqual(s.snapshot().state.sessions,[original]);assert.equal(s.snapshot().state.settings.rest!.phase,'ready');
 const alert=s.reminderSnapshot().alerts[0];assert.equal(alert.kind,'break');assert.equal(alert.continuationTitle,'整理设计');assert.match(alert.title,/欢迎回来/);
 const cadence=new ReminderCadence();assert.equal(cadence.next(0,[alert],{sound:true,volume:60,repeatSeconds:30}),true);
 s.execute({type:'break.continue'});assert.equal(s.snapshot().timer!.taskId,taskId);assert.equal(s.snapshot().timer!.durationMs,0);assert.equal(s.snapshot().state.settings.rest,null);
 assert.throws(()=>s.execute({type:'break.continue'}),/已变化/);assert.equal(s.snapshot().state.sessions.length,2);
});
test('ordinary stop offers rest; unassigned association during rest determines the continuation without changing time',()=>{
 const {s,clock}=setup(),id=start(s);clock.advance(60000);s.execute({type:'focus.stop',payload:{sessionId:id}});
 assert.equal(s.snapshot().state.settings.rest!.phase,'offered');assert.equal(s.snapshot().state.settings.breakUntil,null);
 s.execute({type:'break.start'});const until=s.snapshot().state.settings.breakUntil;
 const result=s.execute({type:'session.assign',payload:{id,title:'刚才的工作'}});assert.equal(result.state.settings.breakUntil,until);
 assert.equal(breakContinuation(result.state).taskId,result.state.tasks.at(-1)!.id);
 clock.advance(300000);s.tick();s.execute({type:'break.acknowledge'});
 assert.equal(s.reminderSnapshot().alerts.length,0);assert.equal(s.snapshot().state.settings.rest!.phase,'ready');assert.equal(s.snapshot().timers.length,0);
 const record=s.snapshot().state.sessions[0];s.execute({type:'break.continue'});assert.equal(s.snapshot().timer!.taskId,record.taskId);assert.equal(record.durationMs,60000);
});
test('simultaneous work and failed writes cannot partially end a focus session or create an item with a failed rest',()=>{
 const {s,clock,store}=setup(),a=start(s),b=start(s);clock.advance(60000);
 assert.ok(s.reminderSnapshot().alerts.length===0);
 assert.throws(()=>s.execute({type:'focus.stop',payload:{sessionId:a,rest:true}}),/所有/);assert.equal(s.snapshot().timers.length,2);assert.equal(s.snapshot().state.settings.rest,null);
 s.execute({type:'focus.pause',payload:{sessionId:b}});store.fail=true;
 assert.throws(()=>s.execute({type:'focus.stop',payload:{sessionId:a,rest:true}}),/disk/);assert.equal(s.snapshot().timers.length,2);
 store.fail=false;s.execute({type:'focus.stop',payload:{sessionId:a,rest:true}});assert.equal(s.snapshot().state.settings.rest!.phase,'running');assert.equal(s.snapshot().timers[0].paused,true);
 s.execute({type:'focus.resume',payload:{sessionId:b}});assert.equal(s.snapshot().state.settings.rest,null);
 const before=s.exportJson();assert.throws(()=>s.execute({type:'session.assign',payload:{id:a,title:'不能半保存',rest:true}}),/所有/);assert.equal(s.exportJson(),before);
});
test('end break early, extend rest and continue free or changed tasks require explicit actions',()=>{
 const {s,clock}=setup(),id=start(s);clock.advance(1000);s.execute({type:'focus.stop',payload:{sessionId:id,rest:true}});
 s.execute({type:'break.finish'});assert.equal(s.snapshot().state.settings.rest!.phase,'ready');assert.equal(s.reminderSnapshot().alerts.length,0);
 s.execute({type:'settings.save',payload:{targetMinutes:40,breakMinutes:7}});s.execute({type:'break.start'});assert.equal(Date.parse(s.snapshot().state.settings.breakUntil!)-clock.time,420000);
 clock.advance(420000);s.tick();s.execute({type:'reminder.snooze-all'});assert.equal(s.snapshot().state.settings.rest!.phase,'ready');assert.equal(s.reminderSnapshot().alerts.length,0);
 s.execute({type:'break.continue'});assert.equal(s.snapshot().timer!.taskId,null);assert.equal(s.snapshot().timer!.targetMinutes,40);
 s.execute({type:'focus.stop',payload:{sessionId:s.snapshot().timer!.sessionId,rest:true}});s.execute({type:'break.stop'});assert.equal(s.snapshot().state.settings.rest,null);
 const taskId=add(s),taskSession=start(s,taskId);s.execute({type:'focus.stop',payload:{sessionId:taskSession,rest:true}});
 s.execute({type:'task.status',payload:{id:taskId,status:'done'}});clock.advance(420000);s.tick();assert.equal(breakContinuation(s.snapshot().state).taskId,null);s.execute({type:'break.continue'});assert.equal(s.snapshot().timer!.taskId,null);
});
test('rest survives restart and backup; late welcome catches up, sync never transfers a live rest cycle',()=>{
 const {s,clock,store}=setup(),id=start(s);clock.advance(60000);s.execute({type:'focus.stop',payload:{sessionId:id,rest:true}});
 const content=s.exportJson(),before=fingerprint(s.snapshot().state);assert.equal(parseJournalBackup(content).settings.rest!.phase,'running');
 assert.equal(parseSyncDocument(syncDocument(s.snapshot().state)).state.settings.rest,null);
 s.shutdown();clock.advance(600000);const reopened=new JournalService(store,clock);reopened.tick();
 assert.equal(reopened.snapshot().state.settings.rest!.phase,'ready');assert.equal(reopened.reminderSnapshot().alerts.length,1);assert.equal(reopened.snapshot().timers.length,0);
 assert.equal(fingerprint(reopened.snapshot().state),before);
 reopened.execute({type:'break.acknowledge'});reopened.shutdown();const again=new JournalService(store,clock);again.tick();assert.equal(again.reminderSnapshot().alerts.length,0);assert.equal(again.snapshot().state.settings.rest!.phase,'ready');
 const bad=JSON.parse(content);bad.state.settings.rest.phase='ready';assert.throws(()=>parseJournalBackup(JSON.stringify(bad)),/无效/);
});
test('schema 14 migration backs up the original break deadline and preserves unassigned sessions',()=>{
 const dir=path.resolve('qa-evidence/release-0.16.0');mkdirSync(dir,{recursive:true});const folder=mkdtempSync(path.join(dir,'migration-')),file=path.join(folder,'journal.sqlite');
 const old=emptyState();old.schemaVersion=14;delete old.settings.rest;old.settings.breakUntil='2026-10-20T02:05:00.000Z';
 const disk=new SqliteJournalStore(file);disk.save(old);disk.close();
 const clock=new Clock(),s=new JournalService(new SqliteJournalStore(file),clock);assert.equal(s.snapshot().state.schemaVersion,19);assert.equal(s.snapshot().state.settings.breakUntil,old.settings.breakUntil);assert.equal(s.snapshot().state.settings.rest!.phase,'running');
 clock.advance(300000);s.tick();assert.equal(s.reminderSnapshot().alerts[0].kind,'break');s.shutdown();
 const name=readdirSync(path.join(folder,'backups')).find(n=>n.startsWith('before-schema-14-to-19-'))!;assert.ok(name);const backup=new DatabaseSync(path.join(folder,'backups',name),{readOnly:true});
 assert.equal((backup.prepare('PRAGMA user_version').get() as any).user_version,14);assert.deepEqual(JSON.parse((backup.prepare("SELECT data FROM records WHERE kind='settings'").get() as any).data),old.settings);backup.close();
});


test('finishing an active item from the tree offers rest without changing the completed work',()=>{
 const {s,clock}=setup(),taskId=add(s),id=start(s,taskId);clock.advance(1500000);
 s.execute({type:'task.status',payload:{id:taskId,status:'done'}});const state=s.snapshot().state;
 assert.equal(state.settings.rest!.phase,'offered');assert.equal(state.settings.rest!.sessionId,id);assert.equal(state.sessions[0].durationMs,1500000);assert.equal(state.tasks.find(t=>t.id===taskId)!.status,'done');
 s.execute({type:'break.start'});s.execute({type:'break.finish'});assert.equal(breakContinuation(s.snapshot().state).taskId,null);
});
