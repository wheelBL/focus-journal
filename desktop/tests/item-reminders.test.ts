import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readdirSync} from 'node:fs';
import path from 'node:path';
import {JournalService} from '../core/service';
import {SqliteJournalStore} from '../core/store';
import {emptyState,type JournalState,type Task} from '../core/types';
import {scheduledItems,reminderEligible,reminderEligibility} from '../core/item-reminders';
import {outlineIndex,outlinePath} from '../core/outline';
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
 const current=new JournalService(new SqliteJournalStore(file));assert.equal(current.snapshot().state.schemaVersion,20);assert.equal(current.snapshot().state.tasks.filter((t:{id:string})=>t.id!=='inbox')[0].id,legacy.tasks.filter((t:{id:string})=>t.id!=='inbox')[0].id);assert.equal(current.snapshot().state.tasks.filter((t:{id:string})=>t.id!=='inbox')[0].reminder,null);current.shutdown();assert.ok(readdirSync(path.join(dir,'backups')).some(f=>f.startsWith('before-schema-9-to-20-')));
});

function oldScheduled(state:JournalState){const index=outlineIndex(state);return state.tasks.filter(task=>task.reminder&&task.reminder.state!=='dismissed'&&task.status==='open'&&!outlinePath(index,task.id).some(n=>{const item=n.record as Task;return item.archived||item.deletedAt||item.status&&item.status!=='open';}));}
const dueReminder=()=>({at:'2026-10-22T01:00:00.000Z',state:'scheduled' as const,snoozedUntil:null});

test('topology-only reminders match full outline eligibility for lifecycle, paused branches and in-place changes',()=>{
 const state=emptyState(),base=state.tasks[0];state.tasks=Array.from({length:300},(_,i)=>({...base,id:`t${i}`,title:`T${i}`,parentId:i?`t${Math.floor((i-1)/3)}`:null,isProject:i%4===0,order:300-i,reminder:i%5===0?null:dueReminder()}));
 state.tasks[1].availability='paused';state.tasks[4].status='done';state.tasks[7].status='cancelled';state.tasks[12].deletedAt='2026-10-21T01:00:00.000Z';state.tasks[20].archived=true;state.tasks[25].reminder={...dueReminder(),state:'dismissed'};state.tasks[26].reminder={...dueReminder(),state:'pending'};state.tasks[27].reminder={...dueReminder(),state:'snoozed',snoozedUntil:'2026-10-23T01:00:00.000Z'};
 const before=JSON.stringify(state);assert.deepEqual(scheduledItems(state).map(t=>t.id),oldScheduled(state).map(t=>t.id));assert.equal(JSON.stringify(state),before);
 const index=outlineIndex(state),eligible=reminderEligibility(state,index);for(const task of state.tasks)assert.equal(eligible(task),reminderEligible(state,task,index));
 for(let i=1;i<40;i++){const task=state.tasks[i];task.status=i%2?'open':'done';task.archived=i%7===0;task.deletedAt=i%11===0?'2026-10-21T01:00:00.000Z':null;task.parentId=i%3===0?'t0':task.parentId;assert.deepEqual(scheduledItems(state).map(t=>t.id),oldScheduled(state).map(t=>t.id));}
 state.tasks=[{...base,id:'parent',parentId:null,availability:'paused',reminder:null},{...base,id:'child',parentId:'parent',reminder:dueReminder()}];assert.equal(scheduledItems(state)[0],state.tasks[1],'ordinary pause does not suppress reminders');state.tasks[0].status='done';assert.deepEqual(scheduledItems(state),[]);state.tasks[0].status='open';assert.equal(scheduledItems(state)[0],state.tasks[1]);
});

test('reminder topology preserves legacy projects, ordinary Inbox, missing parents and cycle-safe paths',()=>{
 const state=emptyState(),base=state.tasks[0];state.schemaVersion=3;state.projects=[{id:'legacy',name:'Legacy',createdAt:'2026-10-20T00:00:00.000Z',archived:true}];state.tasks=[{...base,id:'task',projectId:'legacy',parentId:undefined,reminder:dueReminder()}];assert.deepEqual(scheduledItems(state),oldScheduled(state));assert.equal(scheduledItems(state).length,0);state.projects[0].archived=false;assert.equal(scheduledItems(state).length,1);
 state.schemaVersion=12;state.projects=[{id:'inbox',name:'旧收件箱',createdAt:'2026-10-20T00:00:00.000Z',archived:true}];state.tasks=[{...base,id:'task',parentId:'inbox',reminder:dueReminder()}];assert.deepEqual(scheduledItems(state),oldScheduled(state));assert.equal(scheduledItems(state).length,0);
 state.schemaVersion=17;state.tasks=[{...base,id:'a',parentId:'b',reminder:dueReminder()},{...base,id:'b',parentId:'a',reminder:dueReminder()},{...base,id:'orphan',parentId:'missing',reminder:dueReminder()}];assert.deepEqual(scheduledItems(state),oldScheduled(state));state.tasks[1].archived=true;assert.deepEqual(scheduledItems(state),oldScheduled(state));assert.deepEqual(scheduledItems(state).map(t=>t.id),['orphan']);
});

test('deep reminder eligibility is iterative and never reads historical effort',()=>{
 const state=emptyState(),base=state.tasks[0];state.tasks=Array.from({length:6000},(_,i)=>({...base,id:`deep${i}`,parentId:i?`deep${i-1}`:null,reminder:dueReminder()})).reverse();
 Object.defineProperty(state,'sessions',{get(){throw new Error('reminder eligibility must not inspect effort history');}});
 assert.equal(scheduledItems(state).length,6000);assert.equal(reminderEligible(state,state.tasks[0]),true);state.tasks.at(-1)!.archived=true;assert.equal(scheduledItems(state).length,0);
});
