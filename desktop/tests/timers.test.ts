import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {JournalService} from '../core/service';
import {SqliteJournalStore} from '../core/store';
import {emptyState,sessionMsOnDate,type JournalState,type JournalStore,type WorkClock,type Command} from '../core/types';
import {timerMenu} from '../electron/timer-menu';
import {calendarBlocks} from '../src/calendar-layout';
import {emptyFilter} from '../core/filters';

process.env.TZ='Asia/Shanghai';
class Clock implements WorkClock{time=Date.parse('2026-10-19T09:00:00+08:00');mono=0;now(){return this.time;}monotonic(){return this.mono;}advance(ms:number){this.time+=ms;this.mono+=ms;}}
class Store implements JournalStore{path='timer tests';state=emptyState();fail=false;closed=false;load(){return structuredClone(this.state);}save(s:JournalState){if(this.fail)throw new Error('disk full');this.state=structuredClone(s);}close(){this.closed=true;}}
function setup(){const store=new Store(),clock=new Clock(),service=new JournalService(store,clock);const ids=['写作','阅读','练习'].map(title=>service.execute({type:'task.save',payload:{title,estimateMinutes:25}}).state.tasks.at(-1)!.id);const start=(i:number,targetMinutes=25)=>service.execute({type:'focus.start',payload:{taskId:ids[i],targetMinutes}});return {store,clock,service,ids,start};}

test('staggered concurrent timers independently accrue, pause, resume and stop with a gentle reminder',()=>{
 const {service,clock,start,ids}=setup();assert.equal(start(0).focusReminder,undefined);clock.advance(60000);
 const added=start(1);assert.match(added.focusReminder!,/每次只做一件事情/);const [a,b]=added.timers;clock.advance(120000);
 assert.deepEqual(service.snapshot().timers.map(t=>t.durationMs),[180000,120000]);
 service.execute({type:'focus.pause',payload:{sessionId:a.sessionId}});clock.advance(60000);
 assert.deepEqual(service.snapshot().timers.map(t=>t.durationMs),[180000,180000]);
 assert.match(service.execute({type:'focus.resume',payload:{sessionId:a.sessionId}}).focusReminder!,/每次只做一件事情/);clock.advance(30000);
 const stopped=service.execute({type:'focus.stop',payload:{sessionId:b.sessionId,complete:true}});
 assert.deepEqual(stopped.timers.map(t=>[t.taskId,t.durationMs,t.paused]),[[ids[0],210000,false]]);
 assert.equal(stopped.state.tasks.find(t=>t.id===ids[1])!.status,'done');assert.equal(stopped.state.sessions.find(s=>s.id===b.sessionId)!.durationMs,210000);
 clock.advance(30000);assert.equal(service.snapshot().timers[0].durationMs,240000);
});
test('ambiguous or stale commands cannot operate on another timer; duplicate active item is rejected',()=>{
 const {service,start}=setup();const a=start(0).timers[0];start(1);service.execute({type:'focus.pause',payload:{sessionId:a.sessionId}});
 const before=service.exportJson();for(const type of ['focus.pause','focus.resume','focus.stop']){assert.throws(()=>service.execute({type}),/请选择/);assert.throws(()=>service.execute({type,payload:{sessionId:'missing'}}));assert.equal(service.exportJson(),before);}
 assert.throws(()=>start(0),/已有计时器/);assert.equal(service.exportJson(),before);
});
test('concurrency reminder counts running timers, not paused ones, and is never repeated on refresh',()=>{
 const {service,start}=setup();const a=start(0).timers[0];service.execute({type:'focus.pause',payload:{sessionId:a.sessionId}});
 assert.equal(start(1).focusReminder,undefined);assert.equal(service.snapshot().focusReminder,undefined);assert.equal(service.tick().length,0);
 assert.ok(service.execute({type:'focus.resume',payload:{sessionId:a.sessionId}}).focusReminder);assert.equal(service.snapshot().focusReminder,undefined);
});
test('each target reminder fires once and names its task, without stopping other timers',()=>{
 const {service,start,clock}=setup();start(0,1);start(1,2);clock.advance(60000);assert.match(service.tick()[0],/写作/);
 clock.advance(60000);const reminders=service.tick();assert.equal(reminders.length,1);assert.match(reminders[0],/阅读/);
 clock.advance(60000);assert.deepEqual(service.tick(),[]);assert.ok(service.snapshot().timers.every(t=>!t.paused&&t.durationMs===180000));
});
test('suspend and shutdown save and pause every timer; recovered timers exclude all offline time',()=>{
 const {service,start,clock,store}=setup();start(0);clock.advance(10000);start(1);clock.advance(10000);service.suspend();
 assert.deepEqual(service.snapshot().timers.map(t=>t.durationMs),[20000,10000]);assert.ok(service.snapshot().timers.every(t=>t.paused&&t.recovered));
 clock.advance(3600000);for(const t of service.snapshot().timers)service.execute({type:'focus.resume',payload:{sessionId:t.sessionId}});
 clock.advance(5000);service.shutdown();assert.equal(store.closed,true);
 const restarted=new JournalService(store,clock);clock.advance(3600000);assert.deepEqual(restarted.snapshot().timers.map(t=>t.durationMs),[25000,15000]);assert.ok(restarted.snapshot().timers.every(t=>t.paused&&t.recovered));
});
test('crash recovery uses the last durable checkpoint for every concurrent timer',()=>{
 const {service,start,clock,store}=setup();start(0);start(1);clock.advance(12000);service.tick();clock.advance(30000);
 const restarted=new JournalService(store,clock);assert.deepEqual(restarted.snapshot().timers.map(t=>t.durationMs),[12000,12000]);assert.ok(restarted.snapshot().timers.every(t=>t.paused));
});
test('failed concurrent save retains all elapsed time and command atomicity on retry',()=>{
 const {service,start,clock,store}=setup();const a=start(0).timers[0];start(1);clock.advance(10000);store.fail=true;
 assert.throws(()=>service.execute({type:'focus.stop',payload:{sessionId:a.sessionId}}),/disk full/);assert.ok(service.snapshot().timers.every(t=>!t.paused&&t.durationMs===10000));
 clock.advance(5000);store.fail=false;service.execute({type:'focus.stop',payload:{sessionId:a.sessionId}});assert.deepEqual(store.state.sessions.map(s=>s.durationMs),[15000,15000]);
});
test('completion ends only the selected item, even when it is not the first timer',()=>{
 const {service,start,ids,clock}=setup();start(0);start(1);clock.advance(60000);service.execute({type:'task.status',payload:{id:ids[1],status:'done'}});
 assert.deepEqual(service.snapshot().timers.map(t=>t.taskId),[ids[0]]);assert.equal(service.snapshot().state.sessions[1].status,'ended');
 service.execute({type:'task.status',payload:{id:ids[0],status:'open'}});assert.equal(service.snapshot().timers.length,1);
});
test('rest requires all running timers paused or ended; resuming one cancels rest',()=>{
 const {service,start}=setup();const a=start(0).timers[0];const b=start(1).timers[1];service.execute({type:'focus.pause',payload:{sessionId:a.sessionId}});
 assert.throws(()=>service.execute({type:'break.start'}),/所有/);service.execute({type:'focus.pause',payload:{sessionId:b.sessionId}});assert.ok(service.execute({type:'break.start'}).state.settings.breakUntil);
 assert.equal(service.execute({type:'focus.resume',payload:{sessionId:b.sessionId}}).state.settings.breakUntil,null);
});
test('backup restores all active sessions paused and rejects duplicate active sessions atomically',()=>{
 const {service,start,clock}=setup();start(0);start(1);clock.advance(60000);const json=service.exportJson(),restored=new JournalService(new Store(),clock);restored.importJson(json);
 assert.ok(restored.snapshot().timers.every(t=>t.paused&&t.durationMs===60000));assert.throws(()=>restored.importJson(json),/先结束/);
 const invalid=JSON.parse(json);invalid.state.sessions.push({...invalid.state.sessions[0],id:'duplicate'});
 const other=new JournalService(new Store(),clock),before=other.exportJson();assert.throws(()=>other.importJson(JSON.stringify(invalid)),/无效/);assert.equal(other.exportJson(),before);
});
test('parallel intervals can be corrected per item and calendar lanes retain independent durations',()=>{
 const {service,start,clock,ids}=setup();start(0);start(1);clock.advance(60000);for(const t of service.snapshot().timers)service.execute({type:'focus.stop',payload:{sessionId:t.sessionId}});
 const sessions=service.snapshot().state.sessions,blocks=calendarBlocks(sessions,'2026-10-19');assert.equal(blocks.length,2);assert.equal(blocks[0].lanes,2);assert.notEqual(blocks[0].lane,blocks[1].lane);
 assert.equal(sessions.reduce((n,s)=>n+sessionMsOnDate(s,'2026-10-19'),0),120000);
 const payload={taskId:ids[0],date:'2026-10-19',minutes:1,start:sessions[0].start,end:sessions[0].end};
 service.execute({type:'session.manual',payload:{...payload,id:sessions[0].id}});assert.equal(service.snapshot().state.audit.length,1);
 assert.throws(()=>service.execute({type:'session.manual',payload}),/同一事项/);
 service.execute({type:'session.manual',payload:{...payload,taskId:ids[2]}});assert.equal(service.snapshot().state.sessions.length,3);
});
test('schema 4 upgrade backs up exact projects, views, tags and history before saving schema 9',()=>{
 const dir=mkdtempSync(path.join(tmpdir(),'journal-multitimer-migration-'));try{
  const {service,clock,ids}=setup();service.execute({type:'tag.attach',payload:{id:ids[0],name:'工作'}});service.execute({type:'outline.patch',payload:{id:ids[0],field:'isProject',value:true}});
  service.execute({type:'view.save',payload:{name:'已有视图',filter:emptyFilter()}});service.execute({type:'session.manual',payload:{taskId:ids[0],date:'2026-10-18',minutes:25,summary:'已有投入'}});
  const legacy=structuredClone(service.snapshot().state);legacy.schemaVersion=4;const file=path.join(dir,'journal.sqlite'),oldStore=new SqliteJournalStore(file);oldStore.save(legacy);oldStore.close();
  const upgraded=new JournalService(new SqliteJournalStore(file),clock);assert.deepEqual(upgraded.snapshot().state,{...legacy,schemaVersion:19});upgraded.shutdown();
  const files=readdirSync(path.join(dir,'backups'));assert.equal(files.length,1);assert.match(files[0],/before-schema-4-to-19/);
  const db=new DatabaseSync(path.join(dir,'backups',files[0]),{readOnly:true});try{assert.equal((db.prepare('PRAGMA user_version').get() as {user_version:number}).user_version,4);assert.equal(db.prepare("SELECT data FROM records WHERE kind='sessions'").all().length,1);}finally{db.close();}
 }finally{rmSync(dir,{recursive:true,force:true});}
});
test('tray menus route pause, resume and stop to the item represented by each entry',()=>{
 const {service,start}=setup();const a=start(0).timers[0];start(1);service.execute({type:'focus.pause',payload:{sessionId:a.sessionId}});
 const calls:Command[]=[],menu=timerMenu(service.snapshot(),c=>calls.push(c));assert.match(menu[0].label!,/已暂停.*写作/);assert.match(menu[1].label!,/计时中.*阅读/);
 for(const entry of menu){const submenu=entry.submenu as import('electron').MenuItemConstructorOptions[];for(const item of submenu)if(item.enabled!==false)(item.click as ()=>void)();}
 const [first,second]=service.snapshot().timers;assert.deepEqual(calls,[{type:'focus.resume',payload:{sessionId:first.sessionId}},{type:'focus.stop',payload:{sessionId:first.sessionId}},{type:'focus.pause',payload:{sessionId:second.sessionId}},{type:'focus.stop',payload:{sessionId:second.sessionId,rest:true}},{type:'focus.stop',payload:{sessionId:second.sessionId}}]);
});
