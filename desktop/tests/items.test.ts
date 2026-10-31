import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readdirSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {JournalService} from '../core/service';
import {SqliteJournalStore} from '../core/store';
import {outlineIndex,outlinePath} from '../core/outline';
import {emptyFilter,filterOutline,dateMatches} from '../core/filters';
import {condition,group,relative,rulesFor,withRules,datePointTime,validateRules} from '../core/filter-rules';
import {emptyState,type JournalState,type JournalStore,type WorkClock} from '../core/types';

class Store implements JournalStore{path='item-tests';state=emptyState();fail=false;load(){return structuredClone(this.state);}save(s:JournalState){if(this.fail)throw new Error('disk full');this.state=structuredClone(s);}close(){}}
class Clock implements WorkClock{time=Date.parse('2026-10-19T14:00:00+08:00');mono=0;now(){return this.time;}monotonic(){return this.mono;}advance(ms:number){this.time+=ms;this.mono+=ms;}}
function setup(){const store=new Store(),clock=new Clock(),service=new JournalService(store,clock);return {store,clock,service};}
function item(s:JournalService,title:string,parentId:string|null=null){return s.execute({type:'outline.create',payload:{title,parentId,kind:'item'}}).state.tasks.at(-1)!.id;}
function patch(s:JournalService,id:string,field:string,value:unknown){return s.execute({type:'outline.patch',payload:{id,field,value}});}
function tag(s:JournalService,id:string,name:string){s.execute({type:'tag.attach',payload:{id,name}});return s.snapshot().state.tasks.find(t=>t.id===id)!.tagIds!.at(-1)!;}
function undo(s:JournalService){return s.execute({type:'organize.undo'});}

test('schema 3 project migration preserves full records, IDs, hierarchy, descriptions and makes a SQLite backup',()=>{
 const dir=mkdtempSync(path.join(tmpdir(),'unified-migration-'));let current:JournalService|undefined;
 try{
  const {clock,service}=setup(),p=item(service,'项目'),t=item(service,'工作',p),sub=item(service,'子项目',t);
  patch(service,p,'isProject',true);patch(service,p,'description','保留项目说明');patch(service,sub,'isProject',true);
  patch(service,t,'plannedDate','2026-10-19');patch(service,t,'dueAt','2026-10-20T15:30:00+08:00');
  service.execute({type:'session.manual',payload:{taskId:t,date:'2026-10-18',minutes:35,summary:'真实成果'}});
  service.execute({type:'estimate.add',payload:{taskId:t,remainingMinutes:10,reason:'已推进'}});
  service.execute({type:'review.save',payload:{taskId:t,outcome:'完成草稿',reason:'补充调研',adjustment:'拆小'}});
  const legacy=service.snapshot().state;legacy.schemaVersion=3;legacy.tasks=legacy.tasks.filter(t=>!t.isProject);legacy.settings.selectedTaskId=t;
  for(const t of legacy.tasks){delete t.isProject;delete t.archived;delete t.description;delete t.tagIds;}
  const file=path.join(dir,'journal.sqlite'),old=new SqliteJournalStore(file);old.save(legacy);old.close();
  current=new JournalService(new SqliteJournalStore(file),clock);const state=current.snapshot().state;
  assert.equal(state.schemaVersion,19);assert.equal(state.tasks.filter((t:{id:string})=>t.id!=='inbox').length,3);assert.equal(state.tasks.find(t=>t.id===p)!.description,'保留项目说明');
  assert.deepEqual(outlinePath(outlineIndex(state),sub).map(n=>n.id),[p,t,sub]);
  for(const key of ['projects','sessions','notes','estimates','reviews','audit'] as const)assert.deepEqual(state[key],legacy[key]);
  for(const [key,value] of Object.entries(legacy.tasks.filter((t:{id:string})=>t.id!=='inbox')[0]))assert.deepEqual((state.tasks.find(a=>a.id===t) as any)[key],value);
  const backup=new DatabaseSync(path.join(dir,'backups',readdirSync(path.join(dir,'backups'))[0]),{readOnly:true});
  try{assert.equal((backup.prepare('PRAGMA user_version').get() as any).user_version,3);assert.equal((backup.prepare("SELECT count(*) n FROM records WHERE kind='tasks'").get() as any).n,1);}finally{backup.close();}
 }finally{current?.shutdown();rmSync(dir,{recursive:true,force:true});}
});

test('project marker toggles during timing without replacing item or work history; totals count each record once',()=>{
 const {service,clock}=setup(),p=item(service,'根事项'),c=item(service,'子项',p);patch(service,p,'isProject',true);
 service.execute({type:'session.manual',payload:{taskId:c,date:'2026-10-18',minutes:5}});
 service.execute({type:'focus.start',payload:{taskId:p,estimateMinutes:25}});clock.advance(120000);
 const original=service.snapshot().timer!.sessionId;patch(service,p,'isProject',false);
 let state=service.snapshot().state;assert.equal(state.projects.length,1);assert.equal(state.tasks.find(t=>t.id===c)!.projectId,null);
 patch(service,p,'isProject',true);state=service.snapshot().state;assert.equal(service.snapshot().timer!.sessionId,original);
 assert.equal(state.tasks.find(t=>t.id===c)!.projectId,p);const stats=outlineIndex(state).stats.get(p)!;assert.equal(stats.ownMs,120000);assert.equal(stats.totalMs,420000);assert.equal(stats.tasks,2);
 service.execute({type:'focus.stop'});assert.throws(()=>service.execute({type:'task.status',payload:{id:p,status:'done'}}),/子事项/);
 service.execute({type:'task.status',payload:{id:c,status:'done'}});service.execute({type:'task.status',payload:{id:p,status:'done'}});service.execute({type:'task.status',payload:{id:p,status:'open'}});
 assert.equal(service.snapshot().state.tasks.find(t=>t.id===c)!.status,'done');
});

test('custom tags normalize whitespace and case, reuse IDs, never inherit through hierarchy or moves',()=>{
 const {service}=setup(),a=item(service,'A'),b=item(service,'B',a),c=item(service,'C');const id=tag(service,a,'  ＡＩ   调研  ');tag(service,a,'ai 调研');tag(service,c,'AI 调研');
 assert.equal(service.snapshot().state.tags.length,1);assert.deepEqual(service.snapshot().state.tasks.find(t=>t.id===a)!.tagIds,[id]);
 assert.deepEqual(service.snapshot().state.tasks.find(t=>t.id===b)!.tagIds,[]);service.execute({type:'outline.move',payload:{id:b,targetId:c,position:'inside'}});
 assert.deepEqual(service.snapshot().state.tasks.find(t=>t.id===b)!.tagIds,[]);
 for(const name of ['   ','x'.repeat(41)])assert.throws(()=>tag(service,b,name));
});

test('tag rename merges all references and saved filters; undo restores mapping while preserving later work',()=>{
 const {service,clock}=setup(),a=item(service,'A'),b=item(service,'B'),alpha=tag(service,a,'alpha'),beta=tag(service,b,'beta');tag(service,b,'alpha');
 service.execute({type:'view.save',payload:{name:'组合',filter:{...emptyFilter(),tagIds:[alpha,beta]}}});
 service.execute({type:'tag.rename',payload:{id:alpha,name:'BETA'}});
 assert.equal(service.snapshot().state.tags.length,1);assert.deepEqual(service.snapshot().state.views[0].filter.tagIds,[beta]);
 service.execute({type:'focus.start',payload:{taskId:a,skipEstimate:true}});clock.advance(7000);service.execute({type:'focus.stop'});service.execute({type:'task.status',payload:{id:a,status:'done'}});
 const s=undo(service).state;assert.equal(s.tags.length,2);assert.deepEqual(s.tasks.find(t=>t.id===a)!.tagIds,[alpha]);assert.deepEqual(s.views[0].filter.tagIds,[alpha,beta]);assert.equal(s.sessions[0].durationMs,7000);assert.equal(s.tasks.find(t=>t.id===a)!.status,'done');
 const id=s.sessions[0].id;service.execute({type:'tag.delete',payload:{id:alpha}});assert.deepEqual(service.snapshot().state.views[0].filter.tagIds,[beta]);undo(service);assert.equal(service.snapshot().state.sessions[0].id,id);assert.deepEqual(service.snapshot().state.views[0].filter.tagIds,[alpha,beta]);
});

test('detaching is local; deleting is global and undo does not delete a newly saved view reference',()=>{
 const {service}=setup(),a=item(service,'A'),b=item(service,'B'),id=tag(service,a,'自定义');tag(service,b,'自定义');
 service.execute({type:'tag.detach',payload:{id:a,tagId:id}});assert.deepEqual(service.snapshot().state.tasks.find(t=>t.id===b)!.tagIds,[id]);assert.equal(service.snapshot().state.tags.length,1);undo(service);
 service.execute({type:'tag.delete',payload:{id}});assert.equal(service.snapshot().state.tags.length,0);assert.ok(service.snapshot().state.tasks.every(t=>!t.tagIds!.length));undo(service);
 const c=item(service,'C'),newId=tag(service,c,'被视图使用');service.execute({type:'view.save',payload:{name:'新视图',filter:{...emptyFilter(),tagIds:[newId]}}});undo(service);
 assert.ok(service.snapshot().state.tags.some(t=>t.id===newId));assert.deepEqual(service.snapshot().state.tasks.find(t=>t.id===c)!.tagIds,[]);service.importJson(service.exportJson());
});

test('all/any filtering retains ancestor context but never treats ancestor tags as matching child tags',()=>{
 const {service}=setup(),root=item(service,'根'),a=item(service,'A',root),b=item(service,'B',root),x=tag(service,a,'x'),y=tag(service,a,'y');tag(service,b,'x');tag(service,root,'y');const {state,now}=service.snapshot();
 let r=filterOutline(state,{...emptyFilter(),tagIds:[x,y]},now);assert.deepEqual([...r.matches],[a]);assert.deepEqual([...r.keep].sort(),[root,a].sort());
 r=filterOutline(state,{...emptyFilter(),tagIds:[x,y],tagMode:'any'},now);assert.equal(r.matches.size,3);
 r=filterOutline(state,{...emptyFilter(),tagIds:[y],scopeId:a},now);assert.deepEqual([...r.keep],[a]);
});

test('relative saved views re-evaluate today and Monday-Sunday week; edited items remain until selection leaves',()=>{
 const {service,clock}=setup(),a=item(service,'今天'),b=item(service,'明天'),scope=item(service,'范围');patch(service,a,'plannedDate','2026-10-19');patch(service,b,'plannedDate','2026-10-20');
 service.execute({type:'view.save',payload:{name:'今天计划',filter:{...emptyFilter(),planned:'today'}}});let s=service.snapshot(),f=s.state.views[0].filter;
 assert.deepEqual([...filterOutline(s.state,f,s.now).matches],[a]);clock.advance(86400000);s=service.snapshot();assert.deepEqual([...filterOutline(s.state,f,s.now).matches],[b]);
 let result=filterOutline(s.state,f,s.now,a);assert.equal(result.retained,a);assert.ok(result.keep.has(a));assert.ok(!filterOutline(s.state,f,s.now).keep.has(a));
 result=filterOutline(s.state,{...emptyFilter(),scopeId:scope},s.now,b);assert.ok(result.keep.has(b));assert.equal(result.retained,b);
 assert.ok(dateMatches('2026-10-25','this-week',s.now));assert.ok(!dateMatches('2026-10-26','this-week',s.now));assert.ok(!dateMatches('2026-10-18','this-week',s.now));
});

test('completion and deadline filters use actual dates with closed/archived context correctly',()=>{
 const {service,clock}=setup(),a=item(service,'已完成'),b=item(service,'逾期'),p=item(service,'归档'),hidden=item(service,'不显示',p);
 service.execute({type:'task.status',payload:{id:a,status:'done'}});patch(service,b,'dueAt','2026-10-19T12:00:00+08:00');patch(service,p,'isProject',true);service.execute({type:'task.status',payload:{id:hidden,status:'done'}});service.execute({type:'project.archive',payload:{id:p}});
 let s=service.snapshot();assert.deepEqual([...filterOutline(s.state,{...emptyFilter(),completed:'today'},s.now).matches],[a]);assert.deepEqual([...filterOutline(s.state,{...emptyFilter(),due:'overdue'},s.now).matches],[b]);assert.ok(!filterOutline(s.state,emptyFilter(),s.now).keep.has(hidden));
 assert.throws(()=>service.execute({type:'focus.start',payload:{taskId:p,skipEstimate:true}}),/归档/);clock.advance(86400000);s=service.snapshot();assert.equal(filterOutline(s.state,{...emptyFilter(),completed:'today'},s.now).matches.size,0);assert.deepEqual([...filterOutline(s.state,{...emptyFilter(),completed:'this-week'},s.now).matches],[a]);
});

test('undo moves and form edits preserve newer children and a running timer; failed save keeps undo available',()=>{
 const {service,clock,store}=setup(),p=item(service,'原父级'),q=item(service,'新父级'),a=item(service,'原名称',p);
 service.execute({type:'task.save',payload:{id:a,title:'新名称',parentId:q}});const newChild=item(service,'后来添加',a);
 service.execute({type:'focus.start',payload:{taskId:newChild,skipEstimate:true}});clock.advance(9000);store.fail=true;assert.throws(()=>undo(service),/disk full/);store.fail=false;
 const s=undo(service);assert.equal(s.state.tasks.find(t=>t.id===a)!.parentId,p);assert.equal(s.state.tasks.find(t=>t.id===a)!.title,'原名称');assert.equal(s.state.tasks.find(t=>t.id===newChild)!.parentId,a);assert.equal(s.timer!.durationMs,9000);
});

test('malformed tag/view/projection backups cannot replace existing data and valid new data survives SQLite restart',()=>{
 const store=new SqliteJournalStore(':memory:'),service=new JournalService(store,new Clock()),id=item(service,'保留'),tagId=tag(service,id,'标签');service.execute({type:'view.save',payload:{name:'关注',filter:{...emptyFilter(),tagIds:[tagId]}}});const original=service.exportJson();
 for(const mutate of [(s:JournalState)=>s.tags.push({...s.tags[0],id:'duplicate'}),(s:JournalState)=>s.tasks.filter((t:{id:string})=>t.id!=='inbox')[0].tagIds!.push('missing'),(s:JournalState)=>s.views[0].filter.scopeId='missing',(s:JournalState)=>s.tasks.filter((t:{id:string})=>t.id!=='inbox')[0].isProject=true]){const bad=JSON.parse(original);mutate(bad.state);assert.throws(()=>service.importJson(JSON.stringify(bad)));assert.equal(service.exportJson(),original);}
 const reopened=new JournalService(store,new Clock()).snapshot().state;assert.deepEqual(reopened.tags,service.snapshot().state.tags);assert.deepEqual(reopened.views,service.snapshot().state.views);store.close();
});

test('through-week view includes earlier overdue items and Sunday end, excludes next Monday, missing dates and closed items',()=>{
 const {service}=setup(),parent=item(service,'不应计入匹配的父项'),ids:Record<string,string>={};
 for(const [name,due,status] of [['old','2026-10-11T12:00:00','open'],['sunday','2026-10-25T23:59:59.999','open'],['monday','2026-10-26T00:00:00','open'],['none',null,'open'],['done','2026-10-20T12:00:00','done'],['cancelled','2026-10-20T12:00:00','cancelled']] as const){const id=item(service,name,parent);ids[name]=id;if(due)patch(service,id,'dueAt',due);if(status!=='open')service.execute({type:'task.status',payload:{id,status}});}
 const f=withRules(emptyFilter(),group([condition('status','is','open'),condition('dueAt','before',relative('next-week'))]));
 const s=service.snapshot(),r=filterOutline(s.state,f,'2026-10-19T00:00:00');assert.deepEqual([...r.matches],[ids.old,ids.sunday]);assert.ok(r.keep.has(parent));assert.ok(!r.matches.has(parent));
 assert.deepEqual([...filterOutline(s.state,f,'2026-10-25T23:59:59').matches],[ids.old,ids.sunday]);
 assert.deepEqual([...filterOutline(s.state,f,'2026-10-26T00:00:00').matches],[ids.old,ids.sunday,ids.monday]);
});

test('relative boundaries follow local calendar across year/month changes and fixed ranges include their last day',()=>{
 assert.equal(datePointTime(relative('next-week'),'2026-12-31T18:00:00'),Date.parse('2027-01-04T00:00:00'));
 assert.equal(datePointTime(relative('next-month'),'2026-12-31T18:00:00'),Date.parse('2027-01-01T00:00:00'));
 assert.equal(datePointTime(relative('today',7),'2026-03-07T12:00:00'),Date.parse('2026-03-14T00:00:00'));
 const {service}=setup(),a=item(service,'最后一天'),b=item(service,'下一天');patch(service,a,'dueAt','2026-10-25T23:59:59');patch(service,b,'dueAt','2026-10-26T00:00:00');const s=service.snapshot();
 const f=withRules(emptyFilter(),group([condition('dueAt','between',{kind:'fixed',date:'2026-10-19'},{kind:'fixed',date:'2026-10-25'})]));assert.deepEqual([...filterOutline(s.state,f,s.now).matches],[a]);
 const today=withRules(emptyFilter(),group([condition('dueAt','period','today')]));assert.deepEqual([...filterOutline(s.state,today,'2026-10-25T10:00:00').matches],[a]);
});

test('advanced AND/OR conditions compose deadline, tags, scope, own effort and exclusions without counting ancestor effort twice',()=>{
 const {service}=setup(),root=item(service,'工作'),a=item(service,'逾期',root),b=item(service,'紧急',root),c=item(service,'范围外'),d=item(service,'已做完',root);
 const urgent=tag(service,b,'紧急');tag(service,c,'紧急');tag(service,d,'紧急');patch(service,a,'dueAt','2026-10-18T23:00:00');service.execute({type:'task.status',payload:{id:d,status:'done'}});
 service.execute({type:'session.manual',payload:{taskId:b,date:'2026-10-18',minutes:30}});
 const rules=group([condition('status','is','open'),condition('scope','is',root),group([condition('dueAt','before',relative('now')),condition('tags','any',[urgent])],'any')]);
 const s=service.snapshot();assert.deepEqual([...filterOutline(s.state,withRules(emptyFilter(),rules),s.now).matches],[a,b]);
 assert.deepEqual([...filterOutline(s.state,withRules(emptyFilter(),group([condition('actualMinutes','greater',20)])),s.now).matches],[b]);
 assert.ok(!filterOutline(s.state,withRules(emptyFilter(),group([condition('tags','none',[urgent])])),s.now).matches.has(b));
});

test('legacy filters and converted rules give identical results; new saved views update, copy, rename and survive backup/restart',()=>{
 const {service,store,clock}=setup(),a=item(service,'今天'),b=item(service,'未安排');patch(service,a,'plannedDate','2026-10-19');const x=tag(service,a,'x');
 for(const f of [{...emptyFilter(),planned:'through-today' as const},{...emptyFilter(),view:'actions' as const},{...emptyFilter(),tagIds:[x],planned:'today' as const},{...emptyFilter(),completed:'this-week' as const}]){
  const s=service.snapshot();assert.deepEqual([...filterOutline(s.state,f,s.now).matches],[...filterOutline(s.state,withRules(f,rulesFor(f)),s.now).matches]);
 }
 const f=withRules(emptyFilter(),group([condition('plannedDate','period','today')]));service.execute({type:'view.save',payload:{name:'今日',filter:f}});const id=service.snapshot().state.views[0].id;
 service.execute({type:'view.save',payload:{id,name:'每日计划',filter:{...f,sort:'due'}}});service.execute({type:'view.save',payload:{name:'副本',filter:f}});
 const reopened=new JournalService(store,clock);assert.equal(reopened.snapshot().state.views[0].name,'每日计划');assert.equal(reopened.snapshot().state.views[0].filter.sort,'due');reopened.importJson(reopened.exportJson());assert.equal(reopened.snapshot().state.tasks.filter((t:{id:string})=>t.id!=='inbox').length,2);
 clock.advance(86400000);const s=reopened.snapshot();assert.equal(filterOutline(s.state,s.state.views[0].filter,s.now).matches.size,0);
 reopened.execute({type:'view.delete',payload:{id}});assert.equal(reopened.snapshot().state.views.length,1);assert.ok(reopened.snapshot().state.tasks.some(t=>t.id===b));
});

test('tag merge/delete rewrites nested saved rules, prunes emptied groups and undo restores the rules',()=>{
 const {service}=setup(),a=item(service,'A'),x=tag(service,a,'X'),y=tag(service,a,'Y');
 const f=withRules(emptyFilter(),group([condition('status','is','open'),group([condition('tags','any',[x]),condition('title','contains','A')],'any')]));service.execute({type:'view.save',payload:{name:'嵌套',filter:f}});
 service.execute({type:'tag.rename',payload:{id:x,name:'Y'}});let s=service.snapshot();assert.ok(JSON.stringify(s.state.views[0].filter.rules).includes(y));assert.ok(!JSON.stringify(s.state.views[0].filter.rules).includes(x));
 service.execute({type:'tag.delete',payload:{id:y}});s=service.snapshot();assert.ok(!JSON.stringify(s.state.views[0].filter.rules).includes(y));service.importJson(service.exportJson());
 // Import clears undo history; exercise restoration in a fresh mutation.
 const z=tag(service,a,'Z');service.execute({type:'view.save',payload:{name:'仅标签',filter:withRules(emptyFilter(),group([group([condition('tags','all',[z])],'any')]))}});
 service.execute({type:'tag.delete',payload:{id:z}});assert.deepEqual(service.snapshot().state.views.at(-1)!.filter.rules,group());undo(service);assert.ok(JSON.stringify(service.snapshot().state.views.at(-1)!.filter.rules).includes(z));service.importJson(service.exportJson());
});

test('invalid condition backups are rejected atomically, including invalid dates, fields, references and excessive depth',()=>{
 const {service}=setup();item(service,'保留');const original=service.exportJson();let deep=group();for(let i=0;i<12;i++)deep=group([deep]);
 const invalid=[group([condition('dueAt','before',{kind:'fixed',date:'2026-02-31'})]),group([condition('status','is','missing')]),group([condition('tags','all',['missing'])]),group([condition('scope','is','missing')]),group([condition('actualMinutes','between',20,10)]),deep];
 for(const rules of invalid){assert.throws(()=>validateRules(rules,service.snapshot().state));assert.throws(()=>service.execute({type:'view.save',payload:{name:'无效',filter:withRules(emptyFilter(),rules)}}));assert.equal(service.exportJson(),original);}
});
