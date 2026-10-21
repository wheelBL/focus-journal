import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readdirSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {DatabaseSync} from 'node:sqlite';
import {JournalService} from '../core/service';
import {SqliteJournalStore} from '../core/store';
import {emptyState,type JournalState} from '../core/types';
import {compareDeadlines,isDeadlineOverdue} from '../core/deadlines';
import {emptyFilter,filterOutline} from '../core/filters';
import {condition,group,relative,withRules} from '../core/filter-rules';
class Store{path='deadline tests';state=emptyState();fail=false;load(){return structuredClone(this.state);}save(s:JournalState){if(this.fail)throw new Error('disk full');this.state=structuredClone(s);}close(){}}
class Clock{time=Date.parse('2026-10-19T09:00:00');mono=0;now(){return this.time;}monotonic(){return this.mono;}advance(ms:number){this.time+=ms;this.mono+=ms;}}
const setup=()=>{const clock=new Clock(),store=new Store(),service=new JournalService(store,clock);const id=service.execute({type:'task.save',payload:{title:'保留工作记录',estimateMinutes:25}}).state.tasks.filter((t:{id:string})=>t.id!=='inbox')[0].id;return {service,store,clock,id};};
const patch=(service:JournalService,id:string,value:unknown)=>service.execute({type:'outline.patch',payload:{id,field:'dueAt',value}});

test('date deadline excludes its selected day while exact deadlines retain the precise instant',()=>{
 assert.equal(isDeadlineOverdue('2026-10-23','2026-10-22T23:59:59.999'),false);
 assert.equal(isDeadlineOverdue('2026-10-23','2026-10-23T00:00:00'),true);
 assert.equal(isDeadlineOverdue('2026-10-23T12:00:00.000Z','2026-10-23T12:00:00.000Z'),false);
 assert.equal(isDeadlineOverdue('2026-10-23T12:00:00.000Z','2026-10-23T12:00:00.001Z'),true);
 assert.equal(isDeadlineOverdue(null,'2026-10-23T00:00:00'),false);
});

test('all editing commands preserve explicit date precision, and undo leaves running effort intact',()=>{
 const {service,id,clock}=setup();service.execute({type:'task.plan',payload:{id,date:'2026-10-20',dueAt:'2026-10-23'}});
 service.execute({type:'task.save',payload:{id,title:'改名保留截止'}});assert.equal(service.snapshot().state.tasks.filter((t:{id:string})=>t.id!=='inbox')[0].dueAt,'2026-10-23');
 service.execute({type:'focus.start',payload:{taskId:id}});clock.advance(12000);
 const exact='2026-10-23T04:00:00.000Z';patch(service,id,exact);clock.advance(8000);service.execute({type:'organize.undo'});
 assert.equal(service.snapshot().state.tasks.filter((t:{id:string})=>t.id!=='inbox')[0].dueAt,'2026-10-23');assert.equal(service.snapshot().timers[0].durationMs,20000);
 const next=service.execute({type:'task.save',payload:{title:'按日新建',dueAt:'2026-10-26'}}).state.tasks.at(-1)!;assert.equal(next.dueAt,'2026-10-26');
 const other=new JournalService(new Store(),clock);other.importJson(service.exportJson());assert.equal(other.snapshot().state.tasks.filter((t:{id:string})=>t.id!=='inbox')[0].dueAt,'2026-10-23');assert.equal(other.snapshot().timers[0].paused,true);
});

test('before next Monday belongs to this week, before today is overdue, and exact Monday is next week',()=>{
 const {service,id}=setup();patch(service,id,'2026-10-26');
 const second=service.execute({type:'task.save',payload:{title:'周一精确零点',dueAt:new Date('2026-10-26T00:00:00').toISOString()}}).state.tasks.at(-1)!.id;
 const third=service.execute({type:'task.save',payload:{title:'周二前',dueAt:'2026-10-27'}}).state.tasks.at(-1)!.id;
 const fourth=service.execute({type:'task.save',payload:{title:'今天前',dueAt:'2026-10-19'}}).state.tasks.at(-1)!.id;
 const state=service.snapshot().state,now='2026-10-19T09:00:00';
 const matches=(rules:ReturnType<typeof group>,at=now)=>[...filterOutline(state,withRules(emptyFilter(),rules),at).matches];
 assert.deepEqual(matches(group([condition('dueAt','before',relative('next-week'))])).sort(),[id,fourth].sort());
 assert.deepEqual(matches(group([condition('dueAt','period','this-week')])),[id]);
 assert.deepEqual(matches(group([condition('dueAt','period','today')]),'2026-10-25T15:00:00'),[id]);
 assert.deepEqual(matches(group([condition('dueAt','period','today')]),'2026-10-26T15:00:00').sort(),[second,third].sort());
 assert.deepEqual(matches(group([condition('dueAt','before',relative('now'))])),[fourth]);
 assert.deepEqual(matches(group([condition('dueAt','between',{kind:'fixed',date:'2026-10-19'},{kind:'fixed',date:'2026-10-25'})])),[id]);
 assert.deepEqual([...filterOutline(state,{...emptyFilter(),due:'this-week'},now).matches],[id]);
});

test('mixed deadline sorting uses local boundaries instead of comparing dates with UTC text',()=>{
 const precise=new Date('2026-10-23T00:00:00').toISOString();const entries=[null,precise,'2026-10-23',new Date('2026-10-22T23:50:00').toISOString()];
 assert.deepEqual(entries.sort(compareDeadlines),[new Date('2026-10-22T23:50:00').toISOString(),'2026-10-23',precise,null]);
});

test('exclusive date deadlines validate against planned start and invalid writes are atomic',()=>{
 const {service,id,store}=setup();service.execute({type:'task.plan',payload:{id,date:'2026-10-23',dueAt:'2026-10-24'}});const before=service.exportJson();
 for(const command of [
  {type:'outline.patch',payload:{id,field:'dueAt',value:'2026-10-23'}},
  {type:'task.save',payload:{id,title:'不应保存',dueAt:'2026-10-23'}},
  {type:'task.plan',payload:{id,date:'2026-10-23',dueAt:'2026-10-23'}},
  {type:'task.save',payload:{title:'无效新建',plannedDate:'2026-10-23',dueAt:'2026-10-23'}},
  {type:'outline.patch',payload:{id,field:'dueAt',value:'2026-02-30'}}
 ]){assert.throws(()=>service.execute(command));assert.equal(service.exportJson(),before);}
 store.fail=true;assert.throws(()=>patch(service,id,'2026-10-25'),/disk full/);assert.equal(service.exportJson(),before);store.fail=false;
 patch(service,id,null);assert.equal(service.snapshot().state.tasks.filter((t:{id:string})=>t.id!=='inbox')[0].dueAt,null);
});

test('malformed date-only imports cannot replace records; valid dates survive SQLite restart',()=>{
 const {service,id}=setup();patch(service,id,'2026-10-23');const before=service.exportJson();
 for(const value of ['2026-02-30','2026-13-01',{},true]){const data=JSON.parse(before);data.state.tasks.filter((t:{id:string})=>t.id!=='inbox')[0].dueAt=value;assert.throws(()=>service.importJson(JSON.stringify(data)));assert.equal(service.exportJson(),before);}
 const folder=mkdtempSync(path.join(tmpdir(),'journal-date-'));try{
  const file=path.join(folder,'journal.sqlite'),saved=new JournalService(new SqliteJournalStore(file));saved.importJson(before);saved.shutdown();
  const reopened=new JournalService(new SqliteJournalStore(file));assert.equal(reopened.snapshot().state.tasks.filter((t:{id:string})=>t.id!=='inbox')[0].dueAt,'2026-10-23');reopened.shutdown();
 }finally{rmSync(folder,{recursive:true,force:true});}
});

test('schema 6 migration backs up exact timestamps and preserves reminders, views and history',()=>{
 const {service,id}=setup();patch(service,id,'2026-10-23T04:15:00.000Z');const legacy=service.snapshot().state;legacy.schemaVersion=6;
 const folder=mkdtempSync(path.join(tmpdir(),'journal-date-migration-'));try{
  const file=path.join(folder,'journal.sqlite'),store=new SqliteJournalStore(file);store.save(legacy);store.close();
  const upgraded=new JournalService(new SqliteJournalStore(file));assert.deepEqual(upgraded.snapshot().state,{...legacy,schemaVersion:16});upgraded.shutdown();
  const backups=readdirSync(path.join(folder,'backups'));assert.equal(backups.length,1);assert.match(backups[0],/before-schema-6-to-16/);
  const db=new DatabaseSync(path.join(folder,'backups',backups[0]),{readOnly:true});assert.equal((db.prepare('PRAGMA user_version').get() as any).user_version,6);assert.equal(JSON.parse((db.prepare("select data from records where kind='tasks'").get() as any).data).dueAt,'2026-10-23T04:15:00.000Z');db.close();
 }finally{rmSync(folder,{recursive:true,force:true});}
});

test('date-only midnight and day membership stay local across DST and year boundaries',()=>{
 const child=spawnSync(process.execPath,['--import','tsx','--input-type=module','-e',`import assert from 'node:assert/strict';import {deadlineBoundary,deadlineTime,isDeadlineOverdue} from './core/deadlines.ts';import {localDate} from './core/types.ts';assert.equal(new Date(deadlineBoundary('2026-03-09')).toISOString(),'2026-03-09T04:00:00.000Z');assert.equal(localDate(deadlineTime('2026-03-09')),'2026-03-08');assert.equal(localDate(deadlineTime('2027-01-01')),'2026-12-31');assert.equal(isDeadlineOverdue('2026-11-02','2026-11-02T00:00:00'),true);`],{env:{...process.env,TZ:'America/New_York'},encoding:'utf8'});
 assert.equal(child.status,0,child.stderr);
});
