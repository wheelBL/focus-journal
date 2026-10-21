import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readdirSync} from 'node:fs';
import path from 'node:path';
import {JournalService} from '../core/service';
import {SqliteJournalStore} from '../core/store';
import {emptyState,type JournalState} from '../core/types';
import {pendingReminders} from '../core/reminders';
import {calendarEntries,calendarReminderInput} from '../src/calendar-layout';
class Store{path='scheduled reminder tests';state=emptyState();fail=false;load(){return structuredClone(this.state);}save(s:JournalState){if(this.fail)throw new Error('disk full');this.state=structuredClone(s);}close(){}}
class Clock{time=Date.parse('2026-10-19T09:00:00');mono=0;now(){return this.time;}monotonic(){return this.mono;}advance(ms:number){this.time+=ms;this.mono+=ms;}}
const setup=()=>{const clock=new Clock(),store=new Store(),service=new JournalService(store,clock);return {service,store,clock};};
const add=(s:JournalService,title='提醒事项',extra={})=>s.execute({type:'task.save',payload:{title,...extra}}).state.tasks.at(-1)!.id;
const alerts=(s:JournalService)=>pendingReminders(s.snapshot().state);

test('calendar capture creates one ordinary item atomically, independent of plan, deadline and effort',()=>{
 const {service:s,clock,store}=setup(),at=new Date(clock.time+60000).toISOString(),id=add(s,'交材料',{remindAt:at,dueAt:'2026-10-23'});
 let t=s.snapshot().state.tasks.filter((t:{id:string})=>t.id!=='inbox')[0];assert.equal(t.reminder?.at,at);assert.equal(t.plannedDate,null);assert.equal(t.dueAt,'2026-10-23');assert.equal(s.snapshot().state.sessions.length,0);
 clock.advance(59999);s.tick();assert.equal(alerts(s).length,0);clock.advance(1);s.tick();assert.deepEqual(alerts(s).map(a=>[a.kind,a.taskId]),[['task',id]]);
 s.tick();assert.equal(alerts(s).length,1);assert.equal(s.snapshot().timers.length,0);
 store.fail=true;assert.throws(()=>add(s,'不能部分保存',{remindAt:at}),/disk full/);assert.equal(s.snapshot().state.tasks.filter((t:{id:string})=>t.id!=='inbox').length,1);
 assert.throws(()=>add(s,'无效时间',{remindAt:'nonsense'}));
});
test('task and focus reminders coexist; snooze and acknowledgement target only their own item',()=>{
 const {service:s,clock}=setup(),id=add(s,'开会',{remindAt:new Date(clock.time+60000).toISOString()}),work=add(s,'正在写作');s.execute({type:'focus.start',payload:{taskId:work,skipEstimate:true,targetMinutes:1}});clock.advance(60000);s.tick();assert.equal(alerts(s).length,2);
 s.execute({type:'item-reminder.snooze',payload:{id}});assert.equal(alerts(s).length,1);assert.equal(s.snapshot().timers.length,1);clock.advance(299999);s.tick();assert.equal(alerts(s).length,1);clock.advance(1);s.tick();assert.equal(alerts(s).length,2);
 s.execute({type:'item-reminder.dismiss',payload:{id}});assert.equal(alerts(s).length,1);assert.throws(()=>s.execute({type:'item-reminder.snooze',payload:{id}}),/已经处理/);assert.equal(s.snapshot().timers[0].durationMs,360000);
});
test('closing the shared reminder card snoozes both kinds without starting or stopping work',()=>{
 const {service:s,clock}=setup();add(s,'事项',{remindAt:new Date(clock.time-1000).toISOString()});const work=add(s,'专注');s.execute({type:'focus.start',payload:{taskId:work,skipEstimate:true,targetMinutes:1}});clock.advance(60000);s.tick();assert.equal(alerts(s).length,2);
 s.execute({type:'reminder.snooze-all'});assert.equal(alerts(s).length,0);assert.equal(s.snapshot().timers.length,1);clock.advance(300000);s.tick();assert.equal(alerts(s).length,2);
});
test('missed reminders survive restart, sync/backup and moving a branch; completed items do not re-alert',()=>{
 const {service:s,clock,store}=setup(),id=add(s,'回来后查看',{remindAt:new Date(clock.time+60000).toISOString()}),parent=add(s,'归属');s.execute({type:'outline.move',payload:{id,targetId:parent,position:'inside'}});s.shutdown();clock.advance(3600000);
 const reopened=new JournalService(store,clock);reopened.tick();assert.equal(alerts(reopened)[0].taskId,id);const copy=new JournalService(new Store(),clock);copy.importJson(reopened.exportJson());assert.equal(alerts(copy)[0].taskId,id);
 reopened.execute({type:'item-reminder.dismiss',payload:{id}});const again=new JournalService(store,clock);again.tick();assert.equal(alerts(again).length,0);
 again.execute({type:'item-reminder.set',payload:{id,at:new Date(clock.time).toISOString()}});again.tick();assert.equal(alerts(again).length,1);again.execute({type:'task.status',payload:{id,status:'done'}});assert.equal(alerts(again).length,0);again.execute({type:'task.status',payload:{id,status:'open'}});again.tick();assert.equal(alerts(again).length,0);
});
test('removing and rescheduling pending reminders are durable and malformed imports are rejected',()=>{
 const {service:s,clock}=setup(),id=add(s,'改期',{remindAt:new Date(clock.time).toISOString()});s.tick();s.execute({type:'item-reminder.set',payload:{id,at:new Date(clock.time+3600000).toISOString()}});assert.equal(alerts(s).length,0);
 const backup=JSON.parse(s.exportJson());backup.state.tasks.filter((t:{id:string})=>t.id!=='inbox')[0].reminder={at:'2026-10-19',state:'snoozed',snoozedUntil:null};assert.throws(()=>s.importJson(JSON.stringify(backup)),/提醒/);
 s.execute({type:'item-reminder.set',payload:{id,at:null}});clock.advance(7200000);s.tick();assert.equal(alerts(s).length,0);
});
test('calendar slots respect scrolled coordinates and reminder lanes never become effort records',()=>{
 const {service:s,clock}=setup(),id=add(s,'提醒',{remindAt:new Date(clock.time).toISOString()});const start=clock.time;clock.advance(1800000);s.execute({type:'session.manual',payload:{taskId:id,date:'2026-10-19',start:new Date(start).toISOString(),end:new Date(clock.time).toISOString(),minutes:30}});
 const state=s.snapshot().state,original=JSON.stringify(state),entries=calendarEntries(state,'2026-10-19');assert.equal(entries.length,2);assert.ok(entries.every(e=>e.lanes===2));assert.notEqual(entries[0].lane,entries[1].lane);assert.equal(JSON.stringify(state),original);assert.equal(state.sessions.length,1);
 assert.equal(calendarReminderInput('2026-10-19',600,1152),'2026-10-19T12:30');assert.equal(calendarReminderInput('2026-10-19',1152,1152),'2026-10-19T23:45');assert.equal(calendarReminderInput('2026-10-19',-2,1152),'2026-10-19T00:00');
});
test('schema nine upgrades keep records and create a pre-migration backup',()=>{
 const {service:s}=setup();add(s,'保留已有任务');const legacy=s.snapshot().state;legacy.schemaVersion=9;for(const t of legacy.tasks)delete t.reminder;
 const dir=mkdtempSync(path.resolve('qa-evidence/reminder-migration-')),file=path.join(dir,'journal.sqlite');const disk=new SqliteJournalStore(file);disk.save(legacy);disk.close();
 const current=new JournalService(new SqliteJournalStore(file));assert.equal(current.snapshot().state.schemaVersion,16);assert.equal(current.snapshot().state.tasks.filter((t:{id:string})=>t.id!=='inbox')[0].id,legacy.tasks.filter((t:{id:string})=>t.id!=='inbox')[0].id);assert.equal(current.snapshot().state.tasks.filter((t:{id:string})=>t.id!=='inbox')[0].reminder,null);current.shutdown();assert.ok(readdirSync(path.join(dir,'backups')).some(f=>f.startsWith('before-schema-9-to-16-')));
});
