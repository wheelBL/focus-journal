import {test} from 'node:test';
import assert from 'node:assert/strict';
import {JournalService} from '../core/service';
import {emptyState,type JournalState} from '../core/types';
import {reviewQueue} from '../core/item-reviews';
import {emptyFilter,filterOutline} from '../core/filters';
import {condition,group,relative,withRules} from '../core/filter-rules';
import {outlineIndex} from '../core/outline';
import {itemPresentations} from '../core/item-presentation';
import {deriveDependencyStatuses} from '../core/dependencies';
class Store{path='deadline review synthetic';state=emptyState();load(){return structuredClone(this.state);}save(s:JournalState){this.state=structuredClone(s);}close(){}}
const clock={time:Date.parse('2026-11-05T12:00:00'),now(){return this.time;},monotonic(){return this.time;}};
test('clearing an expired deadline and planning review preserves evidence and all deadline and review views agree',()=>{
 const s=new JournalService(new Store(),clock),create=(title:string,kind='task',parentId:string|null=null)=>s.execute({type:'outline.create',payload:{title,kind,parentId}}).state.tasks.at(-1)!.id;
 const parent=create('项目分组','group'),id=create('需重新判断','task',parent),next=create('依赖后项');s.execute({type:'task.plan',payload:{id,date:'2026-11-01',dueAt:'2026-11-04'}});s.execute({type:'task.plan',payload:{id:next,date:'2026-11-05',dueAt:'2026-11-08'}});s.execute({type:'dependency.set',payload:{id:next,predecessorIds:[id]}});s.execute({type:'item.focus',payload:{id,date:'2026-11-05'}});s.execute({type:'session.manual',payload:{taskId:id,date:'2026-11-03',minutes:15,summary:'合成投入'}});
 const before=s.snapshot(),old=before.state.tasks.find(t=>t.id===id)!,index=outlineIndex(before.state);assert.equal(itemPresentations(index,[],before.now).get(parent)!.descendantOverdue,1);
 const overdue=withRules(emptyFilter(),group([condition('dueAt','before',relative('now'))])),week=withRules(emptyFilter(),group([condition('dueAt','period','this-week')]));assert.equal(filterOutline(before.state,overdue,before.now).matches.has(id),true);assert.equal(filterOutline(before.state,week,before.now).matches.has(id),true);
 s.execute({type:'task.plan',payload:{id,date:old.plannedDate,dueAt:null,review:{nextDate:'2026-11-07'}}});const after=s.snapshot(),t=after.state.tasks.find(t=>t.id===id)!;
 assert.equal(t.dueAt,null);assert.equal(t.plannedDate,old.plannedDate);assert.equal(t.startedAt,old.startedAt);assert.equal(t.focusDate,old.focusDate);assert.equal(t.focusActive,old.focusActive);assert.equal(t.status,'open');assert.equal(t.completedAt,null);assert.deepEqual(after.state.sessions,before.state.sessions);assert.deepEqual(after.state.itemReviews,before.state.itemReviews);assert.equal(after.state.tasks.length,before.state.tasks.length);
 const activity=after.state.activities!.at(-1)!;assert.ok(activity.changes.some(c=>c.entityId===id&&c.field==='dueAt'&&c.before==='2026-11-04'&&c.after===null));assert.ok(activity.changes.some(c=>c.entityId===id&&c.field==='reviewSchedule'));
 assert.equal(filterOutline(after.state,overdue,after.now).matches.has(id),false);assert.equal(filterOutline(after.state,week,after.now).matches.has(id),false);const presentation=itemPresentations(outlineIndex(after.state),[],after.now);assert.equal(presentation.get(id)!.ownOverdue,false);assert.equal(presentation.get(parent)!.descendantOverdue,0);
 assert.equal(after.state.tasks.find(t=>t.id===next)!.dueAt,'2026-11-08');assert.equal(deriveDependencyStatuses(after.state).get(next)!.missingBaseline,true);
 assert.equal(reviewQueue(after.state,'2026-11-06').some(t=>t.id===id),false);for(const date of ['2026-11-07','2026-11-08','2026-12-01']){const queue=reviewQueue(after.state,date);assert.equal(queue.filter(t=>t.id===id).length,1);assert.equal(queue.find(t=>t.id===id)!.reviewSchedule!.lastReviewedAt,null);assert.equal(itemPresentations(outlineIndex(after.state),[],`${date}T12:00:00`).get(id)!.ownOverdue,false);}s.shutdown();
});
test('review queue excludes archived and deleted branches, without discarding stored schedules',()=>{
 const s=new JournalService(new Store(),clock),add=(title:string,parentId:string|null=null)=>s.execute({type:'outline.create',payload:{title,parentId,kind:'task'}}).state.tasks.at(-1)!.id,parent=add('父项'),child=add('子项',parent),visible=add('可见');for(const id of [child,visible])s.execute({type:'task.plan',payload:{id,date:null,review:{nextDate:'2026-11-07'}}});const state=s.snapshot().state,hidden=structuredClone(state);hidden.tasks.find(t=>t.id===parent)!.archived=true;assert.deepEqual(reviewQueue(hidden,'2026-11-08').map(t=>t.id),[visible]);assert.equal(hidden.tasks.find(t=>t.id===child)!.reviewSchedule!.enabled,true);hidden.tasks.find(t=>t.id===parent)!.archived=false;hidden.tasks.find(t=>t.id===child)!.archived=true;assert.deepEqual(reviewQueue(hidden,'2026-11-08').map(t=>t.id),[visible]);hidden.tasks.find(t=>t.id===child)!.archived=false;hidden.tasks.find(t=>t.id===parent)!.deletedAt='2026-11-05T00:00:00.000Z';assert.deepEqual(reviewQueue(hidden,'2026-11-08').map(t=>t.id),[visible]);assert.ok(reviewQueue(state,'2026-11-08').some(t=>t.id===child));s.shutdown();
});
