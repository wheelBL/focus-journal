import {test} from 'node:test';
import assert from 'node:assert/strict';
import {JournalService} from '../core/service';
import {emptyState,localDate,type JournalState} from '../core/types';
import {outlineIndex} from '../core/outline';
import {itemOrdering,itemSorter} from '../core/item-order';
import {dailyFocusItems,isDailyFocus} from '../core/daily-focus';
import {emptyFilter,filterOutline,validateFilter} from '../core/filters';
import {condition,group,hasTodayFocusRule,withRules} from '../core/filter-rules';

class Store{path='daily focus tests';state=emptyState();load(){return structuredClone(this.state);}save(s:JournalState){this.state=structuredClone(s);}close(){}}
function setup(){
 const clock={time:Date.parse('2026-10-19T14:00:00'),now(){return this.time;},monotonic(){return this.time;}};
 const service=new JournalService(new Store(),clock);
 const add=(title:string,parentId:string|null=null)=>service.execute({type:'task.save',payload:{title,parentId}}).state.tasks.at(-1)!.id;
 const pin=(id:string,date:string|null='2026-10-19')=>service.execute({type:'item.focus',payload:{id,date}});
 const patch=(id:string,field:string,value:unknown)=>service.execute({type:'outline.patch',payload:{id,field,value}});
 return {s:service,clock,add,pin,patch};
}

test('daily intention leads automatic siblings and ancestor branches without changing data or explicit sorts',()=>{
 const {s,add,pin,patch}=setup();try{
  const urgent=add('逾期'),parent=add('重点所在项目'),other=add('普通子项',parent),nested=add('子分支',parent),focus=add('今天要推进',nested);
  patch(urgent,'dueAt','2026-10-18');patch(focus,'plannedDate','2026-11-01');pin(focus);
  const before=s.exportJson(),snapshot=s.snapshot(),index=outlineIndex(snapshot.state),order=itemOrdering(index,'smart',snapshot.now);
  const roots=index.children.get(null)!.filter(n=>n.id!=='inbox');
  assert.deepEqual(order.sorted(roots).map(n=>n.id),[parent,urgent]);
  assert.deepEqual(order.sorted(index.children.get(parent)!).map(n=>n.id),[nested,other]);
  assert.match(order.reason(parent),/因子项「今天要推进」已加入今日重点/);
  assert.equal(order.reason(focus),'已加入今日重点');
  assert.deepEqual(itemSorter(index,'manual',snapshot.now)(roots).map(n=>n.id),[urgent,parent]);
  assert.deepEqual(itemSorter(index,'due',snapshot.now)(roots).map(n=>n.id),[urgent,parent]);
  assert.equal(s.exportJson(),before);assert.equal(snapshot.state.tasks.find(t=>t.id===focus)!.plannedDate,'2026-11-01');
  assert.deepEqual(itemSorter(index,'smart',snapshot.now,false)(index.ordered).slice(0,2).map(n=>n.id),[focus,urgent]);
 }finally{s.shutdown();}
});

test('same focus priority uses deadline then plan, undo/removal restores natural order and yesterday never remains promoted',()=>{
 const {s,clock,add,pin,patch}=setup();try{
  const early=add('早到期'),late=add('晚到期'),plain=add('无日期');
  patch(early,'dueAt','2026-10-20');patch(late,'dueAt','2026-10-22');pin(late);pin(plain);pin(early);
  const ids=()=>{const snap=s.snapshot(),index=outlineIndex(snap.state);return itemSorter(index,'smart',snap.now)(index.children.get(null)!).filter(n=>n.id!=='inbox').map(n=>n.id);};
  assert.deepEqual(ids(),[early,late,plain]);pin(plain,null);assert.deepEqual(ids(),[early,late,plain]);
  s.execute({type:'organize.undo'});assert.equal(s.snapshot().state.tasks.find(t=>t.id===plain)!.focusDate,'2026-10-19');
  clock.time=Date.parse('2026-10-20T00:00:00');
  assert.equal(dailyFocusItems(outlineIndex(s.snapshot().state),localDate(s.snapshot().now)).length,0);
  assert.deepEqual(ids(),[early,late,plain]);assert.equal(s.snapshot().state.tasks.find(t=>t.id===plain)!.focusDate,'2026-10-19');
 }finally{s.shutdown();}
});

test('closed or inherited-paused focuses cannot promote branches; daily panel retains paused and completed progress',()=>{
 const {s,add,pin,patch}=setup();try{
  const urgent=add('急事'),parent=add('暂停分支'),child=add('暂停重点',parent),done=add('完成重点');
  patch(urgent,'dueAt','2026-10-18');pin(child);pin(done);
  s.execute({type:'item.change',payload:{id:parent,action:'pause'}});s.execute({type:'task.status',payload:{id:done,status:'done'}});
  let snap=s.snapshot(),index=outlineIndex(snap.state),order=itemOrdering(index,'smart',snap.now);
  assert.equal(order.sorted(index.children.get(null)!).filter(n=>n.id!=='inbox')[0].id,urgent);
  assert.doesNotMatch(order.reason(parent),/重点/);assert.equal(isDailyFocus(snap.state.tasks.find(t=>t.id===done)!,'2026-10-19'),false);
  assert.deepEqual(new Set(dailyFocusItems(index,'2026-10-19').map(t=>t.id)),new Set([child,done]));
  s.execute({type:'item.change',payload:{id:parent,action:'delete',confirmBranch:true}});
  assert.deepEqual(dailyFocusItems(outlineIndex(s.snapshot().state),'2026-10-19').map(t=>t.id),[done]);
 }finally{s.shutdown();}
});

test('focus rule uses the shared dynamic date filter, preserves saved views and excludes empty ancestors after completion',()=>{
 const {s,clock,add,pin}=setup();try{
  const parent=add('层级路径'),id=add('本日重点',parent),old=add('昨日重点');pin(id);pin(old,'2026-10-18');
  const filter=withRules(emptyFilter(),group([condition('status','is','open'),condition('focusDate','period','today')]));
  assert.equal(hasTodayFocusRule(filter),true);validateFilter(filter,s.snapshot().state);
  s.execute({type:'view.save',payload:{name:'我的重点',filter}});
  let snap=s.snapshot(),result=filterOutline(snap.state,filter,snap.now);
  assert.deepEqual([...result.matches],[id]);assert.deepEqual(new Set(result.keep),new Set([id,parent]));
  s.execute({type:'task.status',payload:{id, status:'done'}});
  snap=s.snapshot();assert.equal(filterOutline(snap.state,filter,snap.now).keep.size,0);
  const saved=s.snapshot().state.views[0];assert.deepEqual(saved.filter.rules,filter.rules);
  const copy=new JournalService(new Store(),clock);try{copy.importJson(s.exportJson());assert.deepEqual(copy.snapshot().state.views[0],saved);}finally{copy.shutdown();}
  clock.time=Date.parse('2026-10-20T00:00:00');const next=add('第二天重点');pin(next,'2026-10-20');
  snap=s.snapshot();assert.deepEqual([...filterOutline(snap.state,saved.filter,snap.now).matches],[next]);
 }finally{s.shutdown();}
});
