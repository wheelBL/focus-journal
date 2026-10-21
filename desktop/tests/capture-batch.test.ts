import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseCapture,parseCaptureDate,captureDestinations} from '../core/capture';
import {JournalService} from '../core/service';
import {emptyState,localDate,type JournalState} from '../core/types';
import {outlineIndex} from '../core/outline';
import {itemOrdering} from '../core/item-order';
import {batchImpact} from '../core/batch';
import {projectReview} from '../core/project-review';
import {calendarEntries} from '../src/calendar-layout';
import {CaptureShortcut} from '../electron/capture-shortcut';
const now='2026-10-20T14:00:00+08:00';
class Store{path='capture tests';state=emptyState();load(){return structuredClone(this.state);}save(s:JournalState){this.state=structuredClone(s);}close(){}}
const setup=()=>{const clock={time:Date.parse(now),mono:0,now(){return this.time;},monotonic(){return this.mono;}};return {s:new JournalService(new Store(),clock),clock};};
const create=(s:JournalService,raw:string,parentId:string|null='inbox')=>s.execute({type:'capture.create',payload:{draft:parseCapture(raw,s.snapshot().now).draft,parentId}}).state.tasks.at(-1)!;

test('semantic capture keeps Chinese date roles, exclusive deadline precision and emoji text',()=>{
 const p=parseCapture('. 📚 写周报 #工作/周报 %写作 %写作 明天开始 周五17:00截止 周五16:00提醒 估计50分钟',now);
 assert.deepEqual(p.errors,[]);assert.equal(p.draft.title,'📚 写周报');assert.equal(p.draft.parentQuery,'工作/周报');assert.deepEqual(p.draft.tagNames,['写作']);assert.equal(p.draft.plannedDate,'2026-10-21');assert.equal(p.draft.dueAt,new Date('2026-10-23T17:00').toISOString());assert.equal(p.draft.estimateMinutes,50);
 assert.equal(parseCapture('提交 明天截止',now).draft.dueAt,'2026-10-21');assert.equal(parseCapture('提交 下周一前截止',now).draft.dueAt,'2026-10-26');
 assert.equal(parseCaptureDate('2026-02-30',now),null);assert.equal(parseCaptureDate('12月31日23:59',now),new Date('2026-12-31T23:59').toISOString());assert.equal(parseCaptureDate('下午3点半',now),new Date('2026-10-20T15:30').toISOString());
 assert.ok(parseCapture('事项 明天提醒',now).errors.length);assert.ok(parseCapture('事项 明天9:00开始',now).errors.length);
});
test('prefixes require whitespace, quoted and escaped tokens stay literal; uncertain dates never become plans',()=>{
 for(const raw of ['-flag example','ocean','ordinary','.git'])assert.equal(parseCapture(raw,now).draft.itemType,'task');
 assert.equal(parseCapture('- 资料 2026-10-23',now).draft.itemType,'note');assert.equal(parseCapture('o 明天14:00-15:00 讨论',now).draft.itemType,'event');
 const p=parseCapture('检查 "明天截止" \\%文本 %标签',now);assert.equal(p.draft.title,'检查 "明天截止" %文本');assert.equal(p.draft.dueAt,null);assert.deepEqual(p.draft.tagNames,['标签']);
 const literal=parseCapture('检查 明天截止',now);assert.equal(parseCapture('检查 明天截止',now,'task',[literal.tokens[0].key]).draft.title,'检查 明天截止');
 const ambiguous=parseCapture('明天下午3点写方案',now);assert.equal(ambiguous.draft.plannedDate,null);assert.ok(ambiguous.hints.length);
 assert.ok(parseCapture('- 资料 估计25分钟',now).errors.length);assert.ok(parseCapture('事项 明天截止 后天截止',now).errors.length);
});
test('capture resolves unique complete paths and saves tags/date/type atomically; ambiguity and unavailable ancestors reject',()=>{
 const {s}=setup(),a=create(s,'工作',null),b=create(s,'个人',null);create(s,'周报',a.id);create(s,'周报',b.id);
 assert.equal(captureDestinations(s.snapshot().state,'周报').length,2);const before=s.exportJson();assert.throws(()=>create(s,'写作 #周报 %新标签'),/重名/);assert.equal(s.exportJson(),before);
 const t=create(s,'写作 #工作/周报 %输出 明天开始 周五截止 估计25分钟');assert.equal(t.plannedDate,'2026-10-21');assert.equal(t.dueAt,'2026-10-23');assert.equal(t.tagIds?.length,1);
 const branch=s.snapshot().state.tasks.find(t=>t.title==='周报'&&t.parentId===b.id)!;s.execute({type:'item.change',payload:{id:b.id,action:'delete',confirmBranch:true}});assert.equal(captureDestinations(s.snapshot().state,'个人/周报').length,0);assert.throws(()=>create(s,'内容',branch.id));s.shutdown();
});
test('events and notes survive export, have no invented effort, events appear separately in calendar and can remind',()=>{
 const {s}=setup();const note=create(s,'- 参考信息 %资料'),event=create(s,'o 明天14:00-15:00 团队交流 明天13:50提醒');
 assert.equal(event.eventEnd,new Date('2026-10-21T15:00').toISOString());assert.ok(event.reminder);assert.equal(s.snapshot().state.sessions.length,0);
 const entries=calendarEntries(s.snapshot().state,'2026-10-21');assert.deepEqual(entries.map(e=>e.kind),['reminder','event']);
 for(const item of [note,event]){assert.throws(()=>s.execute({type:'focus.start',payload:{taskId:item.id}}));assert.throws(()=>s.execute({type:'item.focus',payload:{id:item.id,date:'2026-10-20'}}));}
 const other=setup().s;other.importJson(s.exportJson());assert.deepEqual(other.snapshot().state.tasks,s.snapshot().state.tasks);other.shutdown();s.shutdown();
});
test('batch previews deduplicate selected branches, skip information, preserve existing closed descendants and undo without restarting timers',()=>{
 const {s,clock}=setup(),parent=create(s,'父项'),child=create(s,'子项',parent.id),note=create(s,'- 说明',parent.id),done=create(s,'之前取消',parent.id);
 s.execute({type:'task.status',payload:{id:done.id,status:'cancelled'}});s.execute({type:'focus.start',payload:{taskId:child.id}});clock.mono+=65000;clock.time+=65000;
 const impact=batchImpact(s.snapshot().state,[parent.id,child.id],'done');assert.equal(impact.roots.length,1);assert.equal(impact.timers.length,1);assert.equal(impact.skipped,1);
 s.execute({type:'items.batch',payload:{ids:[parent.id,child.id],action:'done',confirm:true}});assert.equal(s.snapshot().state.tasks.find(t=>t.id===done.id)?.status,'cancelled');assert.equal(s.snapshot().state.tasks.find(t=>t.id===note.id)?.status,'open');assert.equal(s.snapshot().state.sessions[0].durationMs,65000);
 s.execute({type:'item.undo'});assert.equal(s.snapshot().state.tasks.find(t=>t.id===child.id)?.status,'open');assert.equal(s.snapshot().timers.length,0);assert.equal(s.snapshot().state.sessions[0].durationMs,65000);s.shutdown();
});
test('batch tag/date/move validation is atomic and organizing undo preserves live work',()=>{
 const {s,clock}=setup(),a=create(s,'项目 A',null),b=create(s,'项目 B',null),child=create(s,'子项',a.id),note=create(s,'- 资料',a.id);
 s.execute({type:'focus.start',payload:{taskId:child.id}});s.execute({type:'items.batch',payload:{ids:[child.id,note.id],action:'tag',value:'标签',confirm:true}});assert.equal(s.snapshot().state.tasks.find(t=>t.id===note.id)?.tagIds?.length,1);
 s.execute({type:'items.batch',payload:{ids:[child.id,note.id],action:'plannedDate',value:'2026-10-21',confirm:true}});assert.equal(s.snapshot().state.tasks.find(t=>t.id===note.id)?.plannedDate,null);
 const before=s.exportJson();assert.throws(()=>s.execute({type:'items.batch',payload:{ids:[child.id],action:'dueAt',value:'2026-10-19',confirm:true}}));assert.equal(s.exportJson(),before);
 s.execute({type:'items.batch',payload:{ids:[a.id,child.id],action:'move',value:b.id,confirm:true}});assert.equal(s.snapshot().state.tasks.find(t=>t.id===child.id)?.parentId,a.id);
 clock.mono+=5000;clock.time+=5000;s.execute({type:'organize.undo'});assert.equal(s.snapshot().state.tasks.find(t=>t.id===a.id)?.parentId,null);assert.equal(s.snapshot().timers[0].durationMs,5000);s.shutdown();
});
test('today focus is independent from dates and clock ticks do not change data revision until durable checkpoint',()=>{
 const {s,clock}=setup(),t=create(s,'开始工作 明天开始 周五截止');s.execute({type:'item.focus',payload:{id:t.id,date:'2026-10-20'}});const task=s.snapshot().state.tasks.filter((t:{id:string})=>t.id!=='inbox')[0];assert.equal(task.plannedDate,'2026-10-21');assert.equal(task.dueAt,'2026-10-23');
 s.execute({type:'focus.start',payload:{taskId:t.id}});const before=s.snapshot();clock.mono+=4000;clock.time+=4000;const tick=s.clockSnapshot();assert.equal(tick.revision,before.revision);assert.equal(tick.sessions.length,1);assert.equal(tick.timers[0].durationMs,4000);assert.equal(before.timers[0].durationMs,0);
 clock.mono+=7000;clock.time+=7000;s.tick();assert.ok(s.clockSnapshot().revision>tick.revision);s.shutdown();
});
test('sort explanations identify urgent descendants and project review separates outcomes from unknown progress',()=>{
 const {s}=setup(),p=create(s,'项目',null),child=create(s,'子项 今天截止',p.id);s.execute({type:'outline.patch',payload:{id:p.id,field:'isProject',value:true}});
 const ordering=itemOrdering(outlineIndex(s.snapshot().state),'smart',s.snapshot().now);assert.match(ordering.reason(p.id),/子项.*截止已过/);
 s.execute({type:'session.manual',payload:{taskId:child.id,date:localDate(now),minutes:50}});const report=projectReview(s.snapshot().state,'2026-10-19','2026-10-25').find(r=>r.id===p.id)!;assert.equal(report.ms,3000000);assert.equal(report.ongoing.length,1);assert.equal(report.completed.length,0);assert.equal(report.details[0].outcome,null);s.shutdown();
});
test('skipping a selected information parent never changes its executable children during batch state operations',()=>{
 for(const action of ['pause','done','cancelled'] as const){
  const {s}=setup(),note=create(s,'- 资料'),child=create(s,'资料下的事项',note.id),other=create(s,'另一个事项');
  s.execute({type:'focus.start',payload:{taskId:child.id}});
  const impact=batchImpact(s.snapshot().state,[note.id,other.id],action);assert.equal(impact.skipped,1);assert.equal(impact.timers.length,0);
  s.execute({type:'items.batch',payload:{ids:[note.id,other.id],action,confirm:true}});
  assert.equal(s.snapshot().state.tasks.find(t=>t.id===child.id)?.status,'open');assert.equal(s.snapshot().timers[0].paused,false);s.shutdown();
 }
});

test('global shortcut conflict and persistence failure preserve the working registration; disposal removes it',()=>{
 const registered=new Set<string>(),port={register:(key:string)=>key.includes('F1')?false:(registered.add(key),true),unregister:(key:string)=>{registered.delete(key);},isRegistered:(key:string)=>registered.has(key)};let fail=false;
 const c=new CaptureShortcut(port,()=>{},()=>{if(fail)throw new Error('disk');});c.configure('Ctrl+Alt+Space');assert.throws(()=>c.configure('Ctrl+F1'),/占用/);assert.ok(registered.has('Ctrl+Alt+Space'));fail=true;assert.throws(()=>c.configure('Ctrl+Alt+N'),/保存/);assert.deepEqual([...registered],['Ctrl+Alt+Space']);c.dispose();assert.equal(registered.size,0);
});
