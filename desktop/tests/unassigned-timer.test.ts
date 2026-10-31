import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,readdirSync,readFileSync} from 'node:fs';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {JournalService,parseJournalBackup} from '../core/service';
import {SqliteJournalStore} from '../core/store';
import {emptyState,taskMs,type JournalState} from '../core/types';
import {outlineIndex} from '../core/outline';
import {periodEffort} from '../core/review';
import {projectReview} from '../core/project-review';
import {calendarEntries} from '../src/calendar-layout';
import {timerMenu} from '../electron/timer-menu';
process.env.TZ='Asia/Shanghai';
class Store{path='unassigned tests';state=emptyState();fail=false;load(){return structuredClone(this.state);}save(s:JournalState){if(this.fail)throw Error('disk full');this.state=structuredClone(s);}close(){}}
class Clock{time=Date.parse('2026-10-20T09:00:00+08:00');mono=0;now(){return this.time;}monotonic(){return this.mono;}advance(ms:number){this.time+=ms;this.mono+=ms;}}
function setup(){const clock=new Clock(),store=new Store(),s=new JournalService(store,clock);return {s,clock,store};}
const start=(s:JournalService)=>s.execute({type:'focus.start-unassigned'}).timers.at(-1)!.sessionId;
const stop=(s:JournalService,id:string)=>s.execute({type:'focus.stop',payload:{sessionId:id}}).state.sessions.find(r=>r.id===id)!;
const add=(s:JournalService,title='已有事项')=>s.execute({type:'task.save',payload:{title}}).state.tasks.at(-1)!.id;

test('start without a task; pauses are excluded and original evidence is atomically attached to a new item',()=>{
 const {s,clock}=setup(),before=s.snapshot().state.tasks,id=start(s);
 assert.deepEqual(s.snapshot().state.tasks,before);assert.equal(s.snapshot().timer!.taskId,null);
 clock.advance(120000);s.execute({type:'focus.pause',payload:{sessionId:id}});clock.advance(60000);s.execute({type:'focus.resume',payload:{sessionId:id}});clock.advance(180000);
 const original=stop(s,id);assert.equal(original.durationMs,300000);assert.equal(original.segments.length,2);
 assert.equal(periodEffort([original],'2026-10-20','2026-10-20').cumulativeMs,300000);
 assert.equal(calendarEntries(s.snapshot().state,'2026-10-20',['effort']).length,2);
 const state=s.execute({type:'session.assign',payload:{id,title:'临时排查',summary:'已确定问题位置'}}).state,task=state.tasks.at(-1)!,record=state.sessions[0];
 assert.deepEqual(record,{...original,taskId:task.id,summary:'已确定问题位置',updatedAt:record.updatedAt});
 assert.equal(task.startedAt,original.start);assert.equal(task.estimateMinutes,null);assert.equal(task.plannedDate,null);assert.equal(task.completedAt,null);assert.equal(task.parentId,'inbox');
 assert.equal(taskMs(state,task.id),300000);assert.equal(outlineIndex(state).stats.get('inbox')!.totalMs,300000);
 assert.equal(projectReview(state,'2026-10-20','2026-10-20').find(p=>p.id==='inbox')!.ms,300000);
 assert.deepEqual(JSON.parse(state.audit[0].before),original);
 assert.throws(()=>s.execute({type:'session.assign',payload:{id,title:'重复保存'}}),/已经关联/);assert.equal(s.snapshot().state.tasks.length,before.length+1);
});
test('associate existing completed item without changing plan, estimates or lifecycle; overlap is checked by actual segments',()=>{
 const {s,clock}=setup(),taskId=add(s),id=start(s);clock.advance(60000);s.execute({type:'focus.pause',payload:{sessionId:id}});clock.advance(60000);s.execute({type:'focus.resume',payload:{sessionId:id}});clock.advance(60000);stop(s,id);
 s.execute({type:'session.manual',payload:{taskId,date:'2026-10-20',minutes:1,start:new Date('2026-10-20T09:01').toISOString(),end:new Date('2026-10-20T09:02').toISOString()}});
 s.execute({type:'task.plan',payload:{id:taskId,date:'2026-10-21',dueAt:'2026-10-23'}});
 s.execute({type:'task.status',payload:{id:taskId,status:'done'}});
 const taskBefore=s.snapshot().state.tasks.find(t=>t.id===taskId)!;
 const state=s.execute({type:'session.assign',payload:{id,taskId}}).state,task=state.tasks.find(t=>t.id===taskId)!;
 assert.equal(taskMs(state,taskId),180000);assert.deepEqual(task,{...taskBefore,startedAt:new Date('2026-10-20T09:00').toISOString(),updatedAt:task.updatedAt});
 const other=start(s);clock.advance(60000);stop(s,other);s.execute({type:'session.manual',payload:{taskId,date:'2026-10-20',minutes:1,start:new Date('2026-10-20T09:03').toISOString(),end:new Date('2026-10-20T09:04').toISOString()}});
 assert.throws(()=>s.execute({type:'session.assign',payload:{id:other,taskId}}),/重叠/);assert.equal(s.snapshot().state.sessions.find(r=>r.id===other)!.taskId,null);
});
test('deferred records survive disk reload, recovery, JSON/sync roundtrip and CSV export',()=>{
 const {s,clock,store}=setup(),a=start(s);clock.advance(60000);stop(s,a);s.execute({type:'session.summary',payload:{id:a,summary:'稍后归档'}});
 const b=start(s);clock.advance(30000);s.shutdown();clock.advance(3600000);
 const reload=new JournalService(store,clock);assert.equal(reload.snapshot().timer!.paused,true);assert.equal(reload.snapshot().timer!.durationMs,30000);assert.equal(reload.snapshot().timer!.recovered,true);
 assert.equal(reload.snapshot().state.sessions.find(r=>r.id===a)!.summary,'稍后归档');
 const parsed=parseJournalBackup(reload.exportJson());assert.deepEqual(parsed.sessions,reload.snapshot().state.sessions);
 const replica=setup().s;replica.importSyncedState(parsed);assert.equal(replica.snapshot().timer!.taskId,null);assert.equal(replica.snapshot().timer!.paused,true);
 assert.match(replica.exportCsv(),/未关联事项/);assert.match(replica.exportCsv(),/稍后归档/);
 stop(reload,b);reload.execute({type:'session.assign',payload:{id:a,title:'重启后补充'}});
 assert.doesNotThrow(()=>parseJournalBackup(reload.exportJson()));
});
test('multiple unassigned and owned timers keep independent target reminders, tray actions and focus hints',()=>{
 const {s,clock}=setup(),taskId=add(s);s.execute({type:'focus.start',payload:{taskId,targetMinutes:1}});
 const result=s.execute({type:'focus.start-unassigned',payload:{targetMinutes:1}}),a=result.timers.at(-1)!.sessionId,b=start(s);
 assert.match(result.focusReminder!,/每次只做一件事情/);assert.equal(s.snapshot().timers.length,3);
 assert.throws(()=>s.execute({type:'focus.pause'}),/请选择/);assert.throws(()=>s.execute({type:'focus.pause',payload:{taskId:null}}),/请选择/);
 clock.advance(60000);assert.equal(s.tick().length,2);assert.equal(s.reminderSnapshot().alerts.find(r=>r.sessionId===a)!.title,'未关联事项');
 s.execute({type:'reminder.snooze',payload:{sessionId:a}});clock.advance(300000);s.tick();assert.ok(s.reminderSnapshot().alerts.some(r=>r.sessionId===a));
 const commands:any[]=[],menu=timerMenu(s.snapshot(),c=>commands.push(c));assert.match(menu[1].label!,/未关联事项/);
 const action=(menu[1].submenu as any[]).find(item=>item.label==='结束本次');action.click();assert.deepEqual(commands,[{type:'focus.stop',payload:{sessionId:a}}]);
 stop(s,a);assert.deepEqual(s.snapshot().timers.map(t=>t.sessionId),[result.timers[0].sessionId,b]);assert.ok(s.snapshot().timers[0].durationMs>60000);
});
test('invalid destination, early assignment, disk failure and malformed backups preserve unassigned evidence',()=>{
 const {s,clock,store}=setup(),id=start(s);assert.throws(()=>s.execute({type:'session.assign',payload:{id,title:'还没结束'}}),/先结束/);
 assert.throws(()=>s.execute({type:'focus.stop',payload:{sessionId:id,complete:true}}),/先补充/);clock.advance(1000);stop(s,id);
 const before=s.exportJson();store.fail=true;assert.throws(()=>s.execute({type:'session.assign',payload:{id,title:'写入失败'}}),/disk/);store.fail=false;assert.equal(s.exportJson(),before);
 assert.throws(()=>s.execute({type:'session.assign',payload:{id,title:'无效归属',parentId:'missing'}}));assert.equal(s.exportJson(),before);
 const note=s.execute({type:'outline.create',payload:{title:'纯笔记',kind:'note'}}).state.tasks.at(-1)!;
 assert.throws(()=>s.execute({type:'session.assign',payload:{id,taskId:note.id}}),/请选择/);
 const t=add(s);s.execute({type:'item.change',payload:{id:t,action:'delete'}});assert.throws(()=>s.execute({type:'session.assign',payload:{id,taskId:t}}),/恢复/);
 for(const value of [undefined,'missing']){const bad=JSON.parse(s.exportJson());bad.state.sessions[0].taskId=value;assert.throws(()=>parseJournalBackup(JSON.stringify(bad)),/无效/);}
 const legacy=JSON.parse(s.exportJson());legacy.state.schemaVersion=13;legacy.version=13;assert.throws(()=>parseJournalBackup(JSON.stringify(legacy)),/无效/);
});
test('schema 13 backup preserves every old record before schema 14 opens and persists unassigned sessions',()=>{
 const folder=path.resolve('qa-evidence/release-0.15.0');mkdirSync(folder,{recursive:true});
 const dir=mkdtempSync(path.join(folder,'migration-')),file=path.join(dir,'journal.sqlite'),clock=new Clock(),store=new SqliteJournalStore(file),s=new JournalService(store,clock);
 const taskId=add(s);s.execute({type:'focus.start',payload:{taskId}});clock.advance(60000);stop(s,s.snapshot().timer!.sessionId);
 const legacy=structuredClone(s.snapshot().state);legacy.schemaVersion=13;store.save(legacy);store.close();
 const upgraded=new JournalService(new SqliteJournalStore(file),clock);assert.deepEqual(upgraded.snapshot().state,{...legacy,schemaVersion:19});
 const name=readdirSync(path.join(dir,'backups')).find(n=>n.startsWith('before-schema-13-to-19-'))!;assert.ok(name);
 const db=new DatabaseSync(path.join(dir,'backups',name),{readOnly:true});assert.equal((db.prepare('PRAGMA user_version').get() as any).user_version,13);assert.deepEqual(JSON.parse((db.prepare("SELECT data FROM records WHERE kind='sessions'").get() as any).data),legacy.sessions[0]);db.close();
 const id=start(upgraded);clock.advance(1000);stop(upgraded,id);upgraded.shutdown();const reopened=new JournalService(new SqliteJournalStore(file),clock);assert.equal(reopened.snapshot().state.sessions.at(-1)!.taskId,null);assert.equal(readdirSync(path.join(dir,'backups')).length,1);reopened.shutdown();
});
