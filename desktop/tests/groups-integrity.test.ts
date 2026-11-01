import {test} from 'node:test';
import assert from 'node:assert/strict';
import {JournalService,parseJournalBackup} from '../core/service';
import {emptyState,type JournalState} from '../core/types';
import {outlineIndex} from '../core/outline';
import {itemPresentations} from '../core/item-presentation';
import {emptyFilter,filterOutline} from '../core/filters';
import {condition,group,relative,unfinishedRules,withRules} from '../core/filter-rules';
import {projectReview} from '../core/project-review';
import {periodEffort} from '../core/review';
import {mkdtempSync,readdirSync} from 'node:fs';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {SqliteJournalStore} from '../core/store';

class Store {path='isolated-group-review';state=emptyState();load(){return structuredClone(this.state);}save(s:JournalState){this.state=structuredClone(s);}close(){}}
const create=()=>new JournalService(new Store(),{now:()=>Date.parse('2026-11-01T12:00:00+08:00'),monotonic:()=>0});
const add=(s:JournalService,title:string,parentId:string|null,kind='item')=>s.execute({type:'outline.create',payload:{title,parentId,kind}}).state.tasks.at(-1)!.id;
const patch=(s:JournalService,id:string,field:string,value:unknown)=>s.execute({type:'outline.patch',payload:{id,field,value}});

test('review: deep groups preserve each identity, prevent cycles, and disappear with the final weekly match',()=>{
 const s=create();try{
  const root=add(s,'领域',null,'group');let parent=root;const containers=[root];
  for(let depth=0;depth<40;depth++){parent=add(s,`分类 ${depth}`,parent,'group');containers.push(parent);}
  const task=add(s,'本周工作',parent);patch(s,task,'dueAt','2026-11-02');
  const f=withRules(emptyFilter(),group([condition('status','is','open'),condition('dueAt','before',relative('next-week'))]));
  // Date-only November 2 means before Monday at midnight and belongs to this week.
  const initial=s.snapshot(),result=filterOutline(initial.state,f,initial.now);
  assert.deepEqual([...result.matches],[task]);assert.ok(containers.every(id=>result.keep.has(id)));
  assert.equal(outlineIndex(initial.state).stats.get(root)!.tasks,1);
  const before=s.exportJson();assert.throws(()=>s.execute({type:'outline.move',payload:{id:root,targetId:parent,position:'inside'}}));assert.equal(s.exportJson(),before);
  s.execute({type:'item.handoff',payload:{id:task,assignee:'协作者'}});
  const after=s.snapshot(),closed=filterOutline(after.state,f,after.now);
  assert.equal(closed.matches.size,0);assert.ok(containers.every(id=>!closed.keep.has(id)));
  assert.equal(itemPresentations(outlineIndex(after.state),after.timers,after.now).get(root)!.label,'暂无待办');
  const imported=parseJournalBackup(s.exportJson());assert.deepEqual(imported.tasks,after.state.tasks);
 }finally{s.shutdown();}
});

test('review: converting a category preserves original effort and estimates through undo, restore and export',()=>{
 const s=create();try{
  const p=add(s,'交付项目',null,'project');
  const state=s.execute({type:'task.save',payload:{title:'原来用作分类的事项',parentId:p,estimateMinutes:40}}).state;
  const id=state.tasks.at(-1)!.id,c=add(s,'实际任务',id);
  s.execute({type:'session.manual',payload:{taskId:id,date:'2026-10-31',minutes:10,summary:'分类调整前的投入'}});
  s.execute({type:'session.manual',payload:{taskId:c,date:'2026-10-31',minutes:15,summary:'实际工作'}});
  const original=s.snapshot().state,record=original.sessions.find(x=>x.taskId===id)!;
  patch(s,id,'itemType','group');let current=s.snapshot().state;
  assert.deepEqual(current.sessions,original.sessions);assert.deepEqual(current.estimates,original.estimates);
  assert.equal(current.tasks.find(t=>t.id===c)!.parentId,id);
  assert.equal(current.tasks.find(t=>t.id===id)!.groupHistory?.initialEstimateMinutes,40);
  assert.equal(outlineIndex(current).stats.get(p)!.totalMs,25*60000);
  assert.equal(projectReview(current,'2026-10-31','2026-10-31').find(x=>x.id===p)!.ms,25*60000);
  assert.equal(periodEffort(current.sessions,'2026-10-31','2026-10-31').cumulativeMs,25*60000);
  s.execute({type:'session.delete',payload:{id:record.id}});s.execute({type:'session.restore',payload:{id:record.id}});
  current=s.snapshot().state;assert.equal(current.sessions.find(x=>x.id===record.id)!.durationMs,record.durationMs);
  assert.equal(parseJournalBackup(s.exportJson()).tasks.find(t=>t.id===id)!.itemType,'group');
  patch(s,id,'itemType','task');assert.equal(s.snapshot().state.tasks.find(t=>t.id===id)!.estimateMinutes,40);
  s.execute({type:'organize.undo'});assert.equal(s.snapshot().state.tasks.find(t=>t.id===id)!.itemType,'group');
  assert.equal(s.snapshot().state.sessions.length,original.sessions.length);
 }finally{s.shutdown();}
});

test('review: type and label searches retain empty groups while execution predicates do not fabricate matches',()=>{
 const s=create();try{
  const id=add(s,'空分类',null,'group');s.execute({type:'tag.attach',payload:{id,name:'分类标签'}});
  const snap=s.snapshot(),tagId=snap.state.tasks.find(t=>t.id===id)!.tagIds![0];
  for(const criteria of [condition('itemType','is','group'),condition('tags','any',[tagId]),condition('title','contains','空分类')]){
   const f=withRules(emptyFilter(),group([...unfinishedRules(),criteria]));
   assert.ok(filterOutline(snap.state,f,snap.now).matches.has(id));
  }
  for(const criteria of [condition('status','is','open'),condition('plannedDate','unset'),condition('estimateMinutes','unset')]){
   const f=withRules(emptyFilter(),group([criteria]));assert.ok(!filterOutline(snap.state,f,snap.now).matches.has(id));
  }
  const mixed=withRules({...emptyFilter(),showDone:true},group([condition('itemType','is','group'),condition('status','is','done')],'any'));
  assert.ok(filterOutline(snap.state,mixed,snap.now).matches.has(id));
 }finally{s.shutdown();}
});

test('review: schema 19 migration backs up the old database and changes no business records',()=>{
 const s=create(),root=add(s,'已有分类项目',null,'project'),child=add(s,'已有事项',root);
 s.execute({type:'session.manual',payload:{taskId:child,date:'2026-10-31',minutes:24,summary:'已有投入'}});
 s.execute({type:'tag.attach',payload:{id:child,name:'原标签'}});
 const old=s.snapshot().state;old.schemaVersion=19;s.shutdown();
 const dir=mkdtempSync(path.resolve('qa-evidence/groups-schema19-')),file=path.join(dir,'journal.sqlite');
 const original=new SqliteJournalStore(file);original.save(old);original.close();
 const migrated=new JournalService(new SqliteJournalStore(file));try{
  const now=migrated.snapshot().state;assert.equal(now.schemaVersion,20);
  assert.deepEqual({...now,schemaVersion:19},old);
 }finally{migrated.shutdown();}
 const backup=readdirSync(path.join(dir,'backups')).find(name=>name.startsWith('before-schema-19-to-20-'));assert.ok(backup);
 const db=new DatabaseSync(path.join(dir,'backups',backup!),{readOnly:true});try{
  assert.equal((db.prepare('PRAGMA user_version').get() as {user_version:number}).user_version,19);
  const rows=db.prepare("SELECT data FROM records WHERE kind='sessions'").all() as {data:string}[];
  assert.deepEqual(rows.map(r=>JSON.parse(r.data)),old.sessions);
 }finally{db.close();}
});
