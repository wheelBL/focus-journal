import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readdirSync,rmSync} from 'node:fs';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {JournalService} from '../core/service';
import {SqliteJournalStore} from '../core/store';
import {emptyState,type JournalState,type Recurrence} from '../core/types';
import {nextOccurrence,recurringEvents} from '../core/recurrence';
import {outlineIndex,outlinePath} from '../core/outline';
import {emptyFilter,filterOutline} from '../core/filters';
import {defaultCaptureParent} from '../core/capture-destination';
import {fingerprint,isEmptyJournal,parseSyncDocument,syncDocument} from '../core/sync-data';
process.env.TZ='Asia/Shanghai';
class Store{path='recurrence fixture';state=emptyState();fail=false;load(){return structuredClone(this.state);}save(s:JournalState){if(this.fail)throw Error('disk full');this.state=structuredClone(s);}close(){}}
class Clock{time=Date.parse('2026-01-31T10:00:00+08:00');now=()=>this.time;monotonic=()=>this.time;}
const rule=(extra:Partial<Recurrence>={}):Recurrence=>({mode:'calendar',unit:'day',interval:1,anchor:'2026-01-31',weekdays:[6],until:null,...extra});
function setup(){const store=new Store(),clock=new Clock(),s=new JournalService(store,clock);return {s,clock,store};}
const get=(s:JournalService,id:string)=>s.snapshot().state.tasks.find(t=>t.id===id)!;
const create=(s:JournalService,title:string,parentId:string|null=null,kind='task')=>s.execute({type:'outline.create',payload:{title,parentId,kind}}).state.tasks.at(-1)!.id;
const patch=(s:JournalService,id:string,field:string,value:unknown)=>s.execute({type:'outline.patch',payload:{id,field,value}});
const repeat=(s:JournalService,id:string,r=rule())=>s.execute({type:'recurrence.set',payload:{id,rule:r}});
const complete=(s:JournalService,id:string)=>s.execute({type:'task.status',payload:{id,status:'done'}});

test('Inbox can lose project marker, move, rename, time, filter and recover like another item',()=>{
 const {s,clock}=setup(),child=create(s,'收件工作','inbox'),parent=create(s,'新项目');patch(s,parent,'isProject',true);
 s.execute({type:'focus.start',payload:{taskId:child}});clock.time+=60000;
 patch(s,'inbox','isProject',false);assert.equal(get(s,child).projectId,null);assert.ok(!s.snapshot().state.projects.some(p=>p.id==='inbox'));
 s.execute({type:'outline.move',payload:{id:'inbox',targetId:parent,position:'inside'}});patch(s,'inbox','title','待整理');
 assert.equal(get(s,child).projectId,parent);assert.deepEqual(outlinePath(outlineIndex(s.snapshot().state),child).map(n=>n.title),['新项目','待整理','收件工作']);
 assert.equal(s.snapshot().state.sessions[0].durationMs,60000);assert.ok(filterOutline(s.snapshot().state,{...emptyFilter(),query:'待整理'},s.snapshot().now).matches.has('inbox'));
 s.execute({type:'focus.stop',payload:{taskId:child}});s.execute({type:'focus.start',payload:{taskId:'inbox'}});s.execute({type:'focus.stop',payload:{taskId:'inbox'}});
 s.execute({type:'item.change',payload:{id:'inbox',action:'delete',confirmBranch:true}});assert.equal(defaultCaptureParent(s.snapshot().state),null);
 s.execute({type:'item.change',payload:{id:'inbox',action:'restore'}});assert.equal(defaultCaptureParent(s.snapshot().state),'inbox');
 const copy=new JournalService(new Store(),clock);copy.importJson(s.exportJson());assert.deepEqual(copy.snapshot().state,s.snapshot().state);
});
test('schema 12 Inbox is migrated once with exact backup and stable children/history',()=>{
 const folder=mkdtempSync(path.resolve('qa-data/inbox-migration-'));let service:JournalService|undefined;
 try{const {s}=setup(),child=create(s,'已有任务','inbox');s.execute({type:'session.manual',payload:{taskId:child,date:'2026-01-30',minutes:12}});
  const legacy=s.snapshot().state;legacy.schemaVersion=12;legacy.tasks=legacy.tasks.filter((t:{id:string})=>t.id!=='inbox');
  const file=path.join(folder,'journal.sqlite'),old=new SqliteJournalStore(file);old.save(legacy);old.close();
  service=new JournalService(new SqliteJournalStore(file));assert.equal(service.snapshot().state.schemaVersion,20);assert.equal(get(service,child).parentId,'inbox');assert.deepEqual(service.snapshot().state.sessions,legacy.sessions);
  patch(service,'inbox','isProject',false);service.shutdown();service=new JournalService(new SqliteJournalStore(file));assert.equal(get(service,'inbox').isProject,false);assert.equal(service.snapshot().state.tasks.filter(t=>t.id==='inbox').length,1);
  const backup=path.join(folder,'backups',readdirSync(path.join(folder,'backups')).find(f=>f.startsWith('before-schema-12-to-20-'))!);
  const db=new DatabaseSync(backup,{readOnly:true});try{assert.equal((db.prepare('PRAGMA user_version').get() as any).user_version,12);assert.equal(db.prepare("SELECT id FROM records WHERE kind='tasks' AND id='inbox'").get(),undefined);}finally{db.close();}
 }finally{service?.shutdown();rmSync(folder,{recursive:true,force:true});}
});
test('fixed calendar handles week selections, leap years, original month day, interval and inclusive end',()=>{
 assert.equal(nextOccurrence(rule({unit:'month'}),'2026-01-31'),'2026-02-28');
 assert.equal(nextOccurrence(rule({unit:'month'}),'2026-02-28'),'2026-03-31');
 assert.equal(nextOccurrence(rule({unit:'year',anchor:'2024-02-29'}),'2027-02-28'),'2028-02-29');
 const weekly=rule({unit:'week',anchor:'2026-02-02',interval:2,weekdays:[1,3,5]});
 assert.equal(nextOccurrence(weekly,'2026-02-06'),'2026-02-16');
 assert.equal(nextOccurrence(weekly,'2026-02-16'),'2026-02-18');
 assert.equal(nextOccurrence(rule({until:'2026-02-01'}),'2026-01-31'),'2026-02-01');
 assert.equal(nextOccurrence(rule({until:'2026-02-01'}),'2026-02-01'),null);
});
test('task completion generates a distinct occurrence, preserving effort, tags, body and deadline precision',()=>{
 const {s,clock}=setup(),id=create(s,'月末整理');patch(s,id,'plannedDate','2026-01-31');patch(s,id,'dueAt','2026-02-01');patch(s,id,'description','说明保留');
 s.execute({type:'tag.attach',payload:{id,name:'习惯'}});s.execute({type:'session.manual',payload:{taskId:id,date:'2026-01-31',minutes:20}});repeat(s,id,rule({unit:'month'}));complete(s,id);
 const next=get(s,get(s,id).recurrenceNextId!);assert.equal(next.plannedDate,'2026-02-28');assert.equal(next.dueAt,'2026-03-01');assert.equal(next.startedAt,null);assert.equal(next.description,'说明保留');assert.deepEqual(next.tagIds,get(s,id).tagIds);assert.equal(s.snapshot().state.sessions[0].taskId,id);
 clock.time=Date.parse('2026-02-28T12:00:00+08:00');complete(s,next.id);assert.equal(get(s,get(s,next.id).recurrenceNextId!).plannedDate,'2026-03-31');
 assert.equal(s.snapshot().state.sessions.length,1);
});
test('late calendar completion skips missed slots; completion-relative recurrence starts from actual finish',()=>{
 const {s,clock}=setup(),fixed=create(s,'日历'),relative=create(s,'间隔');
 for(const id of [fixed,relative])patch(s,id,'plannedDate','2026-01-31');
 repeat(s,fixed,rule({unit:'week',weekdays:[6]}));repeat(s,relative,rule({mode:'completion',unit:'week'}));
 clock.time=Date.parse('2026-02-10T12:00:00+08:00');complete(s,fixed);complete(s,relative);
 assert.equal(get(s,get(s,fixed).recurrenceNextId!).plannedDate,'2026-02-14');assert.equal(get(s,get(s,relative).recurrenceNextId!).plannedDate,'2026-02-17');
 const count=s.snapshot().state.tasks.length;complete(s,fixed);assert.equal(s.snapshot().state.tasks.length,count);
 s.execute({type:'task.status',payload:{id:fixed,status:'open'}});complete(s,fixed);assert.equal(s.snapshot().state.tasks.length,count);
});
test('completion undo removes untouched successor, preserves effort, protects an edited successor and rolls back on disk failure',()=>{
 const {s,store}=setup(),id=create(s,'重复任务');repeat(s,id);s.execute({type:'focus.start',payload:{taskId:id}});s.execute({type:'focus.stop',payload:{taskId:id,complete:true}});
 const next=get(s,id).recurrenceNextId!;s.execute({type:'item.undo'});assert.equal(get(s,id).status,'open');assert.equal(get(s,next),undefined);assert.equal(s.snapshot().state.sessions.length,1);
 complete(s,id);patch(s,get(s,id).recurrenceNextId!,'title','开始准备');assert.throws(()=>s.execute({type:'item.undo'}),/已有变化/);assert.equal(get(s,id).status,'done');
 const other=create(s,'失败保护');repeat(s,other);const before=s.exportJson();store.fail=true;assert.throws(()=>complete(s,other),/disk full/);assert.equal(s.exportJson(),before);
});
test('event occurrences project into future calendar without duplicating stored tasks or effort, reminders advance and snooze remains local',()=>{
 const {s,clock}=setup(),id=create(s,'周会',null,'event');
 s.execute({type:'event.save',payload:{id,at:'2026-01-31T01:00:00.000Z',end:'2026-01-31T02:00:00.000Z'}});
 s.execute({type:'item-reminder.set',payload:{id,at:'2026-01-31T00:50:00.000Z'}});repeat(s,id,rule({unit:'week'}));
 const events=recurringEvents(s.snapshot().state.tasks,'2026-02-01','2026-02-28');assert.equal(events.length,4);assert.equal(events[0].eventAt,'2026-02-07T01:00:00.000Z');assert.equal(events[0].eventEnd,'2026-02-07T02:00:00.000Z');
 s.tick();s.execute({type:'item-reminder.snooze',payload:{id}});clock.time+=300000;s.tick();s.execute({type:'item-reminder.dismiss',payload:{id}});
 assert.equal(get(s,id).reminder?.at,'2026-02-07T00:50:00.000Z');assert.equal(get(s,id).reminder?.state,'scheduled');assert.equal(s.snapshot().state.sessions.length,0);assert.equal(s.snapshot().state.tasks.length,2);
 const restored=parseSyncDocument(syncDocument(s.snapshot().state)).state;assert.equal(fingerprint(restored),fingerprint(s.snapshot().state));assert.deepEqual(restored.tasks.find(t=>t.id===id)?.recurrence,get(s,id).recurrence);
});
test('invalid recurrence imports and notes reject atomically; stopping repetition retains history',()=>{
 const {s}=setup(),id=create(s,'事项'),note=create(s,'笔记',null,'note');assert.throws(()=>repeat(s,note),/事项或事件/);
 for(const invalid of [rule({interval:0}),rule({weekdays:[7]}),rule({unit:'week',weekdays:[]}),rule({until:'2026-01-01'})])assert.throws(()=>repeat(s,id,invalid));
 repeat(s,id);const backup=s.exportJson(),bad=JSON.parse(backup);bad.state.tasks.find((t:any)=>t.id===id).recurrence.interval=-1;assert.throws(()=>s.importJson(JSON.stringify(bad)));assert.equal(s.exportJson(),backup);
 s.execute({type:'recurrence.set',payload:{id,rule:null}});complete(s,id);assert.equal(get(s,id).recurrenceNextId,undefined);
 assert.equal(isEmptyJournal(emptyState()),true);const modified=emptyState();modified.tasks[0].isProject=false;assert.equal(isEmptyJournal(modified),false);
});
