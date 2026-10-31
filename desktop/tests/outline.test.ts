import {test} from 'node:test';
import assert from 'node:assert/strict';
import {JournalService} from '../core/service';
import {SqliteJournalStore} from '../core/store';
import {branchIds,outlineIndex,outlinePath} from '../core/outline';
import {emptyState,type JournalState,type JournalStore,type WorkClock} from '../core/types';
class Store implements JournalStore{path='outline-tests';state=emptyState();fail=false;load(){return structuredClone(this.state);}save(state:JournalState){if(this.fail)throw new Error('disk full');this.state=structuredClone(state);}close(){}}
class Clock implements WorkClock{time=Date.parse('2026-10-19T14:00:00+08:00');mono=0;now(){return this.time;}monotonic(){return this.mono;}advance(ms:number){this.time+=ms;this.mono+=ms;}}
function setup(){const store=new Store(),clock=new Clock(),service=new JournalService(store,clock);return {store,clock,service};}
function create(service:JournalService,kind:'project'|'task',title:string,parentId:string|null){const state=service.execute({type:'outline.create',payload:{kind,title,parentId}}).state;return kind==='project'?state.projects.at(-1)!.id:state.tasks.at(-1)!.id;}
function patch(service:JournalService,id:string,field:string,value:unknown){return service.execute({type:'outline.patch',payload:{id,field,value}});}
function move(service:JournalService,id:string,targetId:string|null,position='inside'){return service.execute({type:'outline.move',payload:{id,targetId,position}});}

test('legacy tasks migrate without changing identity, dates, original estimate or project',()=>{
 const {store,clock}=setup();store.state.schemaVersion=1;store.state.projects[0].parentId=undefined;store.state.projects[0].order=undefined;
 store.state.tasks.push({id:'old',projectId:'inbox',title:'已有工作',outcome:'成果',nextAction:'下一步',estimateMinutes:50,plannedDate:'2026-10-19',status:'open',createdAt:new Date(clock.now()).toISOString(),startedAt:null,completedAt:null});
 const service=new JournalService(store,clock),t=service.snapshot().state.tasks.filter((t:{id:string})=>t.id!=='inbox')[0];assert.equal(t.parentId,'inbox');assert.equal(t.id,'old');assert.equal(t.estimateMinutes,50);assert.equal(t.plannedDate,'2026-10-19');assert.equal(store.state.schemaVersion,19);
});
test('moving a whole task branch updates project ownership and totals while timer and history keep IDs',()=>{
 const {service,clock}=setup(),a=create(service,'project','项目 A',null),b=create(service,'project','项目 B',null),parent=create(service,'task','父任务',a),child=create(service,'task','子任务',parent);
 patch(service,parent,'estimateMinutes',50);patch(service,child,'estimateMinutes',25);service.execute({type:'estimate.add',payload:{taskId:child,remainingMinutes:40,reason:'补充细节'}});
 service.execute({type:'session.manual',payload:{taskId:parent,date:'2026-10-18',minutes:20,summary:'父项工作'}});service.execute({type:'focus.start',payload:{taskId:child}});clock.advance(60000);
 const before=service.snapshot(),after=move(service,parent,b),index=outlineIndex(after.state);
 assert.equal(after.timer?.sessionId,before.timer?.sessionId);assert.equal(after.timer?.durationMs,60000);assert.equal(after.state.tasks.find(t=>t.id===child)!.projectId,b);
 assert.equal(index.stats.get(a)!.totalMs,0);assert.equal(index.stats.get(b)!.totalMs,21*60000);assert.equal(index.stats.get(parent)!.totalMs,21*60000);
 assert.equal(after.state.sessions[0].id,before.state.sessions[0].id);assert.equal(after.state.estimates[0].taskId,child);assert.equal(after.state.tasks.find(t=>t.id===parent)!.estimateMinutes,50);
 assert.deepEqual(outlinePath(index,child).map(n=>n.title),['项目 B','父任务','子任务']);
});
test('projects can be nested under tasks; descendants keep the nearest project and new ancestors gain effort',()=>{
 const {service}=setup(),a=create(service,'project','A',null),b=create(service,'project','B',null),container=create(service,'task','容器任务',a),nested=create(service,'project','子项目',b),leaf=create(service,'task','工作',nested);
 service.execute({type:'session.manual',payload:{taskId:leaf,date:'2026-10-18',minutes:15}});const state=move(service,nested,container).state,index=outlineIndex(state);
 assert.equal(state.tasks.find(t=>t.id===leaf)!.projectId,nested);assert.equal(index.stats.get(a)!.totalMs,15*60000);assert.equal(index.stats.get(b)!.totalMs,0);assert.deepEqual(outlinePath(index,leaf).map(n=>n.title),['A','容器任务','子项目','工作']);
});
test('cycles, self drops and an invalid sibling are rejected atomically',()=>{
 const {service}=setup(),p=create(service,'project','项目',null),a=create(service,'task','父项',p),b=create(service,'task','子项',a),before=service.exportJson();
 assert.throws(()=>move(service,p,b),/自身|子项/);assert.throws(()=>move(service,a,b),/自身|子项/);assert.throws(()=>move(service,a,a),/自身/);assert.throws(()=>move(service,a,'missing'),/目标/);assert.equal(service.exportJson(),before);
});
test('before/after drops reorder siblings and undo preserves edits and newly accrued time',()=>{
 const {service,clock}=setup(),p=create(service,'project','项目',null),a=create(service,'task','A',p),b=create(service,'task','B',p),c=create(service,'task','C',p);
 move(service,c,a,'before');assert.deepEqual(outlineIndex(service.snapshot().state).children.get(p)!.map(n=>n.id),[c,a,b]);
 move(service,c,b,'after');patch(service,c,'title','C 已改名');service.execute({type:'focus.start',payload:{taskId:c,estimateMinutes:25}});clock.advance(12000);
 const state=service.execute({type:'outline.undo'}).state;assert.deepEqual(outlineIndex(state).children.get(p)!.map(n=>n.id),[c,a,b]);assert.equal(state.tasks.find(t=>t.id===c)!.title,'C 已改名');assert.equal(state.sessions[0].durationMs,12000);
});
test('inline edits preserve immutable original estimates and unrelated fields',()=>{
 const {service}=setup(),id=create(service,'task','任务','inbox');patch(service,id,'estimateMinutes',50);patch(service,id,'nextAction','先读一页');patch(service,id,'outcome','一页小结');const state=patch(service,id,'title','新的标题').state;
 assert.equal(state.tasks.filter((t:{id:string})=>t.id!=='inbox')[0].nextAction,'先读一页');assert.equal(state.tasks.filter((t:{id:string})=>t.id!=='inbox')[0].outcome,'一页小结');assert.throws(()=>patch(service,id,'estimateMinutes',60),/原始估计/);assert.equal(service.snapshot().state.tasks.filter((t:{id:string})=>t.id!=='inbox')[0].estimateMinutes,50);
});
test('deep outlines use iterative traversal and have no product nesting limit',()=>{
 const {store,clock}=setup(),now=new Date(clock.now()).toISOString();for(let i=0;i<1500;i++)store.state.tasks.push({id:`deep-${i}`,parentId:i?`deep-${i-1}`:'inbox',order:0,projectId:'inbox',title:`第 ${i} 层`,outcome:'',nextAction:'',estimateMinutes:null,plannedDate:null,status:'open',createdAt:now,startedAt:null,completedAt:null});
 const service=new JournalService(store,clock),index=outlineIndex(service.snapshot().state);assert.equal(outlinePath(index,'deep-1499').length,1501);assert.equal(branchIds(index,'deep-0').size,1500);
 const p=create(service,'project','新的归属',null);const state=move(service,'deep-0',p).state;assert.ok(state.tasks.filter((t:{id:string})=>t.id!=='inbox').every(t=>t.projectId===p));assert.equal(outlineIndex(state).stats.get(p)!.tasks,1501);
});
test('closing parent requires resolving open descendants; closed destinations reject new children',()=>{
 const {service}=setup(),p=create(service,'task','父任务','inbox'),c=create(service,'task','子任务',p),project=create(service,'project','子项目',p);assert.throws(()=>service.execute({type:'task.status',payload:{id:p,status:'done'}}),/子事项/);
 service.execute({type:'task.status',payload:{id:c,status:'done'}});service.execute({type:'task.status',payload:{id:project,status:'done'}});service.execute({type:'task.status',payload:{id:p,status:'done'}});assert.throws(()=>create(service,'task','不能放入',p),/重新打开/);
 const before=service.exportJson();assert.throws(()=>service.execute({type:'task.status',payload:{id:c,status:'open'}}),/重新打开/);assert.throws(()=>service.execute({type:'task.save',payload:{title:'从原有新建入口添加',projectId:project}}),/重新打开/);assert.equal(service.exportJson(),before);
 service.execute({type:'task.status',payload:{id:p,status:'open'}});service.execute({type:'task.status',payload:{id:c,status:'open'}});assert.equal(service.snapshot().state.tasks.find(t=>t.id===c)!.status,'open');
});
test('a title alone starts real timing without fabricating an original estimate',()=>{
 const {service,clock}=setup(),id=create(service,'task','先做起来','inbox');service.execute({type:'focus.start',payload:{taskId:id}});clock.advance(5000);const state=service.execute({type:'focus.stop'}).state;assert.equal(state.tasks.filter((t:{id:string})=>t.id!=='inbox')[0].estimateMinutes,null);assert.equal(state.sessions[0].durationMs,5000);
});
test('malformed hierarchy backup and mismatched project ownership cannot replace data',()=>{
 const {service}=setup(),p=create(service,'project','项目',null),t=create(service,'task','任务',p),before=service.exportJson();
 for(const mutate of [(s:JournalState)=>{s.projects.find(x=>x.id===p)!.parentId=t;},(s:JournalState)=>{s.tasks.filter((t:{id:string})=>t.id!=='inbox')[0].parentId='missing';},(s:JournalState)=>{s.tasks.filter((t:{id:string})=>t.id!=='inbox')[0].projectId='inbox';}]){const backup=JSON.parse(before);mutate(backup.state);assert.throws(()=>service.importJson(JSON.stringify(backup)));assert.equal(service.exportJson(),before);}
});
test('SQLite roundtrip persists hierarchy and order with stable record identities',()=>{
 const store=new SqliteJournalStore(':memory:'),service=new JournalService(store,new Clock()),p=create(service,'project','项目',null),a=create(service,'task','A',p),b=create(service,'task','B',a);move(service,b,a,'before');
 const reloaded=new JournalService(store,new Clock()),index=outlineIndex(reloaded.snapshot().state);assert.deepEqual(index.children.get(p)!.map(n=>n.id),[b,a]);assert.equal(reloaded.snapshot().state.schemaVersion,19);store.close();
});
test('a failed drag save leaves structure, derived ownership and undo unchanged',()=>{
 const {store,service}=setup(),p=create(service,'project','目标',null),t=create(service,'task','任务','inbox'),before=service.exportJson();store.fail=true;assert.throws(()=>move(service,t,p),/disk full/);assert.equal(service.exportJson(),before);store.fail=false;assert.throws(()=>service.execute({type:'outline.undo'}),/没有可以撤销/);
});
test('parent estimates remain distinct and child estimate rollup avoids counting nested budgets twice',()=>{
 const {service}=setup(),p=create(service,'task','父项','inbox'),c=create(service,'task','子项',p),g=create(service,'task','更小的步骤',c);patch(service,p,'estimateMinutes',100);patch(service,c,'estimateMinutes',50);patch(service,g,'estimateMinutes',25);const index=outlineIndex(service.snapshot().state);assert.equal(index.stats.get(p)!.ownEstimate,100);assert.equal(index.stats.get(p)!.childEstimate,50);assert.equal(index.stats.get(c)!.childEstimate,25);
});
