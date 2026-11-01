import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readdirSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {JournalService,parseJournalBackup} from '../core/service';
import {SqliteJournalStore} from '../core/store';
import {emptyState,taskMs,type JournalState} from '../core/types';
import {parseSyncDocument,syncDocument} from '../core/sync-data';
import {calendarEntries} from '../src/calendar-layout';
import {dayProgress,todayCandidates} from '../core/today';
import {outlineIndex} from '../core/outline';
import {emptyFilter,filterOutline} from '../core/filters';
import {parseCapture} from '../core/capture';

class Store {path='calendar execution tests';state=emptyState();load(){return structuredClone(this.state);}save(s:JournalState){this.state=structuredClone(s);}close(){}}
function setup(store=new Store()){
 const clock={time:Date.parse('2026-10-21T14:00:00+08:00'),now(){return this.time;},monotonic(){return this.time;}};
 const service=new JournalService(store,clock),add=(title:string,parentId:string|null=null)=>service.execute({type:'task.save',payload:{title,parentId}}).state.tasks.at(-1)!.id;
 const manual=(taskId:string,start='20:30',end='20:31')=>service.execute({type:'session.manual',payload:{taskId,date:'2026-10-19',minutes:1,start:`2026-10-19T${start}`,end:`2026-10-19T${end}`,summary:'记录进展'}}).state.sessions.at(-1)!;
 return {service,clock,add,manual,store};
}

test('calendar semantic creation preserves parent, tags, plan and estimate in the same transaction as effort',()=>{
 const h=setup(),parent=h.add('工作项目'),now=h.service.snapshot().now;
 const draft=parseCapture('整理资料 #工作项目 %资料 明天开始 周五截止 估计50分钟',now).draft;
 const payload={mode:'effort',draft,parentId:null,start:'2026-10-20T09:00:00+08:00',end:'2026-10-20T10:00:00+08:00',summary:'完成整理'};
 const before=h.service.exportJson();assert.throws(()=>h.service.execute({type:'calendar.save',payload:{...payload,start:'2026-10-23T09:00:00+08:00',end:'2026-10-23T10:00:00+08:00'}}),/未来/);assert.equal(h.service.exportJson(),before);
 const state=h.service.execute({type:'calendar.save',payload}).state,item=state.tasks.at(-1)!;
 assert.equal(item.parentId,parent);assert.equal(item.title,'整理资料');assert.equal(item.plannedDate,'2026-10-22');assert.equal(item.dueAt,'2026-10-23');assert.equal(item.estimateMinutes,50);assert.equal(state.tags.find(tag=>item.tagIds!.includes(tag.id))!.name,'资料');assert.equal(state.sessions[0].taskId,item.id);assert.equal(state.sessions[0].durationMs,3600000);
 const rootDraft=parseCapture('最外层记录',now).draft;const root=h.service.execute({type:'calendar.save',payload:{...payload,mode:'reminder',draft:rootDraft,parentId:null}}).state.tasks.at(-1)!;assert.equal(root.parentId,null,'an explicit root is distinct from the default capture parent');
 const saved=h.service.exportJson();assert.throws(()=>h.service.execute({type:'calendar.save',payload:{...payload,draft:parseCapture('- 笔记',now).draft}}),/类型/);assert.equal(h.service.exportJson(),saved);
});

test('nonoverlapping 20:30–20:31 and 20:40–21:17 keep one lane, true duration and original data',()=>{
 const h=setup(),a=h.add('同一事项');h.manual(a);h.manual(a,'20:40','21:17');const state=h.service.snapshot().state,before=JSON.stringify(state);
 for(const scale of [48,72,96]){const blocks=calendarEntries(state,'2026-10-19');assert.equal(blocks.length,2);assert.ok(blocks.every(b=>b.lane===0&&b.lanes===1));assert.ok((blocks[0].top+blocks[0].height)*scale/48<blocks[1].top*scale/48);assert.ok(Math.abs(blocks[0].height-.8)<1e-8);assert.ok(Math.abs(blocks[1].height-29.6)<1e-8);}
 assert.equal(JSON.stringify(state),before);
});
test('genuine overlap still has separate lanes; touching intervals do not overlap and near-midnight reminders stay exact',()=>{
 const h=setup(),a=h.add('事项 A'),b=h.add('事项 B');h.manual(a);h.manual(b,'20:30','20:40');h.manual(b,'20:40','21:17');
 h.service.execute({type:'item-reminder.set',payload:{id:a,at:'2026-10-19T23:59:00'}});
 const entries=calendarEntries(h.service.snapshot().state,'2026-10-19');assert.equal(entries[0].lanes,2);assert.equal(entries[2].lanes,1);assert.equal(entries[3].kind,'reminder');assert.ok(Math.abs(entries[3].top-1151.2)<1e-7);assert.equal(entries[3].height,0);
});
test('deleting and restoring effort updates owner, ancestor and daily totals without deleting the task or its history',()=>{
 const h=setup(),parent=h.add('项目'),id=h.add('事项',parent),record=h.manual(id);h.service.execute({type:'task.status',payload:{id,status:'done'}});
 const original=h.service.snapshot().state.tasks.find(t=>t.id===id)!;
 let s=h.service.execute({type:'session.delete',payload:{id:record.id}}).state;
 assert.equal(taskMs(s,id),0);assert.equal(outlineIndex(s).stats.get(parent)!.totalMs,0);assert.equal(s.tasks.find(t=>t.id===id)!.startedAt,null);assert.equal(s.tasks.find(t=>t.id===id)!.status,'done');assert.equal(s.tasks.find(t=>t.id===id)!.completedAt,original.completedAt);assert.equal(s.deletedSessions[0].id,record.id);assert.deepEqual(s.deletedSessions[0].segments,record.segments);
 assert.equal(dayProgress(s,'2026-10-19').length,0);assert.equal(dayProgress(s,'2026-10-21')[0].completed,true);
 const roundTrip=parseJournalBackup(h.service.exportJson());assert.deepEqual(roundTrip.deletedSessions,s.deletedSessions);assert.deepEqual(parseSyncDocument(syncDocument(s)).state.deletedSessions,s.deletedSessions);
 s=h.service.execute({type:'session.restore',payload:{id:record.id}}).state;assert.equal(taskMs(s,id),60000);assert.equal(s.deletedSessions.length,0);assert.equal(s.sessions[0].id,record.id);assert.equal(s.sessions[0].summary,record.summary);assert.equal(s.tasks.find(t=>t.id===id)!.status,'done');assert.equal(s.audit.length,2);
 assert.throws(()=>h.service.execute({type:'session.restore',payload:{id:record.id}}));assert.equal(taskMs(h.service.snapshot().state,id),60000);
});
test('restoring conflicting effort fails atomically, while live timers cannot be deleted',()=>{
 const h=setup(),id=h.add('事项'),record=h.manual(id);h.service.execute({type:'session.delete',payload:{id:record.id}});h.manual(id,'20:29','20:32');
 const before=h.service.exportJson();assert.throws(()=>h.service.execute({type:'session.restore',payload:{id:record.id}}),/重叠/);assert.equal(h.service.exportJson(),before);
 const running=h.service.execute({type:'focus.start',payload:{taskId:id,skipEstimate:true}}).timers[0];assert.throws(()=>h.service.execute({type:'session.delete',payload:{id:running.sessionId}}),/先结束/);assert.equal(h.service.snapshot().timers.length,1);
});
test('unassigned effort remains unassigned through trash; deleting linked rest evidence preserves the rest clock',()=>{
 const h=setup();h.service.execute({type:'focus.start-unassigned'});h.clock.time+=60000;const stopped=h.service.execute({type:'focus.stop',payload:{rest:true}}),record=stopped.state.sessions[0];
 const s=h.service.execute({type:'session.delete',payload:{id:record.id}}).state;assert.equal(s.settings.breakUntil,stopped.state.settings.breakUntil);assert.equal(s.settings.rest!.sessionId,null);assert.equal(s.deletedSessions[0].taskId,null);assert.doesNotThrow(()=>parseJournalBackup(h.service.exportJson()));
 assert.equal(h.service.execute({type:'session.restore',payload:{id:record.id}}).state.sessions[0].taskId,null);assert.equal(h.service.snapshot().timers.length,0);
});
test('archive validation rejects duplicate IDs, invalid owners and active archived records',()=>{
 const h=setup(),id=h.add('事项'),record=h.manual(id);h.service.execute({type:'session.delete',payload:{id:record.id}});
 for(const mutate of [(s:JournalState)=>{s.deletedSessions.push(s.deletedSessions[0]);},(s:JournalState)=>{s.sessions.push(s.deletedSessions[0]);},(s:JournalState)=>{s.deletedSessions[0].taskId='missing';},(s:JournalState)=>{s.deletedSessions[0].status='running';},(s:JournalState)=>{s.deletedSessions[0].deletedAt='bad';}]){const data=JSON.parse(h.service.exportJson());mutate(data.state);assert.throws(()=>parseJournalBackup(JSON.stringify(data)));}
});
test('schema 15 gets a pre-migration SQLite backup and deleted evidence survives reopen',()=>{
 const folder=mkdtempSync(join(tmpdir(),'focus-schema16-')),file=join(folder,'journal.sqlite');try{
  let store=new SqliteJournalStore(file);const legacy=emptyState();legacy.schemaVersion=15;store.save(legacy);store.close();
  store=new SqliteJournalStore(file);let s=new JournalService(store);assert.equal(s.snapshot().state.schemaVersion,20);assert.ok(readdirSync(join(folder,'backups')).some(n=>n.startsWith('before-schema-15-to-20-')));
  const id=s.execute({type:'task.save',payload:{title:'持久记录',parentId:null}}).state.tasks.at(-1)!.id,record=s.execute({type:'session.manual',payload:{taskId:id,date:'2026-10-19',minutes:12}}).state.sessions[0];s.execute({type:'session.delete',payload:{id:record.id}});s.shutdown();
  s=new JournalService(new SqliteJournalStore(file));assert.equal(s.snapshot().state.deletedSessions[0].id,record.id);assert.equal(s.execute({type:'session.restore',payload:{id:record.id}}).state.sessions[0].durationMs,720000);s.shutdown();
 }finally{rmSync(folder,{recursive:true,force:true});}
});
test('default hides finished work but preserves information; explicit completed filters remain valid',()=>{
 const h=setup(),a=h.add('已完成'),b=h.add('待做'),n=h.add('- 笔记');h.service.execute({type:'task.status',payload:{id:a,status:'done'}});const state=h.service.snapshot().state;
 const f=filterOutline(state,emptyFilter(),h.service.snapshot().now);assert.equal(f.matches.has(a),false);assert.ok(f.matches.has(b));assert.ok(f.matches.has(n));
 const completed=filterOutline(state,{...emptyFilter(),completed:'today'},h.service.snapshot().now);assert.ok(completed.matches.has(a));assert.equal(completed.matches.has(b),false);
});
test('Today chooses actionable leaf work, keeps explicit selection, and excludes future/closed tasks',()=>{
 const h=setup(),parent=h.add('父项目'),child=h.add('可执行子项',parent),future=h.add('未来事项');h.service.execute({type:'task.plan',payload:{id:future,date:'2026-10-30'}});
 const initial=h.service.snapshot().state;initial.settings.selectedTaskId=null;let model=todayCandidates(initial,h.service.snapshot().now);assert.equal(model.available.some(t=>t.id===parent||t.id===future),false);assert.equal(model.next!.id,child);
 h.service.execute({type:'task.select',payload:{id:parent}});assert.equal(todayCandidates(h.service.snapshot().state,h.service.snapshot().now).next!.id,parent);
 h.service.execute({type:'task.status',payload:{id:child,status:'done'}});assert.equal(todayCandidates(h.service.snapshot().state,h.service.snapshot().now).available.some(t=>t.id===child),false);
});
test('progress groups sessions by item, includes completion without time, and retains the latest written summary',()=>{
 const h=setup(),a=h.add('多次推进'),b=h.add('无计时完成');h.manual(a,'20:30','20:31');h.clock.time+=60000;h.manual(a,'20:40','21:17');h.service.execute({type:'session.summary',payload:{id:h.service.snapshot().state.sessions[1].id,summary:'最新推进'}});
 let rows=dayProgress(h.service.snapshot().state,'2026-10-19');assert.equal(rows.length,1);assert.equal(rows[0].minutesMs,38*60000);assert.equal(rows[0].summary,'最新推进');
 h.service.execute({type:'task.status',payload:{id:b,status:'done'}});rows=dayProgress(h.service.snapshot().state,'2026-10-21');assert.equal(rows[0].task!.id,b);assert.equal(rows[0].minutesMs,0);assert.equal(rows[0].completed,true);
});
