import {test} from 'node:test';
import assert from 'node:assert/strict';
import {JournalService} from '../core/service';
import {emptyState,taskMs,sessionMsOnDate,type JournalState} from '../core/types';
import {calendarEntries} from '../src/calendar-layout';
import {selectionRange,slotMinute} from '../src/calendar-selection';
process.env.TZ='Asia/Shanghai';
class Store{path='calendar test';state=emptyState();fail=false;load(){return structuredClone(this.state);}save(s:JournalState){if(this.fail)throw Error('disk full');this.state=structuredClone(s);}close(){}}
function setup(){const store=new Store(),service=new JournalService(store,{now:()=>Date.parse('2026-10-20T14:00:00+08:00'),monotonic:()=>0});return {store,service};}
const at=(s:string)=>new Date(s).toISOString();
const add=(s:JournalService,title:string,parentId:string|null=null)=>s.execute({type:'task.save',payload:{title,parentId}}).state.tasks.at(-1)!.id;
const save=(s:JournalService,p:Record<string,unknown>)=>s.execute({type:'calendar.save',payload:{start:at('2026-10-19T09:00'),end:at('2026-10-19T10:00'),...p}});

test('calendar reminder and event preserve identity and create no artificial effort or plan',()=>{
 const {service:s}=setup(),id=add(s,'已有事项');
 let state=save(s,{mode:'reminder',taskId:id}).state;
 assert.equal(state.tasks.find(t=>t.id===id)!.reminder!.at,at('2026-10-19T09:00'));assert.equal(state.tasks.length,2);assert.equal(state.sessions.length,0);
 state=save(s,{mode:'event',title:'事件',remind:true}).state;const event=state.tasks.at(-1)!;
 assert.equal(event.itemType,'event');assert.equal(event.eventEnd,at('2026-10-19T10:00'));assert.ok(event.reminder);assert.equal(event.plannedDate,null);assert.equal(event.startedAt,null);assert.equal(state.sessions.length,0);
 assert.equal(calendarEntries(state,'2026-10-19',['event']).length,1);assert.ok(calendarEntries(state,'2026-10-19',['event']).every(e=>e.lanes===1));
 assert.equal(calendarEntries(state,'2026-10-19',[]).length,0);
});
test('calendar effort atomically creates or links an item and updates actual start, totals and midnight allocation',()=>{
 const {service:s}=setup();let state=save(s,{mode:'effort',title:'补记工作',start:at('2026-10-18T23:30'),end:at('2026-10-19T00:30'),summary:'完成第一段'}).state;
 const task=state.tasks.at(-1)!;assert.equal(task.parentId,'inbox');assert.equal(task.status,'open');assert.equal(task.completedAt,null);assert.equal(task.startedAt,at('2026-10-18T23:30'));assert.equal(taskMs(state,task.id),3600000);
 assert.equal(sessionMsOnDate(state.sessions[0],'2026-10-18'),1800000);assert.equal(sessionMsOnDate(state.sessions[0],'2026-10-19'),1800000);
 state=save(s,{mode:'effort',taskId:task.id}).state;assert.equal(state.tasks.length,2);assert.equal(taskMs(state,task.id),7200000);assert.equal(state.sessions[0].summary,'完成第一段');
});
test('future, same-item overlap, invalid target and disk failures keep both item and evidence untouched',()=>{
 const {service:s,store}=setup();const before=s.exportJson();
 assert.throws(()=>save(s,{mode:'effort',title:'未来',start:at('2026-10-21T09:00'),end:at('2026-10-21T10:00')}),/未来/);assert.equal(s.exportJson(),before);
 assert.throws(()=>save(s,{mode:'effort',title:'无效',end:at('2026-10-19T08:00')}),/结束/);
 store.fail=true;assert.throws(()=>save(s,{mode:'effort',title:'写入失败'}),/disk/);assert.equal(s.exportJson(),before);store.fail=false;
 const id=save(s,{mode:'effort',title:'完成工作'}).state.tasks.at(-1)!.id;const saved=s.exportJson();
 assert.throws(()=>save(s,{mode:'effort',taskId:id}),/同一事项.*重叠/);assert.equal(s.exportJson(),saved);
 save(s,{mode:'effort',title:'并行工作'});assert.equal(s.snapshot().state.sessions.length,2);
 s.execute({type:'task.status',payload:{id,status:'done'}});assert.throws(()=>save(s,{mode:'reminder',taskId:id}),/恢复/);
});
test('correcting and reassigning calendar effort updates both items and retains the original audit',()=>{
 const {service:s}=setup(),a=add(s,'A'),b=add(s,'B');save(s,{mode:'effort',taskId:a});const record=s.snapshot().state.sessions[0];
 s.execute({type:'session.manual',payload:{id:record.id,taskId:b,date:'2026-10-19',minutes:30,start:at('2026-10-19T10:30'),end:at('2026-10-19T11:00'),reason:'归属与时间校正'}});
 const state=s.snapshot().state;assert.equal(taskMs(state,a),0);assert.equal(state.tasks.find(t=>t.id===a)!.startedAt,null);assert.equal(taskMs(state,b),1800000);assert.equal(state.tasks.find(t=>t.id===b)!.startedAt,at('2026-10-19T10:30'));assert.equal(JSON.parse(state.audit.at(-1)!.before).taskId,a);
});
test('selection snaps at zoom-independent boundaries, reverses and ends at midnight',()=>{
 assert.equal(slotMinute(432,1152),540);assert.equal(slotMinute(864,2304),540);
 assert.equal(slotMinute(383.6,1152),480);assert.equal(slotMinute(768.3,2304),480);
 assert.deepEqual(selectionRange('2026-10-19',600,540),{from:540,to:600,start:'2026-10-19T09:00',end:'2026-10-19T10:00'});
 assert.equal(selectionRange('2026-10-19',1425,1440).end,'2026-10-20T00:00');assert.equal(selectionRange('2026-10-19',540,540).to,555);
});
test('editing a root nonproject item preserves its null ownership and hierarchy',()=>{
 const {service:s}=setup(),id=add(s,'最外层工作');
 s.execute({type:'task.save',payload:{id,title:'改名'}});const task=s.snapshot().state.tasks.find(t=>t.id===id)!;
 assert.equal(task.parentId,null);assert.equal(task.projectId,null);
});
