import {test} from 'node:test';import assert from 'node:assert/strict';
import {JournalService,parseJournalBackup} from '../core/service';import {emptyState,type JournalState} from '../core/types';
import {filterOutline,emptyFilter} from '../core/filters';import {condition,group,withRules} from '../core/filter-rules';
import {SqliteJournalStore} from '../core/store';import {mkdtempSync,readdirSync} from 'node:fs';import path from 'node:path';
import {syncDocument,parseSyncDocument,fingerprint} from '../core/sync-data';
import {blockedReason} from '../core/item-state';
import {itemPresentations} from '../core/item-presentation';
import {DatabaseSync} from 'node:sqlite';
import {outlineIndex} from '../core/outline';
function setup(){const clock={time:Date.parse('2026-10-31T14:00:00Z'),mono:0,now(){return this.time;},monotonic(){return this.mono;},advance(ms:number){this.time+=ms;this.mono+=ms;}};let state=emptyState(),fail=false;const store={path:'isolated',load:()=>structuredClone(state),save:(s:JournalState)=>{if(fail)throw Error('disk failure');state=structuredClone(s);},close(){}};const service=new JournalService(store,clock,false,'0.29.0');const add=(title:string,parentId:string|null='inbox')=>service.execute({type:'task.save',payload:{title,parentId}}).state.tasks.at(-1)!.id;return {service,clock,add,get:(id:string)=>service.snapshot().state.tasks.find(t=>t.id===id)!,fail:()=>{fail=true;}};}
test('handoff is neither completion nor deletion, stops only explicitly selected timers and preserves effort',()=>{
 const h=setup(),parent=h.add('交付'),child=h.add('仍由我做',parent);h.service.execute({type:'focus.start',payload:{taskId:parent}});h.service.execute({type:'focus.start',payload:{taskId:child}});h.clock.advance(120000);
 assert.throws(()=>h.service.execute({type:'item.handoff',payload:{id:parent,assignee:'张三'}}),/确认/);
 h.service.execute({type:'item.handoff',payload:{id:parent,assignee:'张三',followUp:false,confirmTimers:true}});
 assert.equal(h.get(parent).status,'handed-off');assert.equal(h.get(parent).completedAt,null);assert.equal(h.get(child).ownership,undefined);assert.equal(h.service.snapshot().timers.length,1);assert.equal(h.service.snapshot().state.sessions.find(r=>r.taskId===parent)!.durationMs,120000);
 const actions=filterOutline(h.service.snapshot().state,{...emptyFilter(),view:'actions'},h.service.snapshot().now);assert.equal(actions.matches.has(parent),false);assert.equal(actions.matches.has(child),true);
 const delegated=filterOutline(h.service.snapshot().state,withRules(emptyFilter(),group([condition('responsibility','is','handed-off')])),h.service.snapshot().now);assert.ok(delegated.matches.has(parent));
 h.service.execute({type:'item.undo'});assert.equal(h.get(parent).ownership,undefined);assert.equal(h.service.snapshot().state.sessions.find(r=>r.taskId===parent)!.status,'ended');
});
test('other completion is attributed independently and legacy completed items remain unknown',()=>{
 const h=setup(),id=h.add('交给他人');h.service.execute({type:'item.handoff',payload:{id,assignee:'张三',followUp:true}});h.service.execute({type:'task.status',payload:{id,status:'done'}});assert.equal(h.get(id).completionBy,'other');
 h.service.execute({type:'item.completion',payload:{id,by:'shared'}});assert.equal(h.get(id).completionBy,'shared');h.service.execute({type:'item.undo'});assert.equal(h.get(id).completionBy,'other');
 const backup=JSON.parse(h.service.exportJson());backup.version=17;backup.state.schemaVersion=17;delete backup.state.activities;delete backup.state.tasks.find((t:any)=>t.id===id).completionBy;const restored=parseJournalBackup(JSON.stringify(backup));assert.equal(restored.schemaVersion,19);assert.equal(restored.tasks.find(t=>t.id===id)!.completionBy,undefined);assert.deepEqual(restored.activities,[]);
});
test('follow-up reminder is separate, supports snooze, and reclaim restores the original reminder',()=>{
 const h=setup(),id=h.add('等待资料'),original=new Date(h.clock.time+1000).toISOString();h.service.execute({type:'item-reminder.set',payload:{id,at:original}});
 h.service.execute({type:'item.handoff',payload:{id,assignee:'同事',followUp:true,followUpAt:new Date(h.clock.time+60000).toISOString()}});h.clock.advance(2000);h.service.tick();assert.equal(h.service.reminderSnapshot().alerts.length,0);
 h.clock.advance(60000);h.service.tick();assert.match(h.service.reminderSnapshot().alerts[0].title,/跟进 同事/);h.service.execute({type:'item-reminder.snooze',payload:{id}});assert.equal(h.get(id).ownership!.reminder!.state,'snoozed');assert.equal(h.get(id).reminder!.at,original);
 const changed=new Date(h.clock.time+300000).toISOString();h.service.execute({type:'item-reminder.set',payload:{id,at:changed}});assert.equal(h.get(id).ownership!.reminder!.at,changed);assert.equal(h.get(id).reminder!.at,original);
 h.service.execute({type:'item-reminder.set',payload:{id,at:null}});assert.equal(h.get(id).ownership!.reminder,null);assert.equal(h.get(id).reminder!.at,original);
 h.service.execute({type:'item.reclaim',payload:{id}});assert.equal(h.get(id).ownership,null);h.service.tick();assert.equal(h.get(id).reminder!.state,'pending');
});
test('activity commits with mutations, failed writes and timer ticks never fabricate successful changes',()=>{
 const h=setup(),id=h.add('原名');const n=h.service.snapshot().state.activities!.length;h.service.execute({type:'task.select',payload:{id}});h.clock.advance(20000);h.service.tick();assert.equal(h.service.snapshot().state.activities!.length,n);
 h.service.execute({type:'outline.patch',payload:{id,field:'title',value:'新名'},meta:{source:'ai',entry:'ai.suggestion.apply',aiRunId:'run-1'}});const a=h.service.snapshot().state.activities!.at(-1)!;assert.equal(a.source,'ai');assert.equal(a.aiRunId,'run-1');assert.equal(a.version,'0.29.0');assert.equal(a.changes[0].before,'原名');assert.equal(a.changes[0].after,'新名');
 const before=h.service.exportJson();h.fail();assert.throws(()=>h.service.execute({type:'outline.patch',payload:{id,field:'title',value:'失败名'}}));assert.equal(h.service.exportJson(),before);
});
test('schema 19 backs up old SQLite and preserves activities and ownership through backup and sync without replaying actions',()=>{
 const dir=mkdtempSync(path.resolve('qa-data/ownership-migration-')),file=path.join(dir,'journal.sqlite'),old=emptyState();old.schemaVersion=17;delete old.activities;let store=new SqliteJournalStore(file);store.save(old);store.close();
 store=new SqliteJournalStore(file);const service=new JournalService(store);assert.ok(readdirSync(path.join(dir,'backups')).some(n=>n.includes('17-to-19')));const id=service.execute({type:'task.save',payload:{title:'交接',parentId:'inbox'}}).state.tasks.at(-1)!.id;service.execute({type:'item.handoff',payload:{id,assignee:'张三'}});
 const snapshot=service.snapshot().state,remote=parseSyncDocument(syncDocument(snapshot)).state;assert.equal(fingerprint(remote),fingerprint(snapshot));assert.equal(remote.activities!.length,snapshot.activities!.length);assert.equal(remote.tasks.find(t=>t.id===id)!.ownership!.assignee,'张三');service.shutdown();
 const restored=new JournalService(new SqliteJournalStore(file));assert.equal(restored.snapshot().state.activities!.length,snapshot.activities!.length);restored.shutdown();
});

test('schema 17 migration preserves populated legacy tasks, effort, estimates, reviews and notes exactly',()=>{
 const h=setup();h.clock.time=Date.now()-3600000;const parent=h.add('原有项目'),id=h.add('已有成果',parent);
 h.service.execute({type:'task.save',payload:{id,title:'已有成果',outcome:'保留的旧字段',nextAction:'历史下一步',dueAt:'2026-11-20'}});
 h.service.execute({type:'session.manual',payload:{taskId:id,date:'2026-10-29',minutes:37,summary:'原有投入'}});
 h.service.execute({type:'estimate.add',payload:{taskId:id,remainingMinutes:30,reason:'原始估计历史'}});
 h.service.execute({type:'review.save',payload:{taskId:id,outcome:'原有产出',reason:'复盘',adjustment:'保留调整'}});
 h.service.execute({type:'task.status',payload:{id,status:'done'}});
 const old=structuredClone(h.service.snapshot().state);old.schemaVersion=17;delete old.activities;delete old.tasks.find(t=>t.id===id)!.completionBy;
 old.notes.push({id:'legacy-note',kind:'note',taskId:id,text:'原有随手记录',createdAt:new Date(h.clock.time).toISOString()});h.service.shutdown();
 const file=path.join(mkdtempSync(path.resolve('qa-data/populated-migration-')),'journal.sqlite');let store=new SqliteJournalStore(file);store.save(old);store.close();
 store=new SqliteJournalStore(file);const upgraded=new JournalService(store);const current=upgraded.snapshot().state;
 for(const field of ['tasks','projects','sessions','estimates','reviews','notes','tags','views','moves','audit','deletedSessions','itemReviews'] as const)assert.deepEqual(current[field],old[field],field);
 assert.equal(current.schemaVersion,19);assert.deepEqual(current.activities,[]);assert.equal(current.tasks.find(t=>t.id===id)!.completionBy,undefined);upgraded.shutdown();
});

test('handoff is closed in all unfinished/deadline queues, while follow-up and unselected children stay independent',()=>{
 const h=setup(),parent=h.add('交接关闭'),child=h.add('我继续处理的子项',parent);h.service.execute({type:'task.plan',payload:{id:parent,dueAt:'2026-10-20'}});
 h.service.execute({type:'item.handoff',payload:{id:parent,assignee:'张三',followUp:true,followUpAt:new Date(h.clock.time+1000).toISOString()}});
 const state=h.service.snapshot().state,now=h.service.snapshot().now,index=outlineIndex(state);
 assert.equal(h.get(parent).status,'handed-off');assert.equal(h.get(parent).completedAt,null);assert.equal(h.get(parent).completionBy,undefined);
 for(const filter of [emptyFilter(),{...emptyFilter(),due:'overdue' as const},{...emptyFilter(),view:'actions' as const},withRules(emptyFilter(),group([condition('status','is','open'),condition('dueAt','before',{kind:'relative',anchor:'next-week'})]))])assert.equal(filterOutline(state,filter,now).matches.has(parent),false);
 assert.equal(filterOutline(state,emptyFilter(),now).keep.has(parent),true,'closed parent remains context for its own open child');
 assert.match(blockedReason(index,parent)!,/已交接关闭/);assert.equal(blockedReason(index,child),null);assert.equal(itemPresentations(index,[],now).get(child)!.kind,'waiting');
 assert.throws(()=>h.service.execute({type:'focus.start',payload:{taskId:parent}}),/重新接手/);h.service.execute({type:'focus.start',payload:{taskId:child}});
 h.clock.advance(1001);h.service.tick();assert.match(h.service.reminderSnapshot().alerts.find(a=>a.taskId===parent)!.title,/跟进 张三/);
 h.service.execute({type:'item.reclaim',payload:{id:parent}});assert.equal(h.get(parent).status,'open');assert.equal(h.get(parent).ownership,null);assert.equal(h.service.snapshot().timers.some(t=>t.taskId===parent),false);
});

test('schema 18 delegated items migrate to closed with an exact backup, without inventing completion or offline effort',()=>{
 const h=setup(),id=h.add('旧版已交接');h.service.execute({type:'focus.start',payload:{taskId:id}});h.clock.advance(37000);h.service.execute({type:'focus.pause',payload:{taskId:id}});
 const old=structuredClone(h.service.snapshot().state);old.schemaVersion=18;old.tasks.find(t=>t.id===id)!.ownership={assignee:'同事',at:new Date(h.clock.time).toISOString(),followUp:true,note:'原有交接',reminder:null};
 old.views.push({id:'old-followup',name:'原有跟进视图',filter:withRules(emptyFilter(),group([condition('status','is','open'),condition('responsibility','is','following')]))});
 h.service.shutdown();const file=path.join(mkdtempSync(path.resolve('qa-data/handoff-close-migration-')),'journal.sqlite');let disk=new SqliteJournalStore(file);disk.save(old);disk.close();
 disk=new SqliteJournalStore(file);const service=new JournalService(disk,h.clock),state=service.snapshot().state,task=state.tasks.find(t=>t.id===id)!;
 assert.equal(task.status,'handed-off');assert.equal(task.completedAt,null);assert.equal(task.completionBy,undefined);assert.deepEqual(task.ownership,old.tasks.find(t=>t.id===id)!.ownership);assert.deepEqual(state.activities,old.activities);
 assert.equal(state.sessions[0].status,'ended');assert.equal(state.sessions[0].durationMs,37000);assert.deepEqual(state.sessions[0].segments,old.sessions[0].segments);assert.equal(state.sessions[0].end,old.sessions[0].updatedAt);
 assert.equal(filterOutline(state,state.views.at(-1)!.filter,service.snapshot().now).matches.has(id),true);assert.equal(fingerprint(parseSyncDocument(syncDocument(state)).state),fingerprint(state));
 const backup=readdirSync(path.join(path.dirname(file),'backups')).find(n=>n.includes('18-to-19'))!;assert.ok(backup);const original=new DatabaseSync(path.join(path.dirname(file),'backups',backup),{readOnly:true});try{const raw=original.prepare("SELECT data FROM records WHERE kind='tasks' AND id=?").get(id) as {data:string};assert.equal(JSON.parse(raw.data).status,'open');assert.equal(JSON.parse(raw.data).ownership.assignee,'同事');}finally{original.close();service.shutdown();}
});

test('handoff does not generate recurring successors; actual other completion creates a fresh personal occurrence',()=>{
 const h=setup(),id=h.add('每周交付');h.service.execute({type:'recurrence.set',payload:{id,rule:{mode:'completion',unit:'week',interval:1,anchor:'2026-10-31',weekdays:[],until:null}}});
 h.service.execute({type:'item.handoff',payload:{id,assignee:'同事'}});assert.equal(h.get(id).recurrenceNextId,undefined);
 h.service.execute({type:'task.status',payload:{id,status:'done'}});assert.equal(h.get(id).completionBy,'other');const next=h.get(h.get(id).recurrenceNextId!);assert.equal(next.status,'open');assert.equal(next.ownership,null);assert.equal(next.completionBy,undefined);
});
