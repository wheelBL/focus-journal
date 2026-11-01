import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readdirSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {JournalService} from '../core/service';
import {SqliteJournalStore} from '../core/store';
import {calendarBlocks} from '../src/calendar-layout';
import {emptyState,sessionMsOnDate,type JournalStore,type JournalState,type WorkClock} from '../core/types';
process.env.TZ='Asia/Shanghai';
class Clock implements WorkClock {time=Date.parse('2026-10-19T09:00:00+08:00');mono=0;now(){return this.time;}monotonic(){return this.mono;}advance(ms:number){this.time+=ms;this.mono+=ms;}}
class Store implements JournalStore {path='test';state=emptyState();fail=false;load(){return structuredClone(this.state);}save(s:JournalState){if(this.fail)throw new Error('disk full');this.state=structuredClone(s);}close(){}}
function setup(){const store=new Store(),clock=new Clock(),service=new JournalService(store,clock);const snapshot=service.execute({type:'task.save',payload:{title:'设计任务',projectId:'inbox',estimateMinutes:50}});const id=snapshot.state.tasks.filter((t:{id:string})=>t.id!=='inbox')[0].id;return {store,clock,service,id};}
test('target only reminds once, extended work continues until explicit stop',()=>{const {service,clock,id}=setup();service.execute({type:'focus.start',payload:{taskId:id,targetMinutes:25}});clock.advance(25*60000);assert.equal(service.tick().length,1);assert.equal(service.snapshot().timer?.paused,false);assert.equal(service.snapshot().state.tasks.filter((t:{id:string})=>t.id!=='inbox')[0].status,'open');clock.advance(13*60000);assert.equal(service.tick().length,0);const s=service.execute({type:'focus.stop'});assert.equal(s.state.sessions[0].durationMs,38*60000);assert.equal(s.timer,null);assert.equal(s.state.tasks.filter((t:{id:string})=>t.id!=='inbox')[0].status,'open');});
test('pause excludes elapsed idle time and resume creates another segment',()=>{const {service,clock,id}=setup();service.execute({type:'focus.start',payload:{taskId:id}});clock.advance(10*60000);service.execute({type:'focus.pause'});clock.advance(5*60000);assert.equal(service.snapshot().timer?.durationMs,10*60000);service.execute({type:'focus.resume'});clock.advance(2*60000);const s=service.execute({type:'focus.stop',payload:{complete:true}});assert.equal(s.state.sessions[0].durationMs,12*60000);assert.equal(s.state.sessions[0].segments.length,2);assert.equal(s.state.tasks.filter((t:{id:string})=>t.id!=='inbox')[0].status,'done');assert.ok(s.state.tasks.filter((t:{id:string})=>t.id!=='inbox')[0].completedAt);});
test('one active session per item includes paused sessions',()=>{const {service,id}=setup();service.execute({type:'focus.start',payload:{taskId:id}});assert.throws(()=>service.execute({type:'focus.start',payload:{taskId:id}}),/先结束/);service.execute({type:'focus.pause'});assert.throws(()=>service.execute({type:'focus.start',payload:{taskId:id}}),/先结束/);});
test('remaining estimate keeps original and task identity through migration',()=>{const {service,id}=setup();service.execute({type:'estimate.add',payload:{taskId:id,remainingMinutes:40,reason:'异常路径'}});const s=service.execute({type:'task.plan',payload:{id,date:'2026-10-20'}});assert.equal(s.state.tasks.filter((t:{id:string})=>t.id!=='inbox')[0].estimateMinutes,50);assert.equal(s.state.estimates[0].remainingMinutes,40);assert.equal(s.state.tasks.filter((t:{id:string})=>t.id!=='inbox')[0].id,id);assert.equal(s.state.notes[0].kind,'migration');});
test('manual interval validates overlap and future; unknown time stays unplaced',()=>{const {service,clock,id}=setup();clock.advance(3*3600000);service.execute({type:'session.manual',payload:{taskId:id,date:'2026-10-19',minutes:30,start:'2026-10-19T09:00:00+08:00',end:'2026-10-19T09:30:00+08:00'}});assert.throws(()=>service.execute({type:'session.manual',payload:{taskId:id,date:'2026-10-19',minutes:30,start:'2026-10-19T09:20:00+08:00',end:'2026-10-19T09:40:00+08:00'}}),/重叠/);assert.throws(()=>service.execute({type:'session.manual',payload:{taskId:id,date:'2026-10-20',minutes:30}}),/未来/);const s=service.execute({type:'session.manual',payload:{taskId:id,date:'2026-10-18',minutes:20}});assert.equal(s.state.sessions[1].start,null);assert.equal(sessionMsOnDate(s.state.sessions[1],'2026-10-18'),20*60000);});
test('cross-midnight work belongs to the actual days, not all to the start date',()=>{const {service,clock,id}=setup();clock.time=Date.parse('2026-10-19T23:50:00+08:00');service.execute({type:'focus.start',payload:{taskId:id}});clock.advance(30*60000);const s=service.execute({type:'focus.stop'}).state.sessions[0];assert.equal(sessionMsOnDate(s,'2026-10-19'),10*60000);assert.equal(sessionMsOnDate(s,'2026-10-20'),20*60000);});
test('monotonic time prevents wall clock changes from changing effort',()=>{const {service,clock,id}=setup();service.execute({type:'focus.start',payload:{taskId:id}});clock.advance(5*60000);clock.time-=3600000;const s=service.execute({type:'focus.stop'});assert.equal(s.state.sessions[0].durationMs,5*60000);});
test('durable checkpoint recovery pauses without counting offline time',()=>{const {service,clock,store,id}=setup();service.execute({type:'focus.start',payload:{taskId:id}});clock.advance(10000);service.tick();clock.advance(1000);const restarted=new JournalService(store,clock);assert.equal(restarted.snapshot().timer?.durationMs,10000);assert.equal(restarted.snapshot().timer?.paused,true);assert.equal(restarted.snapshot().timer?.recovered,true);clock.advance(3600000);assert.equal(restarted.snapshot().timer?.durationMs,10000);});
test('failed save does not mutate in-memory task state',()=>{const {service,store,id}=setup();store.fail=true;assert.throws(()=>service.execute({type:'task.status',payload:{id,status:'done'}}),/disk full/);assert.equal(service.snapshot().state.tasks.filter((t:{id:string})=>t.id!=='inbox')[0].status,'open');});
test('rest is not work and never automatically starts the next session',()=>{const {service,clock}=setup();service.execute({type:'break.start'});clock.advance(5*60000);assert.equal(service.tick().length,1);assert.equal(service.snapshot().timer,null);assert.equal(service.snapshot().state.sessions.length,0);});
test('SQLite roundtrip persists records and restores a paused session',()=>{const dir=mkdtempSync(path.join(tmpdir(),'focus-journal-test-'));try{const clock=new Clock(),filename=path.join(dir,'journal.sqlite');const store=new SqliteJournalStore(filename),service=new JournalService(store,clock);const id=service.execute({type:'task.save',payload:{title:'持久化测试',estimateMinutes:25}}).state.tasks.filter((t:{id:string})=>t.id!=='inbox')[0].id;service.execute({type:'focus.start',payload:{taskId:id}});clock.advance(15000);service.tick();store.close();const reopened=new JournalService(new SqliteJournalStore(filename),clock);assert.equal(reopened.snapshot().state.tasks.filter((t:{id:string})=>t.id!=='inbox')[0].title,'持久化测试');assert.equal(reopened.snapshot().timer?.durationMs,15000);assert.equal(reopened.snapshot().timer?.paused,true);reopened.shutdown();}finally{rmSync(dir,{recursive:true,force:true});}});
test('backup roundtrip and malformed import rejection preserve original data',()=>{const {service}=setup();const backup=service.exportJson();const other=new JournalService(new Store(),new Clock());other.importJson(backup);assert.equal(other.snapshot().state.tasks.filter((t:{id:string})=>t.id!=='inbox').length,1);assert.throws(()=>other.importJson('{broken'));assert.throws(()=>other.importJson('null'),/不支持|不是支持/);assert.equal(other.snapshot().state.tasks.filter((t:{id:string})=>t.id!=='inbox').length,1);const broken=JSON.parse(backup);broken.state.tasks.filter((t:{id:string})=>t.id!=='inbox')[0].projectId='missing';assert.throws(()=>other.importJson(JSON.stringify(broken)),/无效/);});
test('manual corrections retain original record audit and stable ID',()=>{const {service,id}=setup();let s=service.execute({type:'session.manual',payload:{taskId:id,date:'2026-10-18',minutes:60}});const recordId=s.state.sessions[0].id;s=service.execute({type:'session.manual',payload:{id:recordId,taskId:id,date:'2026-10-18',minutes:40,reason:'扣除离开时间'}});assert.equal(s.state.sessions.length,1);assert.equal(s.state.sessions[0].durationMs,40*60000);assert.equal(JSON.parse(s.state.audit[0].before).durationMs,60*60000);});
test('CSV neutralizes formula-like task names and preserves Unicode',()=>{const {service,id}=setup();service.execute({type:'task.save',payload:{id,title:'=危险公式',projectId:'inbox'}});service.execute({type:'session.manual',payload:{taskId:id,date:'2026-10-18',minutes:5}});assert.ok(service.exportCsv().includes("'=危险公式"));});
test('correcting the earliest interval recalculates dates for both old and new task',()=>{
 const {service,id}=setup();const second=service.execute({type:'task.save',payload:{title:'另一个任务',estimateMinutes:25}}).state.tasks.filter((t:{id:string})=>t.id!=='inbox')[1].id;
 let s=service.execute({type:'session.manual',payload:{taskId:id,date:'2026-10-18',minutes:30,start:'2026-10-18T09:00:00+08:00',end:'2026-10-18T09:30:00+08:00'}});
 const recordId=s.state.sessions[0].id;
 s=service.execute({type:'session.manual',payload:{id:recordId,taskId:second,date:'2026-10-18',minutes:30,start:'2026-10-18T10:00:00+08:00',end:'2026-10-18T10:30:00+08:00',reason:'改正归属与时间'}});
 assert.equal(s.state.tasks.filter((t:{id:string})=>t.id!=='inbox')[0].startedAt,null);assert.equal(s.state.tasks.filter((t:{id:string})=>t.id!=='inbox')[1].startedAt,'2026-10-18T02:00:00.000Z');
});
test('clock rollback does not suppress durable checkpoints',()=>{
 const {service,clock,store,id}=setup();service.execute({type:'focus.start',payload:{taskId:id}});clock.advance(12000);clock.time-=3600000;service.tick();assert.equal(store.state.sessions[0].durationMs,12000);
});
test('restore validates nested content and totals before replacing existing data',()=>{
 const {service,id}=setup();service.execute({type:'session.manual',payload:{taskId:id,date:'2026-10-18',minutes:30,start:'2026-10-18T09:00:00+08:00',end:'2026-10-18T09:30:00+08:00'}});
 const backup=service.exportJson();
 for(const mutate of [
  (s:JournalState)=>{s.sessions[0].durationMs+=60000;},
  (s:JournalState)=>{s.settings.selectedTaskId='missing';},
  (s:JournalState)=>{s.settings.breakUntil='invalid';},
  (s:JournalState)=>{s.audit.push({id:'bad',entityId:s.sessions[0].id,before:'{broken',reason:'校正',createdAt:s.sessions[0].updatedAt});},
  (s:JournalState)=>{s.notes.push({id:'bad',kind:'note',taskId:'missing',text:'想法',createdAt:s.sessions[0].updatedAt});}
 ]){const broken=JSON.parse(backup);mutate(broken.state);assert.throws(()=>service.importJson(JSON.stringify(broken)));assert.equal(service.exportJson(),backup);}
});

test('calendar preserves true short duration and does not invent overlap between adjacent segments',()=>{const {service,clock,id}=setup();service.execute({type:'focus.start',payload:{taskId:id}});clock.advance(10000);service.execute({type:'focus.pause'});clock.advance(10000);service.execute({type:'focus.resume'});clock.advance(10000);const sessions=service.execute({type:'focus.stop'}).state.sessions;const blocks=calendarBlocks(sessions,'2026-10-19');assert.equal(blocks.length,2);assert.equal(blocks[0].lanes,1);assert.equal(blocks[0].lane,blocks[1].lane);assert.ok(blocks[0].top+blocks[0].height<blocks[1].top);assert.equal(blocks[0].session.durationMs,20000);assert.ok(blocks[1].top>blocks[0].top);assert.equal(calendarBlocks(sessions,'2026-10-20').length,0);});

test('planned start and deadline stay independent from actual timing and survive tree moves',()=>{
 const {service,clock,id}=setup();const due='2026-10-21T10:30:00.000Z';
 service.execute({type:'task.plan',payload:{id,date:'2026-10-20',dueAt:due}});
 service.execute({type:'focus.start',payload:{taskId:id}});clock.advance(61000);service.execute({type:'focus.stop'});
 const project=service.execute({type:'outline.create',payload:{kind:'project',title:'另一项目',parentId:null}}).state.projects.at(-1)!;
 let s=service.execute({type:'outline.move',payload:{id,targetId:project.id,position:'inside'}}).state;
 assert.equal(s.tasks.filter((t:{id:string})=>t.id!=='inbox')[0].plannedDate,'2026-10-20');assert.equal(s.tasks.filter((t:{id:string})=>t.id!=='inbox')[0].dueAt,due);assert.equal(s.tasks.filter((t:{id:string})=>t.id!=='inbox')[0].startedAt,'2026-10-19T01:00:00.000Z');assert.equal(s.sessions[0].durationMs,61000);
 s=service.execute({type:'outline.undo'}).state;assert.equal(s.tasks.filter((t:{id:string})=>t.id!=='inbox')[0].dueAt,due);
 const other=new JournalService(new Store(),clock);other.importJson(service.exportJson());assert.equal(other.snapshot().state.tasks.filter((t:{id:string})=>t.id!=='inbox')[0].dueAt,due);
});
test('deadline and planned start validation is atomic across every edit entry point',()=>{
 const {service,id}=setup();service.execute({type:'task.plan',payload:{id,date:'2026-10-20',dueAt:'2026-10-21T10:30:00.000Z'}});
 const before=service.exportJson();for(const command of [
  {type:'outline.patch',payload:{id,field:'dueAt',value:'2026-10-19T10:00:00.000Z'}},
  {type:'outline.patch',payload:{id,field:'plannedDate',value:'2026-10-22'}},
  {type:'task.plan',payload:{id,date:'2026-10-22'}},
  {type:'task.save',payload:{id,title:'不应保存',plannedDate:'2026-10-22'}},
  {type:'task.save',payload:{title:'不应创建',plannedDate:'2026-10-22',dueAt:'2026-10-21T10:00:00.000Z'}}
 ]){assert.throws(()=>service.execute(command),/截止时间/);assert.equal(service.exportJson(),before);}
 assert.throws(()=>service.execute({type:'outline.patch',payload:{id,field:'dueAt',value:'invalid'}}),/时间无效/);assert.equal(service.exportJson(),before);
 const state=service.execute({type:'task.plan',payload:{id,date:null,dueAt:null}}).state;assert.equal(state.tasks.filter((t:{id:string})=>t.id!=='inbox')[0].plannedDate,null);assert.equal(state.tasks.filter((t:{id:string})=>t.id!=='inbox')[0].dueAt,null);
});
test('simplified task editing preserves hidden legacy fields and original estimates',()=>{
 const {service,id}=setup();service.execute({type:'task.save',payload:{id,title:'原名称',outcome:'已有预期',nextAction:'已有下一步',dueAt:'2026-10-22T09:00:00.000Z'}});
 const s=service.execute({type:'task.save',payload:{id,title:'改名',estimateMinutes:90,plannedDate:'2026-10-21'}}).state;
 assert.equal(s.tasks.filter((t:{id:string})=>t.id!=='inbox')[0].outcome,'已有预期');assert.equal(s.tasks.filter((t:{id:string})=>t.id!=='inbox')[0].nextAction,'已有下一步');assert.equal(s.tasks.filter((t:{id:string})=>t.id!=='inbox')[0].dueAt,'2026-10-22T09:00:00.000Z');assert.equal(s.tasks.filter((t:{id:string})=>t.id!=='inbox')[0].estimateMinutes,50);
});
test('malformed deadline in a backup cannot replace existing records',()=>{
 const {service}=setup(),before=service.exportJson();for(const value of ['invalid','2026-10-19T09:00:00+08:00',42]){const data=JSON.parse(before);data.state.tasks.filter((t:{id:string})=>t.id!=='inbox')[0].dueAt=value;assert.throws(()=>service.importJson(JSON.stringify(data)));assert.equal(service.exportJson(),before);}
});
for(const version of [1,2] as const)test(`schema ${version} upgrades with a complete pre-migration SQLite backup`,()=>{
 const dir=mkdtempSync(path.join(tmpdir(),'journal-migration-'));try{
  const {service,clock,id}=setup();service.execute({type:'task.plan',payload:{id,date:'2026-10-20'}});service.execute({type:'session.manual',payload:{taskId:id,date:'2026-10-18',minutes:25,summary:'原有投入'}});service.execute({type:'estimate.add',payload:{taskId:id,remainingMinutes:30,reason:'保留历史'}});service.execute({type:'review.save',payload:{taskId:id,outcome:'已完成一部分',reason:'有遗漏',adjustment:'下次多留余量'}});
  const legacy=structuredClone(service.snapshot().state);legacy.schemaVersion=version;legacy.tasks=legacy.tasks.filter((t:{id:string})=>t.id!=='inbox');
  for(const task of legacy.tasks){delete task.dueAt;if(version===1){delete task.parentId;delete task.order;}}
  if(version===1)for(const project of legacy.projects){delete project.parentId;delete project.order;}
  const file=path.join(dir,'journal.sqlite'),oldStore=new SqliteJournalStore(file);oldStore.save(legacy);oldStore.close();
  const upgraded=new JournalService(new SqliteJournalStore(file),clock),state=upgraded.snapshot().state;assert.equal(state.schemaVersion,20);
  for(const kind of ['sessions','notes','estimates','reviews','audit'] as const)assert.deepEqual(state[kind],legacy[kind]);
  for(const original of [...legacy.projects,...legacy.tasks]){const next=[...state.projects,...state.tasks].find(n=>n.id===original.id)!;for(const key of Object.keys(original))assert.deepEqual((next as any)[key],(original as any)[key]);}
  assert.equal(state.tasks.filter((t:{id:string})=>t.id!=='inbox')[0].dueAt,null);upgraded.shutdown();
  const backups=readdirSync(path.join(dir,'backups'));assert.equal(backups.length,1);const backup=new DatabaseSync(path.join(dir,'backups',backups[0]),{readOnly:true});assert.equal((backup.prepare('PRAGMA user_version').get() as any).user_version,version);assert.deepEqual(JSON.parse((backup.prepare("SELECT data FROM records WHERE kind='tasks' AND id=?").get(id) as any).data),legacy.tasks.filter((t:{id:string})=>t.id!=='inbox')[0]);backup.close();
 }finally{rmSync(dir,{recursive:true,force:true});}
});
