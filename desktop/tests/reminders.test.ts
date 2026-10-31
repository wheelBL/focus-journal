import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {JournalService} from '../core/service';
import {SqliteJournalStore} from '../core/store';
import {emptyState,type JournalState,type JournalStore,type WorkClock} from '../core/types';
import {pendingReminders,reminderSettings,ReminderCadence,reminderBounds,validateReminderSettings} from '../core/reminders';
class Clock implements WorkClock{time=Date.parse('2026-10-19T09:00:00+08:00');mono=0;now(){return this.time;}monotonic(){return this.mono;}advance(ms:number){this.time+=ms;this.mono+=ms;}}
class Store implements JournalStore{path='reminder tests';state=emptyState();fail=false;load(){return structuredClone(this.state);}save(s:JournalState){if(this.fail)throw new Error('disk full');this.state=structuredClone(s);}close(){}}
function setup(){const store=new Store(),clock=new Clock(),service=new JournalService(store,clock);const ids=['写作','阅读'].map(title=>service.execute({type:'task.save',payload:{title,estimateMinutes:50}}).state.tasks.at(-1)!.id);for(const taskId of ids)service.execute({type:'focus.start',payload:{taskId,targetMinutes:1}});const alerts=()=>pendingReminders(service.snapshot().state);return {store,clock,service,ids,alerts};}
test('targets persist independent pending cards while work continues; acknowledgement never ends a timer',()=>{
 const {service,clock,alerts}=setup();clock.advance(60000);assert.equal(service.tick().length,2);const [a,b]=alerts();assert.equal(alerts().length,2);
 clock.advance(120000);assert.equal(service.tick().length,0);assert.equal(alerts()[0].durationMs,180000);
 service.execute({type:'reminder.dismiss',payload:{sessionId:a.sessionId}});assert.deepEqual(alerts().map(a=>a.sessionId),[b.sessionId]);assert.equal(service.snapshot().timers.length,2);
 clock.advance(3600000);service.tick();assert.equal(alerts().length,1);assert.ok(service.snapshot().timers.every(t=>!t.paused));
});
test('snooze waits five wall-clock minutes, keeps original target/estimate/session, and does not affect other alerts',()=>{
 const {service,clock,alerts,ids}=setup();clock.advance(60000);service.tick();const [a,b]=alerts();service.execute({type:'reminder.snooze',payload:{sessionId:a.sessionId}});
 assert.deepEqual(alerts().map(a=>a.sessionId),[b.sessionId]);clock.advance(299999);service.tick();assert.equal(alerts().length,1);clock.advance(1);service.tick();assert.equal(alerts().length,2);
 assert.equal(service.snapshot().timers.find(t=>t.sessionId===a.sessionId)!.durationMs,360000);assert.equal(service.snapshot().timers[0].targetMinutes,1);assert.equal(service.snapshot().state.tasks.find(t=>t.id===ids[0])!.estimateMinutes,50);
 assert.equal(service.snapshot().state.sessions.length,2);
});
test('closing the aggregate reminder snoozes all pending alerts atomically without stopping them',()=>{
 const {service,clock,alerts,store}=setup();clock.advance(60000);service.tick();store.fail=true;assert.throws(()=>service.execute({type:'reminder.snooze-all'}),/disk full/);assert.equal(alerts().length,2);
 store.fail=false;service.execute({type:'reminder.snooze-all'});assert.equal(alerts().length,0);assert.ok(service.snapshot().timers.every(t=>!t.paused));clock.advance(300000);service.tick();assert.equal(alerts().length,2);
});
test('pause, completion and stop remove only the relevant reminder; stale actions cannot alter another session',()=>{
 const {service,clock,alerts}=setup();clock.advance(60000);service.tick();const [a,b]=alerts();service.execute({type:'focus.pause',payload:{sessionId:a.sessionId}});assert.equal(alerts().length,1);
 assert.throws(()=>service.execute({type:'reminder.dismiss',payload:{sessionId:a.sessionId}}),/已经处理/);assert.throws(()=>service.execute({type:'reminder.snooze'}),/请选择/);
 service.execute({type:'focus.resume',payload:{sessionId:a.sessionId}});assert.equal(alerts().length,2);service.execute({type:'focus.stop',payload:{sessionId:b.sessionId}});assert.deepEqual(alerts().map(t=>t.sessionId),[a.sessionId]);
});
test('suspend and restart keep snooze and acknowledgement durable but never show paused/offline alerts',()=>{
 const {service,clock,alerts,store}=setup();clock.advance(60000);service.tick();const [a,b]=alerts();service.execute({type:'reminder.snooze',payload:{sessionId:a.sessionId}});service.execute({type:'reminder.dismiss',payload:{sessionId:b.sessionId}});service.shutdown();clock.advance(600000);
 const reopened=new JournalService(store,clock);assert.equal(pendingReminders(reopened.snapshot().state).length,0);reopened.tick();assert.equal(pendingReminders(reopened.snapshot().state).length,0);
 for(const t of reopened.snapshot().timers)reopened.execute({type:'focus.resume',payload:{sessionId:t.sessionId}});reopened.tick();assert.deepEqual(pendingReminders(reopened.snapshot().state).map(t=>t.sessionId),[a.sessionId]);
 assert.equal(reopened.snapshot().timers[0].durationMs,60000);
});
test('legacy reminded sessions are not unexpectedly re-alerted on upgrade',()=>{
 const {service,clock,store}=setup();clock.advance(60000);service.tick();for(const s of store.state.sessions)delete s.reminder;store.state.schemaVersion=5;
 const upgraded=new JournalService(store,clock);for(const t of upgraded.snapshot().timers)upgraded.execute({type:'focus.resume',payload:{sessionId:t.sessionId}});upgraded.tick();assert.equal(pendingReminders(upgraded.snapshot().state).length,0);
});
test('audio cadence merges simultaneous targets and permits exactly three repeats',()=>{
 const {service,clock,alerts}=setup();clock.advance(60000);service.tick();const cadence=new ReminderCadence(),settings=reminderSettings(service.snapshot().state.settings);
 assert.equal(cadence.next(0,alerts(),settings),true);assert.equal(cadence.next(29999,alerts(),settings),false);assert.equal(cadence.next(30000,alerts(),settings),true);assert.equal(cadence.next(60000,alerts(),settings),true);assert.equal(cadence.next(90000,alerts(),settings),true);
 assert.equal(cadence.next(120000,alerts(),settings),false);assert.equal(cadence.next(3600000,alerts(),settings),false);assert.equal(alerts().length,2);
});
test('new alerts queue behind an existing chime and snooze establishes a fresh repeat cycle',()=>{
 const {service,clock,alerts}=setup();clock.advance(60000);service.tick();const [a,b]=alerts(),cadence=new ReminderCadence(),settings=reminderSettings(service.snapshot().state.settings);
 assert.equal(cadence.next(0,[a],settings),true);assert.equal(cadence.next(1000,[a,b],settings),false);assert.equal(cadence.next(3000,[a,b],settings),true);
 cadence.next(4000,[],settings);assert.equal(cadence.next(300000,[a],settings),true);
});
test('silent mode and zero volume keep visual reminders and do not consume the sound budget',()=>{
 const {service,clock,alerts}=setup();clock.advance(60000);service.tick();const cadence=new ReminderCadence(),settings=reminderSettings(service.snapshot().state.settings);
 assert.equal(cadence.next(0,alerts(),{...settings,sound:false}),false);assert.equal(cadence.next(0,alerts(),{...settings,volume:0}),false);assert.equal(alerts().length,2);assert.equal(cadence.next(0,alerts(),settings),true);
});
test('reminder preferences validate atomically and roundtrip with all data',()=>{
 const {service}=setup();const settings={sound:false,volume:25,repeatSeconds:60};service.execute({type:'reminder.settings',payload:{settings}});const before=service.exportJson();
 for(const invalid of [null,{...settings,volume:101},{...settings,volume:NaN},{...settings,repeatSeconds:0},{...settings,sound:'true'}]){assert.throws(()=>service.execute({type:'reminder.settings',payload:{settings:invalid}}),/设置无效/);assert.equal(service.exportJson(),before);}
 const other=new JournalService(new Store(),new Clock());other.importJson(before);assert.deepEqual(reminderSettings(other.snapshot().state.settings),settings);assert.deepEqual(validateReminderSettings(settings),settings);
});
test('invalid reminder state in a backup cannot replace the current journal',()=>{
 const {service,clock}=setup();clock.advance(60000);service.tick();const backup=JSON.parse(service.exportJson());const other=new JournalService(new Store(),clock),original=other.exportJson();
 for(const reminder of [{state:'unknown',snoozedUntil:null},{state:'snoozed',snoozedUntil:null},{state:'pending',snoozedUntil:'2026-10-19T10:00:00.000Z'},{state:'snoozed',snoozedUntil:'invalid'}]){const bad=structuredClone(backup);bad.state.sessions[0].reminder=reminder;assert.throws(()=>other.importJson(JSON.stringify(bad)));assert.equal(other.exportJson(),original);}
});
test('schema 5 migration creates a backup without changing existing tasks, views, sessions or settings',()=>{
 const dir=mkdtempSync(path.join(tmpdir(),'journal-reminder-upgrade-'));try{
  const {service,clock}=setup();for(const t of service.snapshot().timers)service.execute({type:'focus.stop',payload:{sessionId:t.sessionId}});const legacy=structuredClone(service.snapshot().state);legacy.schemaVersion=5;
  const file=path.join(dir,'journal.sqlite'),old=new SqliteJournalStore(file);old.save(legacy);old.close();const upgraded=new JournalService(new SqliteJournalStore(file),clock);assert.deepEqual(upgraded.snapshot().state,{...legacy,schemaVersion:19});upgraded.shutdown();
  const backup=readdirSync(path.join(dir,'backups')).find(f=>f.startsWith('before-schema-5-to-19-'));assert.ok(backup);const db=new DatabaseSync(path.join(dir,'backups',backup),{readOnly:true});assert.equal((db.prepare('PRAGMA user_version').get() as {user_version:number}).user_version,5);db.close();
 }finally{rmSync(dir,{recursive:true,force:true});}
});
test('reminder bounds stay in the chosen monitor work area, including negative coordinates and small displays',()=>{
 for(const area of [{x:-1920,y:0,width:1920,height:1040},{x:0,y:0,width:600,height:400},{x:0,y:0,width:400,height:300}])for(const count of [1,2,20]){const r=reminderBounds(area,count);assert.ok(r.x>=area.x&&r.y>=area.y);assert.ok(r.x+r.width<=area.x+area.width&&r.y+r.height<=area.y+area.height);}
});
