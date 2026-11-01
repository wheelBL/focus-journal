import {test} from 'node:test';
import assert from 'node:assert/strict';
import {JournalService,parseJournalBackup} from '../core/service';
import {emptyState,type JournalState} from '../core/types';
import {outlineIndex} from '../core/outline';
import {emptyFilter,filterOutline} from '../core/filters';
import {condition,group,unfinishedRules} from '../core/filter-rules';
import {effortDestinations} from '../core/effort-destination';
import {itemPresentations} from '../core/item-presentation';
class Store{path='isolated';state=emptyState();load(){return structuredClone(this.state)} save(s:JournalState){this.state=structuredClone(s)} close(){}}
const clock={now:()=>Date.parse('2026-10-20T12:00:00Z'),monotonic:()=>0};
const setup=()=>new JournalService(new Store(),clock);
const add=(s:JournalService,title:string,parentId:string|null,kind='item')=>s.execute({type:'outline.create',payload:{title,parentId,kind}}).state.tasks.at(-1)!.id;
const patch=(s:JournalService,id:string,value:string)=>s.execute({type:'outline.patch',payload:{id,field:'itemType',value}});
test('nested groups retain history and aggregate task descendants once',()=>{
 const s=setup(),g=add(s,'分组',null,'group'),h=add(s,'内部',g,'group'),a=add(s,'事项',h),n=add(s,'资料',h,'note');
 let snap=s.snapshot(),index=outlineIndex(snap.state);assert.equal(index.stats.get(g)!.tasks,1);assert.equal(itemPresentations(index,[],snap.now).get(g)!.label,'1 个待办');
 assert.ok(filterOutline(snap.state,emptyFilter(),snap.now).matches.has(g));assert.ok(!filterOutline(snap.state,{...emptyFilter(),view:'actions'},snap.now).matches.has(g));
 s.execute({type:'session.manual',payload:{taskId:a,date:'2026-10-19',minutes:10}});patch(s,a,'group');snap=s.snapshot();index=outlineIndex(snap.state);assert.equal(index.stats.get(g)!.totalMs,600000);assert.equal(index.stats.get(a)!.ownMs,600000);assert.equal(itemPresentations(index,[],snap.now).get(g)!.label,'暂无待办');
 assert.throws(()=>s.execute({type:'session.manual',payload:{taskId:a,date:'2026-10-19',minutes:1}}));
 const record=snap.state.sessions[0];s.execute({type:'session.manual',payload:{id:record.id,taskId:a,preserveTiming:true,reason:'更正',summary:'历史'}});assert.equal(s.snapshot().state.sessions[0].summary,'历史');
 const child=add(s,'可执行',a);s.execute({type:'focus.start',payload:{taskId:child}});assert.equal(s.snapshot().timers[0].taskId,child);s.shutdown();
});
test('conversion rejects active or arranged items atomically and preserves project descendants',()=>{
 const s=setup(),p=add(s,'项目',null,'project'),c=add(s,'子项',p);s.execute({type:'focus.start',payload:{taskId:p}});assert.throws(()=>patch(s,p,'group'),/先结束/);s.execute({type:'focus.stop',payload:{taskId:p}});patch(s,p,'group');assert.equal(s.snapshot().state.tasks.find(t=>t.id===p)!.isProject,false);assert.equal(s.snapshot().state.tasks.find(t=>t.id===c)!.parentId,p);
 assert.throws(()=>s.execute({type:'item-reminder.set',payload:{id:p,at:'2026-10-21T00:00:00Z'}}));assert.throws(()=>s.execute({type:'recurrence.set',payload:{id:p,rule:{mode:'completion',unit:'day',interval:1,anchor:'2026-10-20',weekdays:[],until:null}}}));
 const raw=JSON.parse(s.exportJson());assert.equal(raw.version,20);assert.equal(parseJournalBackup(JSON.stringify(raw)).tasks.find(t=>t.id===p)!.itemType,'group');raw.version=19;raw.state.schemaVersion=19;assert.throws(()=>parseJournalBackup(JSON.stringify(raw)));s.shutdown();
});

test('conversion preserves initial estimate and historical evidence through backup, correction and conversion back',()=>{const s=setup(),id=add(s,'已估计',null);s.execute({type:'outline.patch',payload:{id,field:'estimateMinutes',value:40}});s.execute({type:'session.manual',payload:{taskId:id,date:'2026-10-19',minutes:10}});patch(s,id,'group');let t=s.snapshot().state.tasks.find(t=>t.id===id)!;assert.equal(t.estimateMinutes,null);assert.equal(t.groupHistory!.initialEstimateMinutes,40);assert.equal(effortDestinations(s.snapshot().state).some(t=>t.id===id),false);assert.equal(effortDestinations(s.snapshot().state,id).some(t=>t.id===id),true);const raw=s.exportJson();assert.equal(parseJournalBackup(raw).tasks.find(t=>t.id===id)!.groupHistory!.initialEstimateMinutes,40);const bad=JSON.parse(raw);bad.state.tasks.find((t:any)=>t.id===id).groupHistory.initialEstimateMinutes=-10;assert.throws(()=>parseJournalBackup(JSON.stringify(bad)));patch(s,id,'task');t=s.snapshot().state.tasks.find(t=>t.id===id)!;assert.equal(t.estimateMinutes,40);assert.equal(t.groupHistory,undefined);s.shutdown();});
test('group filtering preserves default visibility without changing explicit execution and OR rules',()=>{const s=setup(),g=add(s,'查找',null,'group');s.execute({type:'tag.attach',payload:{id:g,name:'专题'}});const snap=s.snapshot(),tag=snap.state.tags[0].id;for(const extra of [condition('itemType','is','group'),condition('tags','all',[tag])]){const f={...emptyFilter(),rules:group([...unfinishedRules(),extra])};assert.ok(filterOutline(snap.state,f,snap.now).matches.has(g));}assert.ok(!filterOutline(snap.state,{...emptyFilter(),rules:group([condition('status','is','open')])},snap.now).matches.has(g));assert.ok(!filterOutline(snap.state,{...emptyFilter(),rules:group([group(unfinishedRules(),'any')])},snap.now).matches.has(g));s.shutdown();});

test('deleted and archived branches do not contribute to group task counts',()=>{const s=setup(),g=add(s,'范围',null,'group'),a=add(s,'保留',g),b=add(s,'删除',g);s.execute({type:'item.change',payload:{id:b,action:'delete'}});const snap=s.snapshot(),idx=outlineIndex(snap.state);assert.equal(idx.stats.get(g)!.tasks,1);assert.equal(itemPresentations(idx,[],snap.now).get(g)!.descendantTasks,1);s.shutdown();});
