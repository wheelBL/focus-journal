import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readdirSync,rmSync} from 'node:fs';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {JournalService} from '../core/service';
import {SqliteJournalStore} from '../core/store';
import {emptyState,type JournalState} from '../core/types';
import {blockedReason,deadlineConstraint,estimateProgress} from '../core/item-state';
import {outlineIndex} from '../core/outline';
import {emptyFilter,filterOutline} from '../core/filters';
import {condition,group,withRules} from '../core/filter-rules';
import {periodEffort,weekRange} from '../core/review';
import {fingerprint,parseSyncDocument,syncDocument} from '../core/sync-data';
class Store{path='scenario tests';state=emptyState();fail=false;load(){return structuredClone(this.state);}save(s:JournalState){if(this.fail)throw new Error('disk full');this.state=structuredClone(s);}close(){}}
class Clock{time=Date.parse('2026-10-19T12:00:00');mono=0;now(){return this.time;}monotonic(){return this.mono;}advance(ms:number){this.time+=ms;this.mono+=ms;}}
const setup=()=>{const clock=new Clock(),store=new Store(),service=new JournalService(store,clock);return {service,store,clock};};
const add=(s:JournalService,title:string,parentId:string|null='inbox')=>s.execute({type:'task.save',payload:{title,parentId}}).state.tasks.at(-1)!.id;
const change=(s:JournalService,id:string,action:string,confirmBranch=true)=>s.execute({type:'item.change',payload:{id,action,confirmBranch}});
const get=(s:JournalService,id:string)=>s.snapshot().state.tasks.find(t=>t.id===id)!;
const move=(s:JournalService,id:string,targetId:string)=>s.execute({type:'outline.move',payload:{id,targetId,position:'inside'}});

test('capture with title can atomically start, keep estimate unknown and switch without completing previous work',()=>{
 const {service:s,clock,store}=setup(),a=add(s,'先做的事');s.execute({type:'focus.start',payload:{taskId:a}});clock.advance(60000);
 const result=s.execute({type:'task.save',payload:{title:'快速记下并开始',start:true,mode:'switch'}}),b=result.state.tasks.at(-1)!;
 assert.equal(b.estimateMinutes,null);assert.equal(b.parentId,'inbox');assert.equal(b.plannedDate,null);assert.equal(b.dueAt,null);assert.deepEqual(b.tagIds,[]);
 assert.equal(result.timers.length,1);assert.equal(result.timers[0].taskId,b.id);assert.equal(get(s,a).status,'open');assert.equal(result.state.sessions[0].durationMs,60000);assert.equal(result.state.sessions[0].status,'ended');
 const before=s.exportJson();store.fail=true;assert.throws(()=>s.execute({type:'task.save',payload:{title:'不应部分保存',start:true,mode:'switch'}}));assert.equal(s.exportJson(),before);
});

test('a future planned start is optional guidance, not an execution lock or an actual start time',()=>{
 const {service:s}=setup(),id=add(s,'提前做');s.execute({type:'task.plan',payload:{id,date:'2026-10-22',dueAt:'2026-10-23'}});const result=s.execute({type:'focus.start',payload:{taskId:id}});
 assert.equal(get(s,id).plannedDate,'2026-10-22');assert.equal(get(s,id).dueAt,'2026-10-23');assert.equal(result.state.tasks.filter((t:{id:string})=>t.id!=='inbox')[0].startedAt,result.now);assert.equal(blockedReason(outlineIndex(result.state),id),null);
 assert.ok(filterOutline(result.state,withRules(emptyFilter(),group([condition('actionable','is',true)])),result.now).matches.has(id));
});

test('moving a live multi-level branch preserves fields and history, updates ownership, and records reversible moves',()=>{
 const {service:s,clock}=setup(),a=add(s,'项目甲',null),b=add(s,'项目乙',null),parent=add(s,'父项',a),child=add(s,'子项',parent);
 for(const id of [a,b])s.execute({type:'outline.patch',payload:{id,field:'isProject',value:true}});
 s.execute({type:'tag.attach',payload:{id:b,name:'父级标签'}});s.execute({type:'outline.patch',payload:{id:child,field:'description',value:'自己的备注'}});s.execute({type:'task.plan',payload:{id:b,date:null,dueAt:'2026-10-22'}});s.execute({type:'task.plan',payload:{id:child,date:null,dueAt:'2026-10-23'}});
 s.execute({type:'focus.start',payload:{taskId:child}});clock.advance(45000);move(s,parent,b);const state=s.snapshot().state;
 assert.equal(get(s,child).projectId,b);assert.deepEqual(get(s,child).tagIds,[]);assert.equal(get(s,child).description,'自己的备注');assert.equal(state.sessions[0].durationMs,45000);assert.equal(state.sessions[0].status,'running');assert.match(deadlineConstraint(outlineIndex(state),child)!,/晚于父级/);
 assert.ok(state.moves.some(m=>m.itemId===parent&&m.fromProject===a&&m.toProject===b));s.execute({type:'organize.undo'});assert.equal(get(s,parent).parentId,a);assert.equal(get(s,child).projectId,a);assert.equal(s.snapshot().state.sessions[0].durationMs,45000);assert.ok(s.snapshot().state.moves.length>=2);
});

test('parent pause preserves each child arrangement; restoring a parent never auto-resumes timers',()=>{
 const {service:s,clock}=setup(),p=add(s,'父项'),a=add(s,'子项一',p),b=add(s,'子项二',p);change(s,b,'pause');s.execute({type:'focus.start',payload:{taskId:a}});clock.advance(12000);change(s,p,'pause');
 assert.equal(get(s,a).availability,'active');assert.equal(get(s,b).availability,'paused');assert.equal(s.snapshot().timers[0].paused,true);assert.match(blockedReason(outlineIndex(s.snapshot().state),a)!,/父级/);assert.throws(()=>s.execute({type:'focus.resume',payload:{taskId:a}}),/暂停/);
 change(s,p,'resume');assert.equal(get(s,b).availability,'paused');assert.equal(blockedReason(outlineIndex(s.snapshot().state),a),null);assert.equal(s.snapshot().timers[0].paused,true);
 const target=add(s,'暂停目的地');change(s,target,'pause');s.execute({type:'focus.resume',payload:{taskId:a}});assert.throws(()=>move(s,a,target),/先暂停/);assert.equal(get(s,a).parentId,p);
 s.execute({type:'focus.pause',payload:{taskId:a}});move(s,a,target);assert.equal(get(s,a).availability,'active');assert.match(blockedReason(outlineIndex(s.snapshot().state),a)!,/暂停目的地/);
});

test('parent completion/cancellation require explicit descendant choice and save all time atomically; state undo never restarts',()=>{
 const {service:s,clock}=setup(),p=add(s,'父项'),a=add(s,'子项',p);s.execute({type:'focus.start',payload:{taskId:a}});clock.advance(15000);
 assert.throws(()=>s.execute({type:'task.status',payload:{id:p,status:'done'}}),/子事项/);assert.equal(s.snapshot().timers.length,1);
 s.execute({type:'task.status',payload:{id:p,status:'done',children:'cancelled'}});assert.equal(get(s,p).status,'done');assert.equal(get(s,a).status,'cancelled');assert.equal(get(s,a).completedAt,null);assert.equal(s.snapshot().timers.length,0);assert.equal(s.snapshot().state.sessions[0].durationMs,15000);
 s.execute({type:'item.undo'});assert.equal(get(s,p).status,'open');assert.equal(get(s,a).status,'open');assert.equal(s.snapshot().timers.length,0);assert.equal(s.snapshot().state.sessions[0].durationMs,15000);
 const result=s.execute({type:'task.status',payload:{id:a,status:'done'}});assert.equal(get(s,p).status,'open');assert.match(result.itemNotice!,/检查父项/);
});

test('trash preserves the entire branch and records; restore retains a child that was already deleted separately',()=>{
 const {service:s,clock}=setup(),p=add(s,'父项'),a=add(s,'子项',p),b=add(s,'以前删除的子项',p);change(s,b,'delete');const oldTime=get(s,b).deletedAt;clock.advance(1000);s.execute({type:'focus.start',payload:{taskId:a}});clock.advance(9000);
 assert.throws(()=>change(s,p,'delete',false),/确认/);change(s,p,'delete');const state=s.snapshot().state;
 assert.equal(state.tasks.filter((t:{id:string})=>t.id!=='inbox').length,3);assert.equal(state.sessions[0].durationMs,9000);assert.equal(state.sessions[0].status,'ended');assert.equal(filterOutline(state,emptyFilter(),s.snapshot().now).matches.size,1);assert.equal(filterOutline(state,{...emptyFilter(),trash:true},s.snapshot().now).matches.size,3);
 change(s,p,'restore');assert.equal(get(s,p).deletedAt,null);assert.equal(get(s,a).deletedAt,null);assert.equal(get(s,b).deletedAt,oldTime);assert.equal(get(s,a).parentId,p);assert.equal(s.snapshot().timers.length,0);
});

test('remaining estimates retain initial and revision history, subtract later effort and never invent an initial estimate',()=>{
 const {service:s,clock}=setup(),id=add(s,'低估的事');s.execute({type:'outline.patch',payload:{id,field:'estimateMinutes',value:25}});s.execute({type:'focus.start',payload:{taskId:id}});clock.advance(30*60000);s.execute({type:'focus.stop'});s.execute({type:'estimate.add',payload:{taskId:id,remainingMinutes:40,reason:'发现还有异常路径'}});
 assert.equal(estimateProgress(s.snapshot().state,id).total,70);s.execute({type:'focus.start',payload:{taskId:id}});clock.advance(10*60000);s.execute({type:'focus.stop'});let e=estimateProgress(s.snapshot().state,id);assert.equal(e.initial,25);assert.equal(e.remaining,30);assert.equal(e.total,70);assert.equal(e.latest!.remainingMinutes,40);
 const unknown=add(s,'没有初始估计');s.execute({type:'focus.start',payload:{taskId:unknown}});clock.advance(5*60000);s.execute({type:'focus.stop'});s.execute({type:'estimate.add',payload:{taskId:unknown,remainingMinutes:15}});assert.equal(get(s,unknown).estimateMinutes,null);assert.equal(estimateProgress(s.snapshot().state,unknown).total,20);assert.throws(()=>s.execute({type:'outline.patch',payload:{id:unknown,field:'estimateMinutes',value:20}}),/剩余/);
});

test('weekly review splits cross-week segments, counts cancelled effort and separates overlapping coverage from accumulated time',()=>{
 const {service:s}=setup(),a=add(s,'跨周事项'),b=add(s,'并行事项'),c=add(s,'只有总时长');
 for(const [id,start,end] of [[a,'2026-10-18T23:30:00','2026-10-19T00:30:00'],[b,'2026-10-19T00:00:00','2026-10-19T01:00:00']])s.execute({type:'session.manual',payload:{taskId:id,date:'2026-10-19',minutes:60,start,end}});
 s.execute({type:'session.manual',payload:{taskId:c,date:'2026-10-19',minutes:20}});s.execute({type:'task.status',payload:{id:b,status:'cancelled'}});s.execute({type:'task.status',payload:{id:a,status:'done'}});
 const sessions=s.snapshot().state.sessions;assert.deepEqual(weekRange('2026-10-25'),{start:'2026-10-19',end:'2026-10-25'});assert.deepEqual(periodEffort(sessions,'2026-10-19','2026-10-25'),{cumulativeMs:110*60000,coveredMs:60*60000,unplacedMs:20*60000});assert.equal(periodEffort(sessions,'2026-10-12','2026-10-18').coveredMs,30*60000);assert.equal(get(s,b).completedAt,null);
});

test('availability rules include inherited pause, remain distinct from completion and preserve custom deadlines',()=>{
 const {service:s}=setup(),p=add(s,'父项'),c=add(s,'子项',p);change(s,p,'pause');const state=s.snapshot().state;
 const filtered=filterOutline(state,withRules(emptyFilter(),group([condition('availability','is','paused'),condition('status','is','open')])),s.snapshot().now);assert.ok(filtered.matches.has(p));assert.ok(filtered.matches.has(c));assert.equal(get(s,c).availability,'active');
});

test('schema 7 migrates with backup, preserves unknown estimate history and sync snapshot roundtrips new state and move records',()=>{
 const {service:s}=setup(),a=add(s,'事项甲'),b=add(s,'事项乙');move(s,a,b);change(s,b,'pause');s.execute({type:'estimate.add',payload:{taskId:a,remainingMinutes:12}});
 const current=s.snapshot().state;assert.equal(fingerprint(parseSyncDocument(syncDocument(current)).state),fingerprint(current));
 const legacy=structuredClone(current);legacy.schemaVersion=7;delete (legacy as any).moves;for(const t of legacy.tasks){delete t.availability;delete t.deletedAt;}delete legacy.estimates[0].spentMinutes;
 const folder=mkdtempSync(path.resolve('qa-evidence/scenario-migration-'));try{const file=path.join(folder,'journal.sqlite'),store=new SqliteJournalStore(file);store.save({...legacy,moves:[]});store.close();const reopened=new JournalService(new SqliteJournalStore(file));const upgraded=reopened.snapshot().state;assert.equal(upgraded.schemaVersion,19);assert.equal(upgraded.tasks.filter((t:{id:string})=>t.id!=='inbox')[0].id,a);assert.equal(upgraded.tasks.filter((t:{id:string})=>t.id!=='inbox')[0].estimateMinutes,null);assert.equal(upgraded.estimates[0].spentMinutes,undefined);assert.equal(upgraded.tasks.filter((t:{id:string})=>t.id!=='inbox')[0].dueAt,legacy.tasks.filter((t:{id:string})=>t.id!=='inbox')[0].dueAt);reopened.shutdown();const backup=readdirSync(path.join(folder,'backups')).find(f=>f.startsWith('before-schema-7-to-19'));assert.ok(backup);const db=new DatabaseSync(path.join(folder,'backups',backup!),{readOnly:true});assert.equal((db.prepare('PRAGMA user_version').get() as any).user_version,7);db.close();}finally{rmSync(folder,{recursive:true,force:true});}
});

test('new state validation and failed state transactions are atomic and do not leave undo or timer inconsistencies',()=>{
 const {service:s,store,clock}=setup(),a=add(s,'保留');s.execute({type:'focus.start',payload:{taskId:a}});clock.advance(5000);store.fail=true;assert.throws(()=>change(s,a,'pause'));assert.equal(get(s,a).availability,'active');assert.equal(s.snapshot().timers[0].paused,false);assert.equal(s.snapshot().stateUndoLabel,null);store.fail=false;s.execute({type:'focus.stop'});
 const before=s.exportJson();for(const mutation of [(v:any)=>v.tasks.filter((t:{id:string})=>t.id!=='inbox')[0].availability='unknown',(v:any)=>v.tasks.filter((t:{id:string})=>t.id!=='inbox')[0].deletedAt='bad',(v:any)=>v.moves=[{id:'bad',itemId:'missing'}]]){const data=JSON.parse(before);mutation(data.state);assert.throws(()=>s.importJson(JSON.stringify(data)));assert.equal(s.exportJson(),before);}
});
