import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readdirSync} from 'node:fs';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {JournalService} from '../core/service';
import {SqliteJournalStore} from '../core/store';
import {emptyState,type JournalState} from '../core/types';
import {outlineIndex,openDescendants} from '../core/outline';
import {captureItem} from '../core/item-kind';
import {itemSorter,effectiveSort} from '../core/item-order';
import {estimateProgress} from '../core/item-state';
import {emptyFilter,filterOutline} from '../core/filters';
import {condition,group} from '../core/filter-rules';

class Store{path='information test';state=emptyState();load(){return structuredClone(this.state);}save(s:JournalState){this.state=structuredClone(s);}close(){}}
const setup=()=>{const clock={time:Date.parse('2026-10-19T14:00:00+08:00'),now(){return this.time;},monotonic(){return 0;}};return {s:new JournalService(new Store(),clock),clock};};
const add=(s:JournalService,title:string,parentId:string|null='inbox',kind='item')=>s.execute({type:'outline.create',payload:{title,parentId,kind}}).state.tasks.at(-1)!.id;
const patch=(s:JournalService,id:string,field:string,value:unknown)=>s.execute({type:'outline.patch',payload:{id,field,value}});

test('information capture normalizes only the explicit hyphen-space marker and preserves nested data on conversion',()=>{
 assert.deepEqual(captureItem('- 参考资料'),{title:'参考资料',itemType:'note'});assert.equal(captureItem('-a option').itemType,'task');
 const {s}=setup(),parent=add(s,'项目',null,'project'),note=add(s,'- API 参考',parent),child=add(s,'检查示例',note);
 patch(s,note,'description','请求格式\n响应字段');s.execute({type:'tag.attach',payload:{id:note,name:'参考'}});
 assert.equal(outlineIndex(s.snapshot().state).stats.get(note)!.tasks,1);assert.deepEqual(openDescendants(s.snapshot().state,parent).map(t=>t.id),[child]);
 const before=s.snapshot().state.tasks.find(t=>t.id===note)!;patch(s,note,'itemType','task');
 const after=s.snapshot().state.tasks.find(t=>t.id===note)!;assert.equal(after.id,note);assert.equal(after.description,before.description);assert.deepEqual(after.tagIds,before.tagIds);assert.equal(s.snapshot().state.tasks.find(t=>t.id===child)!.parentId,note);
 s.execute({type:'organize.undo'});assert.equal(s.snapshot().state.tasks.find(t=>t.id===note)!.itemType,'note');
 patch(s,note,'itemType','task');s.execute({type:'focus.start',payload:{taskId:note}});assert.throws(()=>s.execute({type:'organize.undo'}),/已有执行安排/);assert.equal(s.snapshot().timers.length,1);s.shutdown();
});
test('notes cannot accrue effort or receive completion, plan, deadline, reminder or estimate; rejection is atomic',()=>{
 const {s}=setup(),id=add(s,'资料',null,'note');
 const commands=[{type:'focus.start',payload:{taskId:id}},{type:'session.manual',payload:{taskId:id,date:'2026-10-19',minutes:20}},{type:'task.status',payload:{id,status:'done'}},{type:'task.plan',payload:{id,date:'2026-10-20'}},{type:'outline.patch',payload:{id,field:'dueAt',value:'2026-10-21'}},{type:'estimate.add',payload:{taskId:id,remainingMinutes:20}},{type:'item-reminder.set',payload:{id,at:'2026-10-21T00:00:00.000Z'}}];
 for(const c of commands){const before=s.exportJson();assert.throws(()=>s.execute(c));assert.equal(s.exportJson(),before);}
 assert.throws(()=>s.execute({type:'outline.create',payload:{title:'- ',parentId:id}}),/填写名称/);s.shutdown();
});
test('notes do not block parent completion, follow whole-branch moves and remain searchable/filterable',()=>{
 const {s}=setup(),parent=add(s,'项目 A',null,'project'),other=add(s,'项目 B',null,'project'),note=add(s,'- 会议信息',parent);
 s.execute({type:'tag.attach',payload:{id:note,name:'会议'}});patch(s,note,'description','设计依据');
 assert.equal(filterOutline(s.snapshot().state,{...emptyFilter(),query:'设计依据'},s.snapshot().now).matches.has(note),true);
 assert.equal(filterOutline(s.snapshot().state,{...emptyFilter(),rules:group([condition('itemType','is','note')])},s.snapshot().now).matches.size,1);
 assert.equal(filterOutline(s.snapshot().state,{...emptyFilter(),view:'actions'},s.snapshot().now).matches.has(note),false);
 s.execute({type:'outline.move',payload:{id:note,targetId:other,position:'inside'}});assert.equal(s.snapshot().state.tasks.find(t=>t.id===note)!.projectId,other);
 s.execute({type:'task.status',payload:{id:other,status:'done'}});assert.equal(s.snapshot().state.tasks.find(t=>t.id===note)!.status,'open');
 const restored=new JournalService(new Store());restored.importJson(s.exportJson());assert.deepEqual(restored.snapshot().state.tasks,s.snapshot().state.tasks);restored.shutdown();s.shutdown();
});
test('automatic order is stable, respects exclusive dates, inherited pause and urgent descendants without rewriting records',()=>{
 const {s}=setup(),free=add(s,'无日期',null),later=add(s,'明日',null),due=add(s,'今天',null),late=add(s,'逾期',null),paused=add(s,'暂停',null),note=add(s,'- 资料',null),done=add(s,'完成',null),branch=add(s,'项目',null),urgent=add(s,'深层逾期',branch);
 patch(s,later,'plannedDate','2026-10-20');patch(s,due,'dueAt','2026-10-20');patch(s,late,'dueAt','2026-10-19');patch(s,urgent,'dueAt','2026-10-18');patch(s,paused,'dueAt','2026-10-17');s.execute({type:'item.change',payload:{id:paused,action:'pause'}});s.execute({type:'task.status',payload:{id:done,status:'done'}});
 const before=s.exportJson(),index=outlineIndex(s.snapshot().state),sort=itemSorter(index,'smart',s.snapshot().now),actual=sort(index.children.get(null)!).filter(n=>n.id!=='inbox').map(n=>n.id);
 assert.deepEqual(actual,[branch,late,due,later,free,paused,note,done]);assert.deepEqual(sort(index.children.get(null)!).map(n=>n.id),sort(index.children.get(null)!).map(n=>n.id));assert.equal(s.exportJson(),before);
 s.execute({type:'view.save',payload:{name:'自动安排',filter:{...emptyFilter(),sort:'smart'}}});assert.equal(effectiveSort(s.snapshot().state.views[0].filter),'smart');assert.equal(effectiveSort(emptyFilter()),'smart');s.shutdown();
});
test('same-time information and undated capture retain creation order and manual mode retains stored sibling order',()=>{
 const {s}=setup(),a=add(s,'后写名称',null),b=add(s,'先写名称',null),n1=add(s,'- 乙',null),n2=add(s,'- 甲',null);
 s.execute({type:'outline.move',payload:{id:b,targetId:a,position:'before'}});
 const index=outlineIndex(s.snapshot().state),roots=index.children.get(null)!.filter(n=>n.id!=='inbox');
 assert.deepEqual(itemSorter(index,'smart',s.snapshot().now)(roots).map(n=>n.id),[a,b,n1,n2]);assert.deepEqual(itemSorter(index,'manual',s.snapshot().now)(roots).map(n=>n.id),[b,a,n1,n2]);s.shutdown();
});
for(const version of [10,11])test(`schema ${version} backup preserves exact old records before upgrading to schema 13`,()=>{
 const {s}=setup();add(s,'旧事项');s.execute({type:'note.add',payload:{text:'旧随手记'}});const old=s.snapshot().state;old.schemaVersion=version;if(version===10)for(const t of old.tasks){delete t.itemType;delete t.updatedAt;}
 const dir=mkdtempSync(path.resolve('qa-evidence/information-migration-')),file=path.join(dir,'journal.sqlite'),store=new SqliteJournalStore(file);store.save(old);store.close();
 const upgraded=new JournalService(new SqliteJournalStore(file));try{assert.equal(upgraded.snapshot().state.schemaVersion,20);assert.equal(upgraded.snapshot().state.tasks.filter((t:{id:string})=>t.id!=='inbox')[0].itemType,'task');assert.deepEqual(upgraded.snapshot().state.notes,old.notes);}finally{upgraded.shutdown();}
 const backup=readdirSync(path.join(dir,'backups')).find(f=>f.startsWith(`before-schema-${version}-to-20-`))!;assert.ok(backup);const db=new DatabaseSync(path.join(dir,'backups',backup),{readOnly:true});try{assert.deepEqual(JSON.parse((db.prepare("SELECT data FROM records WHERE kind='tasks'").get() as {data:string}).data),old.tasks.filter((t:{id:string})=>t.id!=='inbox')[0]);}finally{db.close();s.shutdown();}
});
test('malformed imported note with fabricated session is rejected without replacing the journal',()=>{
 const {s}=setup(),id=add(s,'已投入');s.execute({type:'session.manual',payload:{taskId:id,date:'2026-10-18',minutes:10}});const before=s.exportJson(),backup=JSON.parse(before);backup.state.tasks.filter((t:{id:string})=>t.id!=='inbox')[0].itemType='note';assert.throws(()=>s.importJson(JSON.stringify(backup)),/无效/);assert.equal(s.exportJson(),before);s.shutdown();
});
test('exhausted estimate is distinct from an explicitly entered zero and never changes completion or timer state',()=>{
 const {s}=setup(),id=add(s,'需要重新估计');patch(s,id,'estimateMinutes',25);
 s.execute({type:'session.manual',payload:{taskId:id,date:'2026-10-18',minutes:30}});
 let e=estimateProgress(s.snapshot().state,id);assert.equal(e.remaining,0);assert.equal(e.exhausted,true);assert.equal(e.explicitZero,false);assert.equal(e.overrun,5);assert.equal(e.total,null);
 s.execute({type:'estimate.add',payload:{taskId:id,remainingMinutes:0,reason:'明确确认只剩提交'}});e=estimateProgress(s.snapshot().state,id);assert.equal(e.explicitZero,true);assert.equal(e.exhausted,false);assert.equal(e.initial,25);assert.equal(e.total,30);
 s.execute({type:'focus.start',payload:{taskId:id}});assert.equal(s.snapshot().timers.length,1);assert.equal(s.snapshot().state.tasks.find(t=>t.id===id)!.status,'open');s.shutdown();
});
