import {test} from 'node:test';
import assert from 'node:assert/strict';
import {emptyState,type JournalState} from '../core/types';
import {JournalService} from '../core/service';
import {emptyFilter,filterOutline,validateFilter} from '../core/filters';
import {allowsStatus,canToggleCompleted,condition,filterSignature,group,relative,replaceFields,rulesFor,simpleStatusValue,unfinishedRules,withRules} from '../core/filter-rules';
import {projectOutline} from '../src/outline-projection';
import {readTree} from '../src/workspace-state';

function setup(){
 class Store{path='filter-regression';state=emptyState();load(){return structuredClone(this.state);}save(s:JournalState){this.state=structuredClone(s);}close(){}}
 const service=new JournalService(new Store(),{now:()=>Date.parse('2026-10-20T12:00:00+08:00'),monotonic:()=>0});
 const add=(title:string,parentId:string|null=null,dueAt:string|null=null)=>service.execute({type:'task.save',payload:{title,parentId,dueAt}}).state.tasks.at(-1)!.id;
 return {service,add};
}
const weekly=()=>withRules(emptyFilter(),group([condition('status','is','open'),condition('dueAt','before',relative('next-week'))]));

test('legacy saved unfinished weekly view excludes handed-off items and their context-only ancestors',()=>{
 const {service,add}=setup(),parent=add('无截止父级'),id=add('本周交接',parent,'2026-10-23');
 const filter={...emptyFilter(),rules:group([condition('status','is-not','done'),condition('status','is-not','cancelled'),condition('dueAt','before',relative('next-week'))])};
 assert.equal(filterOutline(service.snapshot().state,filter,service.snapshot().now).matches.has(id),true);
 service.execute({type:'item.handoff',payload:{id,assignee:'同事'}});const backup=JSON.parse(service.exportJson());backup.state.views.push({id:'legacy-week',name:'本周待完成',filter});service.importJson(JSON.stringify(backup));
 const s=service.snapshot(),result=filterOutline(s.state,s.state.views.at(-1)!.filter,s.now);assert.equal(result.matches.has(id),false);assert.equal(result.keep.has(parent),false);assert.equal(result.matches.size,0);
 const updated=rulesFor(filter);assert.equal(simpleStatusValue(updated.children.filter(c=>c.kind==='condition')),'unfinished');assert.equal(allowsStatus(updated,'handed-off'),false);assert.equal(JSON.stringify(filter.rules).includes('handed-off'),false,'reading never mutates the saved original');
 assert.deepEqual(rulesFor({...filter,rules:updated}),updated);
});

test('explicit advanced closed-state choices keep their meaning alongside legacy exclusions',()=>{
 const explicit=group([condition('status','is-not','done'),condition('status','is-not','cancelled'),condition('status','is','handed-off')]);
 assert.strictEqual(rulesFor({...emptyFilter(),rules:explicit}),explicit);
 const any=group([condition('status','is-not','done'),condition('status','is-not','cancelled')],'any');assert.strictEqual(rulesFor({...emptyFilter(),rules:any}),any);
 const mixed=group([condition('status','is-not','done'),condition('status','is-not','cancelled'),group([condition('status','is','handed-off'),condition('title','contains','周报')],'any')]);assert.strictEqual(rulesFor({...emptyFilter(),rules:mixed}),mixed);
});

test('closed child stops keeping every undated ancestor; independent matching siblings and parent dates survive',()=>{
 const {service,add}=setup(),root=add('父级'),branch=add('分支',root),a=add('本周子项',branch,'2026-10-23'),other=add('另一个待办',null,'2026-10-25');
 let s=service.snapshot(),f=weekly();assert.ok(filterOutline(s.state,f,s.now).keep.has(root));
 service.execute({type:'task.status',payload:{id:a,status:'done'}});s=service.snapshot();
 let result=filterOutline(s.state,f,s.now);assert.deepEqual([...result.matches],[other]);assert.ok(!result.keep.has(root));assert.ok(!result.keep.has(branch));
 service.execute({type:'task.status',payload:{id:a,status:'open'}});s=service.snapshot();assert.ok(filterOutline(s.state,f,s.now).keep.has(root));
 service.execute({type:'task.status',payload:{id:a,status:'cancelled'}});s=service.snapshot();assert.ok(!filterOutline(s.state,f,s.now).keep.has(root));
 service.execute({type:'outline.patch',payload:{id:root,field:'dueAt',value:'2026-10-24'}});s=service.snapshot();result=filterOutline(s.state,f,s.now);assert.ok(result.matches.has(root));assert.ok(!result.keep.has(branch));
});

test('checkbox projection follows exclusions and nested AND/OR without rewriting their meaning',()=>{
 const base=withRules(emptyFilter(),group([condition('dueAt','before',relative('next-week'))]));
 const hidden=replaceFields(base,['status'],unfinishedRules());assert.equal(hidden.showDone,false);assert.equal(simpleStatusValue(rulesFor(hidden).children as any),'unfinished');
 assert.equal(canToggleCompleted(hidden),true);assert.equal(replaceFields(hidden,['status'],[]).showDone,true);
 const nested=group([group([condition('status','is','done'),condition('status','is','open')],'any'),condition('dueAt','set')]);
 assert.equal(allowsStatus(nested,'done'),true);assert.equal(canToggleCompleted(withRules(base,nested)),false);
 assert.equal(canToggleCompleted(withRules(base,group([condition('status','is','cancelled')]))),false);
 assert.equal(canToggleCompleted(withRules(base,group([condition('title','contains','a'),condition('title','contains','b')],'any'))),true);
 const excluded=group([group([condition('status','is','open'),condition('status','is','cancelled')],'any')]);
 assert.equal(allowsStatus(excluded,'done'),false);
 const state=emptyState(),stale={...hidden,showDone:true};assert.equal(validateFilter(stale,state).showDone,false);assert.equal(filterSignature(stale),filterSignature(hidden));
});

test('saved filtered views survive persistence with coherent flags and exclude finished descendants in flat and tree',()=>{
 const {service,add}=setup(),root=add('项目'),a=add('即将完成',root,'2026-10-23');
 const filter=replaceFields(withRules(emptyFilter(),group([condition('dueAt','before',relative('next-week'))])),['status'],unfinishedRules());
 service.execute({type:'view.save',payload:{name:'本周需完成',filter:{...filter,showDone:true}}});assert.equal(service.snapshot().state.views[0].filter.showDone,false);
 service.execute({type:'task.status',payload:{id:a,status:'done'}});service.importJson(service.exportJson());
 const s=service.snapshot(),r=filterOutline(s.state,s.state.views[0].filter,s.now);
 for(const layout of ['tree','flat'] as const)assert.equal(projectOutline(r.index,r.keep,r.matches,r.retained,null,new Set(),layout,n=>n).length,0);
});

test('retaining a moved item outside a nested scope never disconnects the genuine matches',()=>{
 const {service,add}=setup(),outer=add('外层'),scope=add('范围',outer),match=add('仍在范围内',scope,'2026-10-23'),outside=add('编辑中移出了范围');
 const s=service.snapshot(),r=filterOutline(s.state,{...weekly(),scopeId:scope},s.now,outside),rows=projectOutline(r.index,r.keep,r.matches,r.retained,null,new Set(),'tree',n=>n);
 assert.deepEqual([...r.matches],[match]);assert.ok(rows.some(r=>r.node.id===match));assert.ok(rows.some(r=>r.node.id===outside));assert.ok(r.keep.has(outer));
});

test('workspace restore drops transient retained rows and recovers valid saved criteria instead of mislabeled all-items',()=>{
 const {service,add}=setup(),a=add('事项',null,'2026-10-23');service.execute({type:'view.save',payload:{name:'本周',filter:weekly()}});
 const state=service.snapshot().state,view=state.views[0],values=new Map<string,string>();
 const previous=(globalThis as any).window;(globalThis as any).window={localStorage:{getItem:(key:string)=>values.get(key)??null}};
 try{
  values.set('tree',JSON.stringify({selected:a,retained:a,filter:{...view.filter,showDone:true},activeView:view.id,collapsed:[],scrollTop:120}));
  let restored=readTree('tree',state)!;assert.equal(restored.retained,null);assert.equal(restored.selected,a);assert.equal(restored.scrollTop,120);assert.equal(restored.filter.showDone,false);
  values.set('tree',JSON.stringify({filter:{...weekly(),scopeId:'removed'},activeView:view.id}));
  restored=readTree('tree',state)!;assert.equal(restored.activeView,view.id);assert.equal(filterSignature(restored.filter),filterSignature(view.filter));
  restored=readTree('tree',{...state,views:[]})!;assert.equal(restored.activeView,'');assert.equal(filterSignature(restored.filter),filterSignature(emptyFilter()));
 }finally{(globalThis as any).window=previous;}
});
