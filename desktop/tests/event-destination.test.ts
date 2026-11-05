import {test} from 'node:test';
import assert from 'node:assert/strict';
import {JournalService} from '../core/service';
import {emptyState,type JournalState} from '../core/types';
import {parseCapture} from '../core/capture';
import {inboxItems,inboxReviewDue} from '../core/inbox-review';
import {controlCommand,controlOpenApi} from '../core/control-api';
import {buildAiContext,buildAiPlan} from '../core/ai-assistant';
class Store{path='isolated event destination test';state=emptyState();load(){return structuredClone(this.state);}save(s:JournalState){this.state=structuredClone(s);}close(){}}
const clock={now:()=>Date.parse('2026-11-03T10:00:00+08:00'),monotonic:()=>0};
const setup=()=>new JournalService(new Store(),clock);
function capture(s:JournalService,raw:string,extra:Record<string,unknown>={}){return s.execute({type:'capture.create',payload:{destination:'auto',draft:parseCapture(raw,s.snapshot().now).draft,...extra}}).state.tasks.at(-1)!;}
const createGroup=(s:JournalService)=>s.execute({type:'outline.create',payload:{title:'旅行',parentId:null,kind:'group'}}).state.tasks.at(-1)!;
const byId=(s:JournalService,id:string)=>s.snapshot().state.tasks.find(t=>t.id===id)!;

test('automatic capture resolves type and explicit destinations without migrating anything',()=>{
 const s=setup(),group=createGroup(s),before=structuredClone(s.snapshot().state.tasks);const event=capture(s,'o 火车');assert.equal(event.parentId,null);assert.match(event.eventAt!,/^2026-11-03$/);assert.equal(inboxItems(s.snapshot().state).length,0);assert.equal(inboxReviewDue(s.snapshot().state,s.snapshot().now),false);
 assert.equal(capture(s,'办理手续').parentId,'inbox');assert.equal(capture(s,'- 行程笔记').parentId,'inbox');assert.equal(capture(s,'o 住宿 #旅行').parentId,group.id);assert.equal(capture(s,'o 会面',{parentId:group.id}).parentId,group.id);assert.equal(capture(s,'普通事项',{parentId:null}).parentId,null);
 const forced=capture(s,'o 日程 #旅行',{destination:'inbox',parentId:group.id});assert.equal(forced.parentId,'inbox');assert.equal(capture(s,'待办 #旅行',{destination:'unfiled',parentId:group.id}).parentId,null);assert.equal(capture(s,'旧命令',{destination:undefined}).parentId,null);
 assert.deepEqual(s.snapshot().state.tasks.slice(0,before.length),before);assert.equal(s.snapshot().state.schemaVersion,23);s.shutdown();
});
test('an explicit inbox request fails safely if unavailable while automatic fallback stays unfiled',()=>{
 const s=setup();s.execute({type:'item.change',payload:{id:'inbox',action:'delete',confirmBranch:true}});const before=s.exportJson();assert.throws(()=>capture(s,'o 稍后',{destination:'inbox'}),/收件箱不可用/);assert.equal(s.exportJson(),before);assert.equal(capture(s,'任务').parentId,null);assert.equal(capture(s,'o 事件').parentId,null);s.shutdown();
});
test('explicitly moving a legacy inbox event preserves date, children and identity without a reminder',()=>{
 const s=setup(),event=capture(s,'o 已记录',{destination:'inbox'}),child=capture(s,'其子项',{parentId:event.id}),old=structuredClone(byId(s,event.id));assert.equal(inboxItems(s.snapshot().state).length,1);assert.equal(inboxReviewDue(s.snapshot().state,s.snapshot().now),true);
 s.execute({type:'inbox.organize',payload:{id:event.id,parentId:null}});const moved=byId(s,event.id);assert.equal(moved.parentId,null);assert.equal(moved.id,old.id);assert.equal(moved.eventAt,old.eventAt);assert.equal(moved.eventEnd,old.eventEnd);assert.equal(moved.description,old.description);assert.equal(byId(s,child.id).parentId,event.id);assert.equal(inboxItems(s.snapshot().state).length,0);assert.equal(inboxReviewDue(s.snapshot().state,s.snapshot().now),false);assert.throws(()=>s.execute({type:'inbox.organize',payload:{id:event.id,parentId:null}}));s.shutdown();
});
test('API and calendar follow automatic destinations while explicit paths remain authoritative',()=>{
 const s=setup(),group=createGroup(s),api=(payload:Record<string,unknown>)=>{const command=controlCommand({type:'item.create',payload},s.snapshot());return s.execute(command).state.tasks.at(-1)!;};
 assert.equal(api({title:'事件',itemType:'event',eventAt:'2026-11-03'}).parentId,null);assert.equal(api({title:'任务'}).parentId,'inbox');assert.equal(api({title:'有归属事件',itemType:'event',eventAt:'2026-11-03',parentQuery:'旅行'}).parentId,group.id);assert.equal(api({title:'待整理事件',itemType:'event',eventAt:'2026-11-03',destination:'inbox'}).parentId,'inbox');assert.equal(api({title:'根级任务',destination:'unfiled'}).parentId,null);
 assert.throws(()=>controlCommand({type:'item.create',payload:{title:'invalid',destination:'other'}},s.snapshot()));assert.ok(JSON.stringify(controlOpenApi('http://127.0.0.1')).includes('unfiled'));
 for(const mode of ['event','reminder','effort']){const result=s.execute({type:'calendar.save',payload:{mode,title:`日历${mode}`,start:'2026-11-02T01:00:00Z',end:'2026-11-02T02:00:00Z'}});assert.equal(result.state.tasks.at(-1)!.parentId,null);}
 const p=s.execute({type:'calendar.save',payload:{mode:'event',title:'指定',parentId:group.id,start:'2026-11-02T01:00:00Z',end:'2026-11-02T02:00:00Z'}}).state.tasks.at(-1)!;assert.equal(p.parentId,group.id);const forced=s.execute({type:'calendar.save',payload:{mode:'event',title:'显式待整理',parentId:null,destination:'inbox',start:'2026-11-02T01:00:00Z',end:'2026-11-02T02:00:00Z'}}).state.tasks.at(-1)!;assert.equal(forced.parentId,'inbox');s.shutdown();
});
test('legacy task.save and AI suggestions respect event defaults and explicit scope',()=>{
 const s=setup(),legacy=s.execute({type:'task.save',payload:{title:'o 日期记录'}}).state.tasks.at(-1)!;assert.equal(legacy.parentId,null);assert.match(legacy.eventAt!,/^2026-11-03$/);const existing=capture(s,'o 旧事件',{destination:'inbox'});s.execute({type:'task.save',payload:{id:existing.id,title:'仍待整理'}});assert.equal(byId(s,existing.id).parentId,'inbox');
 const command={type:'item.create',payload:{title:'AI 日程',itemType:'event',eventAt:'2026-11-03'}},proposal={summary:'',changes:[{command}]};const all=buildAiPlan(proposal,buildAiContext(s.snapshot(),{kind:'all'}));assert.equal(all.entries[0].command.payload!.parentId,null);
 const group=createGroup(s),scoped=buildAiPlan(proposal,buildAiContext(s.snapshot(),{kind:'item',itemId:group.id}));assert.equal(scoped.entries[0].command.payload!.parentId,group.id);assert.throws(()=>buildAiPlan({summary:'',changes:[{command:{...command,payload:{...command.payload,destination:'inbox'}}}]},buildAiContext(s.snapshot(),{kind:'item',itemId:group.id})),/parentId/);s.shutdown();
});
