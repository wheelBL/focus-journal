import {test} from 'node:test';
import assert from 'node:assert/strict';
import {emptyState} from '../core/types';
import {migrateOutline,outlineIndex} from '../core/outline';
import {parentOptions} from '../core/outline-options';
import {projectOutline} from '../src/outline-projection';
import {emptyFilter,filterOutline} from '../core/filters';

test('parent choices omit selected branches and unavailable ancestors while allowing paused parents',()=>{
 const state=emptyState(),base={projectId:'inbox',order:0,outcome:'',nextAction:'',estimateMinutes:null,plannedDate:null,dueAt:null,status:'open' as const,createdAt:'2026-10-20T00:00:00Z',startedAt:null,completedAt:null};
 state.tasks=[{...base,id:'a',title:'A',parentId:'inbox'},{...base,id:'b',title:'B',parentId:'a'},{...base,id:'closed',title:'关闭分支',parentId:'inbox',status:'done'},{...base,id:'hidden',title:'隐藏后代',parentId:'closed'},{...base,id:'paused',title:'暂停',parentId:'inbox',availability:'paused'}];
 const index=outlineIndex(migrateOutline(state));assert.deepEqual(parentOptions(index,['a']).map(p=>p.id),['inbox','paused']);assert.ok(parentOptions(index,[],'closed').some(p=>p.id==='closed'));assert.equal(parentOptions(index).find(p=>p.id==='b')?.label,'收件箱 / A / B');
});

test('filtered tree projection describes visible sibling position in display order, including flat mode',()=>{
 const state=emptyState(),base={projectId:'inbox',parentId:'inbox',outcome:'',nextAction:'',estimateMinutes:null,plannedDate:null,dueAt:null,status:'open' as const,createdAt:'2026-10-20T00:00:00Z',startedAt:null,completedAt:null};
 state.tasks=['丙','乙','甲'].map((title,i)=>({...base,id:String(i),title,order:i}));const migrated=migrateOutline(state),index=outlineIndex(migrated),filtered=filterOutline(migrated,emptyFilter(),base.createdAt,null,index),sort=(nodes:typeof index.ordered)=>nodes.slice().sort((a,b)=>b.order-a.order);
 const rows=projectOutline(index,filtered.keep,filtered.matches,null,null,new Set(),'tree',sort);assert.deepEqual(rows.slice(1).map(r=>[r.node.id,r.position,r.size]),[['2',1,3],['1',2,3],['0',3,3]]);
 const flat=projectOutline(index,filtered.keep,filtered.matches,null,null,new Set(),'flat',sort);assert.ok(flat.every(r=>r.depth===0&&r.size===4));assert.equal(flat[2].position,3);
});
