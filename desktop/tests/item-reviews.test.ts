import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readdirSync,rmSync} from 'node:fs';
import path from 'node:path';
import {JournalService} from '../core/service';
import {SqliteJournalStore} from '../core/store';
import {emptyState,type JournalState,type ReviewSchedule} from '../core/types';
import {nextReviewDate,reviewQueue,reviewChanges,validateReviewSchedule} from '../core/item-reviews';
import {fingerprint,parseSyncDocument,syncDocument} from '../core/sync-data';

class Store{path='item review tests';state=emptyState();fail=false;load(){return structuredClone(this.state);}save(s:JournalState){if(this.fail)throw new Error('disk full');this.state=structuredClone(s);}close(){}}
class Clock{time=Date.parse('2026-10-19T12:00:00');mono=0;now(){return this.time;}monotonic(){return this.mono;}advance(ms:number){this.time+=ms;this.mono+=ms;}}
const setup=()=>{const clock=new Clock(),store=new Store(),service=new JournalService(store,clock);return {service,store,clock};};
const add=(s:JournalService,title:string,parentId:string|null='inbox')=>s.execute({type:'task.save',payload:{title,parentId}}).state.tasks.at(-1)!.id;
const get=(s:JournalService,id:string)=>s.snapshot().state.tasks.find(t=>t.id===id)!;
const configure=(s:JournalService,id:string,nextDate='2026-10-19',unit:ReviewSchedule['interval']['unit']='weeks',count=1,extra={})=>s.execute({type:'item-review.configure',payload:{id,enabled:true,nextDate,interval:{unit,count},...extra}});
let sequence=0;
const mark=(s:JournalService,id:string,extra={})=>s.execute({type:'item-review.mark',payload:{id,batchId:`batch-${++sequence}`,...extra}});
const change=(s:JournalService,id:string,action:string)=>s.execute({type:'item.change',payload:{id,action,confirmBranch:true}});

test('cycles use the actual review day and clamp monthly targets consistently across leap years and year boundaries',()=>{
 for(const [date,unit,count,expected] of [
  ['2026-10-19','once',1,null],['2026-12-31','days',1,'2027-01-01'],['2026-10-19','weeks',2,'2026-11-02'],
  ['2026-01-31','months',1,'2026-02-28'],['2028-01-31','months',1,'2028-02-29'],['2028-02-29','months',12,'2029-02-28'],
  ['2026-12-31','months',2,'2027-02-28'],['2026-03-31','months',1,'2026-04-30']
 ] as const)assert.equal(nextReviewDate(date,{unit,count}),expected);
 const {service:s}=setup(),id=add(s,'逾期审视');configure(s,id,'2026-10-01');mark(s,id);assert.equal(get(s,id).reviewSchedule!.nextDate,'2026-10-26');
});

test('queue includes today and overdue, keeps paused items and parent/child adjacency without duplicates',()=>{
 const {service:s}=setup(),p=add(s,'父项'),child=add(s,'子项',p),other=add(s,'其他'),future=add(s,'未来');
 configure(s,p,'2026-10-19');configure(s,child,'2026-10-15');configure(s,other,'2026-10-17');configure(s,future,'2026-10-20');change(s,p,'pause');
 const state=s.snapshot().state;assert.deepEqual(reviewQueue(state,'2026-10-19').map(t=>t.id),[p,child,other]);assert.deepEqual(reviewQueue(state,'2026-10-19','upcoming').map(t=>t.id),[future]);assert.equal(reviewQueue(state,'2026-10-19','all').length,4);
});

test('new and migrated items have review off and ordinary opening, editing, ticking and timing do not mark reviewed',()=>{
 const {service:s,clock}=setup(),id=add(s,'正常工作');assert.equal(get(s,id).reviewSchedule,null);configure(s,id);const before=structuredClone(get(s,id).reviewSchedule);
 s.snapshot();s.execute({type:'outline.patch',payload:{id,field:'title',value:'改名'}});s.execute({type:'task.plan',payload:{id,date:'2026-10-22',dueAt:'2026-10-23'}});s.execute({type:'focus.start',payload:{taskId:id}});clock.advance(120000);s.tick();s.execute({type:'focus.stop'});
 assert.deepEqual(get(s,id).reviewSchedule,before);assert.deepEqual(s.snapshot().state.itemReviews,[]);assert.equal(reviewChanges(s.snapshot().state,id),null);
});

test('defer changes only the next date; a mark records once and advances from the actual day',()=>{
 const {service:s}=setup(),id=add(s,'审视');configure(s,id,'2026-10-15','days',3);s.execute({type:'item-review.defer',payload:{id,nextDate:'2026-10-21'}});
 assert.equal(get(s,id).reviewSchedule!.lastReviewedAt,null);assert.equal(get(s,id).reviewSchedule!.interval.count,3);assert.equal(s.snapshot().state.itemReviews.length,0);
 assert.throws(()=>s.execute({type:'item-review.defer',payload:{id,nextDate:'2026-10-18'}}),/今天或之后/);
 mark(s,id,{batchId:'retry-key',note:'还值得继续'});mark(s,id,{batchId:'retry-key',note:'重试'});const state=s.snapshot().state;
 assert.equal(state.itemReviews.length,1);assert.equal(state.itemReviews[0].note,'还值得继续');assert.equal(get(s,id).reviewSchedule!.nextDate,'2026-10-22');assert.equal(get(s,id).reviewSchedule!.lastReviewedAt,state.itemReviews[0].reviewedAt);
});

test('once ends its schedule, undo restores it, and retry of an undone request cannot duplicate history',()=>{
 const {service:s}=setup(),id=add(s,'仅这一次');configure(s,id,'2026-10-19','once');mark(s,id,{batchId:'once'});assert.equal(get(s,id).reviewSchedule!.enabled,false);assert.equal(get(s,id).reviewSchedule!.nextDate,null);assert.equal(reviewQueue(s.snapshot().state,'2026-10-19').length,0);
 s.execute({type:'item-review.undo',payload:{batchId:'once'}});assert.equal(get(s,id).reviewSchedule!.enabled,true);assert.equal(get(s,id).reviewSchedule!.nextDate,'2026-10-19');assert.equal(get(s,id).reviewSchedule!.lastReviewedAt,null);assert.ok(s.snapshot().state.itemReviews[0].undoneAt);
 mark(s,id,{batchId:'once'});assert.equal(s.snapshot().state.itemReviews.length,1);assert.equal(get(s,id).reviewSchedule!.lastReviewedAt,null);
});

test('parent review is independent; an explicit subset of children can be reviewed atomically with distinct cycles',()=>{
 const {service:s}=setup(),p=add(s,'父项'),a=add(s,'子项甲',p),b=add(s,'子项乙',p),outside=add(s,'树外');configure(s,p);configure(s,a,'2026-10-19','days',2);configure(s,b);configure(s,outside);
 mark(s,p);assert.equal(get(s,a).reviewSchedule!.lastReviewedAt,null);assert.equal(get(s,b).reviewSchedule!.lastReviewedAt,null);
 mark(s,p,{childIds:[a],batchId:'explicit'});assert.equal(get(s,a).reviewSchedule!.nextDate,'2026-10-21');assert.equal(get(s,p).reviewSchedule!.nextDate,'2026-10-26');assert.equal(get(s,b).reviewSchedule!.lastReviewedAt,null);
 const before=s.exportJson();assert.throws(()=>mark(s,p,{childIds:[outside]}),/子项/);assert.equal(s.exportJson(),before);
 s.execute({type:'item-review.undo',payload:{batchId:'explicit'}});assert.equal(get(s,a).reviewSchedule!.lastReviewedAt,null);assert.ok(get(s,p).reviewSchedule!.lastReviewedAt);
});

test('put aside and review pause preserve child arrangements and elapsed time; due dates never resume anything',()=>{
 const {service:s,clock}=setup(),p=add(s,'父项'),a=add(s,'子项',p);s.execute({type:'focus.start',payload:{taskId:a}});clock.advance(9000);configure(s,p,'2026-10-19','weeks',1,{pause:true});
 assert.equal(get(s,p).availability,'paused');assert.equal(get(s,a).availability,'active');assert.equal(s.snapshot().timers[0].paused,true);assert.equal(s.snapshot().timers[0].durationMs,9000);assert.equal(s.snapshot().state.itemReviews.length,0);
 clock.advance(7*86400000);s.tick();assert.equal(get(s,p).availability,'paused');assert.equal(s.snapshot().timers[0].paused,true);assert.equal(reviewQueue(s.snapshot().state,'2026-10-26').length,1);
 mark(s,p,{decision:'resume',batchId:'resume'});assert.equal(get(s,p).availability,'active');assert.equal(s.snapshot().timers[0].paused,true);s.execute({type:'focus.resume',payload:{taskId:a}});clock.advance(4000);
 s.execute({type:'item-review.undo',payload:{batchId:'resume'}});assert.equal(get(s,p).availability,'paused');assert.equal(s.snapshot().timers[0].paused,true);assert.equal(s.snapshot().timers[0].durationMs,13000);
});

test('completion and cancellation stop future reviews; reopening does not revive them; lifecycle undo restores arrangements',()=>{
 const {service:s}=setup(),p=add(s,'父项'),a=add(s,'子项',p);configure(s,p);configure(s,a);mark(s,a);const history=structuredClone(s.snapshot().state.itemReviews);
 s.execute({type:'task.status',payload:{id:p,status:'done',children:'cancelled'}});for(const id of [p,a]){assert.equal(get(s,id).reviewSchedule!.enabled,false);assert.equal(get(s,id).reviewSchedule!.nextDate,null);}assert.deepEqual(s.snapshot().state.itemReviews,history);
 s.execute({type:'item.undo'});assert.equal(get(s,p).reviewSchedule!.enabled,true);assert.equal(get(s,a).reviewSchedule!.nextDate,'2026-10-26');
 s.execute({type:'task.status',payload:{id:a,status:'cancelled'}});s.execute({type:'task.status',payload:{id:a,status:'open'}});assert.equal(get(s,a).reviewSchedule!.enabled,false);assert.equal(get(s,a).reviewSchedule!.lastReviewedAt,history[0].reviewedAt);
});

test('move, rename and trash keep schedule/history identity; restore makes due items visible again',()=>{
 const {service:s}=setup(),p=add(s,'父项'),a=add(s,'子项',p),destination=add(s,'目的地');configure(s,a);mark(s,a);s.execute({type:'item-review.defer',payload:{id:a,nextDate:'2026-10-19'}});const schedule=structuredClone(get(s,a).reviewSchedule),logs=structuredClone(s.snapshot().state.itemReviews);
 s.execute({type:'outline.move',payload:{id:p,targetId:destination,position:'inside'}});s.execute({type:'outline.patch',payload:{id:a,field:'title',value:'新名称'}});assert.deepEqual(get(s,a).reviewSchedule,schedule);assert.deepEqual(s.snapshot().state.itemReviews,logs);
 change(s,p,'delete');assert.equal(reviewQueue(s.snapshot().state,'2026-10-19').length,0);change(s,p,'restore');assert.equal(reviewQueue(s.snapshot().state,'2026-10-19')[0].id,a);assert.deepEqual(get(s,a).reviewSchedule,schedule);assert.deepEqual(s.snapshot().state.itemReviews,logs);
});

test('undo refuses to overwrite a newer schedule and a failed mark leaves no partial review or pause',()=>{
 const {service:s,store,clock}=setup(),id=add(s,'不能丢失');configure(s,id);s.execute({type:'focus.start',payload:{taskId:id}});clock.advance(5000);const before=get(s,id).reviewSchedule;store.fail=true;
 assert.throws(()=>mark(s,id,{decision:'pause'}),/disk full/);assert.deepEqual(get(s,id).reviewSchedule,before);assert.equal(get(s,id).availability,'active');assert.equal(s.snapshot().state.itemReviews.length,0);assert.equal(s.snapshot().timers[0].paused,false);store.fail=false;
 mark(s,id,{decision:'pause',batchId:'saved'});s.execute({type:'item-review.defer',payload:{id,nextDate:'2026-11-01'}});assert.throws(()=>s.execute({type:'item-review.undo',payload:{batchId:'saved'}}),/新变化/);assert.equal(get(s,id).reviewSchedule!.nextDate,'2026-11-01');assert.equal(s.snapshot().state.itemReviews[0].undoneAt,null);
});

test('invalid review dates, intervals, imported history and batch children are rejected before changing data',()=>{
 const {service:s}=setup(),id=add(s,'保留');configure(s,id);mark(s,id);const before=s.exportJson();
 for(const interval of [{unit:'days',count:0},{unit:'weeks',count:1.5},{unit:'months',count:121},{unit:'year',count:1}])assert.throws(()=>configure(s,id,'2026-10-19','weeks',1,{interval}));
 assert.throws(()=>configure(s,id,'2026-02-30'));assert.throws(()=>mark(s,id,{childIds:'all'}));assert.throws(()=>validateReviewSchedule({enabled:true,nextDate:null,interval:{unit:'once',count:1},lastReviewedAt:null}));
 for(const mutate of [(v:any)=>v.tasks.filter((t:{id:string})=>t.id!=='inbox')[0].reviewSchedule.nextDate='2026-02-30',(v:any)=>v.itemReviews[0].itemId='missing',(v:any)=>v.itemReviews.push({...v.itemReviews[0],id:'duplicate-batch'}),(v:any)=>v.itemReviews[0].afterSchedule.lastReviewedAt='bad']){const data=JSON.parse(before);mutate(data.state);assert.throws(()=>s.importJson(JSON.stringify(data)));assert.equal(s.exportJson(),before);}
});

test('schema 8 upgrades with backup and no invented review dates or records; local and sync reload preserve new records',()=>{
 const {service:s}=setup(),id=add(s,'旧事项');configure(s,id);mark(s,id,{batchId:'persisted'});const current=s.snapshot().state;
 assert.equal(fingerprint(parseSyncDocument(syncDocument(current)).state),fingerprint(current));const remote=new JournalService(new Store());remote.importSyncedState(parseSyncDocument(syncDocument(current)).state);mark(remote,id,{batchId:'persisted'});assert.equal(remote.snapshot().state.itemReviews.length,1);
 const folder=mkdtempSync(path.resolve('qa-evidence/review-migration-'));try{const legacy=structuredClone(current);legacy.schemaVersion=8;legacy.itemReviews=[];for(const t of legacy.tasks)delete t.reviewSchedule;const file=path.join(folder,'journal.sqlite');const disk=new SqliteJournalStore(file);disk.save(legacy);disk.close();const upgraded=new JournalService(new SqliteJournalStore(file),new Clock());assert.equal(upgraded.snapshot().state.schemaVersion,20);assert.equal(get(upgraded,id).reviewSchedule,null);assert.deepEqual(upgraded.snapshot().state.itemReviews,[]);assert.ok(readdirSync(path.join(folder,'backups')).some(f=>f.startsWith('before-schema-8-to-20-')));
 configure(upgraded,id);mark(upgraded,id,{batchId:'on-disk'});upgraded.shutdown();const reopened=new JournalService(new SqliteJournalStore(file),new Clock());assert.equal(reopened.snapshot().state.itemReviews[0].batchId,'on-disk');assert.equal(get(reopened,id).reviewSchedule!.nextDate,'2026-10-26');reopened.execute({type:'item-review.undo',payload:{batchId:'on-disk'}});assert.equal(get(reopened,id).reviewSchedule!.lastReviewedAt,null);reopened.shutdown();}finally{rmSync(folder,{recursive:true,force:true});}
});
