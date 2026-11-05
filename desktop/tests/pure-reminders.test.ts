import {test} from 'node:test';
import assert from 'node:assert/strict';
import {JournalService,parseJournalBackup} from '../core/service';
import {emptyState,type JournalState,type Recurrence} from '../core/types';
import {mkdtempSync,readdirSync,rmSync} from 'node:fs';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {SqliteJournalStore} from '../core/store';
import {outlineIndex} from '../core/outline';
import {controlCommand,ControlInputError} from '../core/control-api';
import {inboxItems} from '../core/inbox-review';
process.env.TZ='Asia/Shanghai';
class Store {path='fixture';state=emptyState();load(){return structuredClone(this.state)}save(s:JournalState){this.state=structuredClone(s)}close(){}}
class Clock {time=Date.parse('2026-01-31T09:00:00+08:00');now=()=>this.time;monotonic=()=>this.time}
const rule:Recurrence={mode:'calendar',unit:'month',interval:1,anchor:'2026-01-31',weekdays:[],until:null};
const cmd=(s:JournalService,type:string,payload:Record<string,unknown>={})=>s.execute({type,payload});
const item=(s:JournalService,id:string)=>s.snapshot().state.tasks.find(t=>t.id===id)!;
test('recurring reminder preserves task and effort, skips missed months and snooze leaves calendar anchored',()=>{
 const store=new Store(),clock=new Clock(),s=new JournalService(store,clock);const id=cmd(s,'outline.create',{title:'monthly',parentId:'inbox'}).state.tasks.at(-1)!.id;
 cmd(s,'outline.patch',{id,field:'estimateMinutes',value:20});cmd(s,'session.manual',{taskId:id,date:'2026-01-30',minutes:12});
 cmd(s,'reminder.convert',{id,at:new Date(clock.time).toISOString(),rule});s.tick();assert.equal(s.reminderSnapshot().alerts.find(a=>a.taskId===id)?.recurring,true);
 cmd(s,'item-reminder.snooze',{id});clock.time+=300000;s.tick();cmd(s,'item-reminder.dismiss',{id});assert.equal(item(s,id).reminder!.at,'2026-02-28T01:00:00.000Z');
 clock.time=Date.parse('2026-03-31T10:00:00+08:00');s.tick();cmd(s,'item-reminder.dismiss',{id});assert.equal(item(s,id).reminder!.at,'2026-04-30T01:00:00.000Z');assert.equal(s.snapshot().state.sessions.length,1);
 const copy=parseJournalBackup(s.exportJson());assert.equal(copy.tasks.find(t=>t.id===id)!.itemType,'reminder');
 cmd(s,'outline.patch',{id,field:'itemType',value:'task'});assert.equal(item(s,id).estimateMinutes,20);assert.equal(s.snapshot().state.sessions[0].taskId,id);
});
test('inbox review is conditional, daily, persistent, configurable and supports snooze all',()=>{
 const store=new Store(),clock=new Clock();let s=new JournalService(store,clock);s.tick();assert.equal(s.reminderSnapshot().alerts.length,0);
 const id=cmd(s,'outline.create',{title:'entry',parentId:'inbox'}).state.tasks.at(-1)!.id;assert.equal(inboxItems(s.snapshot().state).length,1);s.tick();assert.equal(s.reminderSnapshot().alerts.find(a=>a.kind==='inbox')?.count,1);
 cmd(s,'reminder.snooze-all');assert.equal(s.reminderSnapshot().alerts.length,0);clock.time+=300000;s=new JournalService(store,clock);s.tick();assert.equal(s.reminderSnapshot().alerts[0].kind,'inbox');cmd(s,'inbox-review.dismiss');s.tick();assert.equal(s.reminderSnapshot().alerts.length,0);
 clock.time=Date.parse('2026-02-01T08:59:00+08:00');s.tick();assert.equal(s.reminderSnapshot().alerts.length,0);clock.time+=60000;s.tick();assert.equal(s.reminderSnapshot().alerts[0].kind,'inbox');
 cmd(s,'inbox-review.dismiss');cmd(s,'inbox-review.settings',{enabled:false,time:'10:00'});clock.time+=86400000;s.tick();assert.equal(s.reminderSnapshot().alerts.length,0);assert.equal(item(s,id).status,'open');
});
test('conversion rejects paused timers and closed items atomically',()=>{
 const store=new Store(),clock=new Clock(),s=new JournalService(store,clock);const id=cmd(s,'outline.create',{title:'work',parentId:null}).state.tasks.at(-1)!.id;
 cmd(s,'focus.start',{taskId:id});cmd(s,'focus.pause',{taskId:id});assert.throws(()=>cmd(s,'reminder.convert',{id,at:new Date(clock.time).toISOString(),rule:null}));assert.equal(item(s,id).itemType,'task');
});

test('month anchor remains on the 31st after February and respects an inclusive end',()=>{
 const store=new Store(),clock=new Clock(),s=new JournalService(store,clock),id=cmd(s,'outline.create',{title:'anchor',parentId:null}).state.tasks.at(-1)!.id;
 cmd(s,'reminder.convert',{id,at:new Date(clock.time).toISOString(),rule:{...rule,until:'2026-03-31'}});s.tick();cmd(s,'item-reminder.dismiss',{id});
 clock.time=Date.parse('2026-02-28T09:00:00+08:00');s.tick();cmd(s,'item-reminder.dismiss',{id});assert.equal(item(s,id).reminder!.at,'2026-03-31T01:00:00.000Z');
 clock.time=Date.parse('2026-03-31T09:00:00+08:00');s.tick();cmd(s,'item-reminder.dismiss',{id});assert.equal(item(s,id).reminder!.state,'dismissed');
});
test('empty Inbox hides pending alert and changing its time reschedules it',()=>{
 const store=new Store(),clock=new Clock(),s=new JournalService(store,clock),id=cmd(s,'outline.create',{title:'entry',parentId:'inbox'}).state.tasks.at(-1)!.id;s.tick();
 cmd(s,'inbox-review.settings',{enabled:true,time:'10:00'});s.tick();assert.equal(s.reminderSnapshot().alerts.length,0);clock.time+=3600000;s.tick();assert.equal(s.reminderSnapshot().alerts[0].kind,'inbox');
 cmd(s,'task.status',{id,status:'done'});assert.equal(s.reminderSnapshot().alerts.length,0);assert.throws(()=>cmd(s,'inbox-review.dismiss'));
});
test('conversion undo restores the whole task, while later changes block partial undo',()=>{
 const store=new Store(),clock=new Clock(),s=new JournalService(store,clock),id=cmd(s,'outline.create',{title:'undo',parentId:null}).state.tasks.at(-1)!.id;
 cmd(s,'outline.patch',{id,field:'plannedDate',value:'2026-02-02'});cmd(s,'reminder.convert',{id,at:new Date(clock.time).toISOString(),rule:null});cmd(s,'organize.undo');assert.equal(item(s,id).itemType,'task');assert.equal(item(s,id).plannedDate,'2026-02-02');assert.equal(item(s,id).reminderHistory,undefined);
 cmd(s,'reminder.convert',{id,at:new Date(clock.time).toISOString(),rule:null});s.tick();assert.throws(()=>cmd(s,'organize.undo'),/已有变化/);assert.equal(item(s,id).itemType,'reminder');
});

test('schema 20 is backed up before upgrade without altering contents and reminders do not count as tasks',()=>{
 const folder=mkdtempSync(path.resolve('qa-data/pure-reminder-migration-'));let service:JournalService|undefined;
 try{const file=path.join(folder,'journal.sqlite'),old=new SqliteJournalStore(file),state=emptyState();state.schemaVersion=20;old.save(state);old.close();service=new JournalService(new SqliteJournalStore(file),new Clock());
  const backup=readdirSync(path.join(folder,'backups')).find(n=>n.startsWith('before-schema-20-to-24-'));assert.ok(backup);const db=new DatabaseSync(path.join(folder,'backups',backup),{readOnly:true});try{assert.equal((db.prepare('PRAGMA user_version').get() as {user_version:number}).user_version,20);}finally{db.close();}
  assert.equal(service.snapshot().state.schemaVersion,24);const parent=cmd(service,'outline.create',{title:'parent',parentId:null}).state.tasks.at(-1)!.id;const child=cmd(service,'outline.create',{title:'reminder',parentId:parent}).state.tasks.at(-1)!.id;cmd(service,'reminder.convert',{id:child,at:'2026-01-31T01:00:00.000Z',rule:null});assert.equal(outlineIndex(service.snapshot().state).stats.get(parent)!.tasks,1);
 }finally{service?.shutdown();rmSync(folder,{recursive:true,force:true});}
});

test('public API validates commands and handles repeat reminders without completing tasks',()=>{
 const store=new Store(),clock=new Clock(),s=new JournalService(store,clock),id=cmd(s,'outline.create',{title:'API',parentId:null}).state.tasks.at(-1)!.id;
 const invoke=(type:string,payload:Record<string,unknown>)=>s.execute(controlCommand({type,payload},s.snapshot()));
 invoke('reminder.convert',{id,at:new Date(clock.time).toISOString(),rule});s.tick();assert.throws(()=>invoke('item-reminder.set',{id,at:null}));
 invoke('item-reminder.snooze',{id});clock.time+=300000;s.tick();invoke('item-reminder.dismiss',{id});assert.equal(item(s,id).reminder!.at,'2026-02-28T01:00:00.000Z');
 assert.throws(()=>invoke('recurrence.set',{id,rule:{...rule,extra:true}}),ControlInputError);assert.throws(()=>invoke('recurrence.set',{id,rule:{...rule,mode:'completion'}}));
 invoke('recurrence.set',{id,rule:null});assert.equal(item(s,id).reminder!.at,'2026-02-28T01:00:00.000Z');assert.throws(()=>invoke('task.status',{id,status:'done'}));
});
test('backup rejects malformed pure reminder and Inbox review records',()=>{
 const store=new Store(),clock=new Clock(),s=new JournalService(store,clock),id=cmd(s,'outline.create',{title:'validation',parentId:null}).state.tasks.at(-1)!.id;cmd(s,'reminder.convert',{id,at:new Date(clock.time).toISOString(),rule});
 const raw=JSON.parse(s.exportJson());for(const change of [(x:any)=>delete x.state.tasks.find((t:any)=>t.id===id).reminder,(x:any)=>x.state.tasks.find((t:any)=>t.id===id).reminder.extra=true,(x:any)=>x.state.tasks.find((t:any)=>t.id===id).recurrence.extra=true,(x:any)=>x.state.settings.inboxReview={enabled:true,time:'09:00',pendingDate:null,lastHandledDate:null,snoozedUntil:null,extra:true}]){const bad=structuredClone(raw);change(bad);assert.throws(()=>parseJournalBackup(JSON.stringify(bad)));}
 assert.throws(()=>cmd(s,'recurrence.set',{id,rule:{...rule,extra:true}}));
});
