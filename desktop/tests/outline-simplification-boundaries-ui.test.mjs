import {test} from 'node:test';
import assert from 'node:assert/strict';
import {appDom} from './app-dom.mjs';
import {emptyFilter} from '../core/filters.ts';
import {condition,group,unfinishedRules,withRules} from '../core/filter-rules.ts';

test('only the complete default AND status pair is omitted; partial status and top-level OR stay explicit',async()=>{
 const h=await appDom();try{
  const open=h.add('进行中的工作'),done=h.add('已完成的工作'),cancelled=h.add('已取消的工作');
  h.service.execute({type:'task.status',payload:{id:done,status:'done'}});h.service.execute({type:'task.status',payload:{id:cancelled,status:'cancelled'}});
  for(const [name,rules] of [['仅排除完成',group([condition('status','is-not','done')])],['仅排除取消',group([condition('status','is-not','cancelled')])],['任一状态',group(unfinishedRules(),'any')]])h.service.execute({type:'view.save',payload:{name,filter:withRules(emptyFilter(),rules)}});
  await h.mount();await h.click(h.label('事项'));assert.equal(document.querySelector('.filter-summary'),null);
  const nav=h.query('[aria-label="事项视图"]');await h.click(h.button('仅排除完成',nav));
  assert.match(h.query('.filter-summary').textContent,/结束状态 不是 已完成/);assert.ok(h.query(`[data-outline-id="${open}"]`));assert.ok(h.query(`[data-outline-id="${cancelled}"]`));assert.equal(document.querySelector(`[data-outline-id="${done}"]`),null);
  await h.click(h.button('仅排除取消',nav));assert.match(h.query('.filter-summary').textContent,/结束状态 不是 已取消/);assert.ok(h.query(`[data-outline-id="${done}"]`));assert.equal(document.querySelector(`[data-outline-id="${cancelled}"]`),null);
  await h.click(h.button('任一状态',nav));assert.match(h.query('.filter-summary').textContent,/满足任一.*已完成.*或.*已取消/);assert.ok(h.query(`[data-outline-id="${done}"]`));assert.ok(h.query(`[data-outline-id="${cancelled}"]`));
 }finally{await h.close();}
});

test('review subtree retains display, details and undo controls without inheriting saved-view filters',async()=>{
 const h=await appDom();try{
  const parent=h.add('审视范围',null),child=h.add('已完成子项',parent),active=h.add('可推进子项',parent),outside=h.add('范围外事项',null);
  h.service.execute({type:'task.status',payload:{id:child,status:'done'}});
  h.service.execute({type:'item-review.configure',payload:{id:parent,enabled:true,nextDate:'2026-10-19',interval:{unit:'weeks',count:1}}});
  h.service.execute({type:'view.save',payload:{name:'工作视图只看范围外',filter:{...emptyFilter(),scopeId:outside}}});
  await h.mount();await h.click(h.label('事项'));await h.click(h.button('工作视图只看范围外',h.query('[aria-label="事项视图"]')));
  await h.click(h.label('回顾'));assert.match(h.query('.outline-scope').textContent,/独立于工作视图筛选/);assert.equal(document.querySelector('.saved-view-select'),null);assert.equal(document.querySelector(`[data-outline-id="${outside}"]`),null);
  await h.click(h.label('显示已完成'));assert.ok(h.query(`[data-outline-id="${child}"]`));
  await h.click(h.label('收起详情'));assert.equal(document.querySelector('.task-inspector'),null);await h.click(h.button('详情'));assert.ok(h.query('.task-inspector'));
  await h.click(h.label('折叠全部'));assert.equal(document.querySelector(`[data-outline-id="${active}"]`),null);await h.click(h.label('展开全部'));assert.ok(h.query(`[data-outline-id="${active}"]`));
  await h.click(h.label('完成可推进子项'));assert.equal(h.get(active).status,'done');await h.click(h.button('撤销状态调整'));assert.equal(h.get(active).status,'open');
  await h.command({type:'outline.patch',payload:{id:active,field:'title',value:'改名后子项'}});await h.click(h.label('撤销整理操作'));assert.equal(h.get(active).title,'可推进子项');
  await h.click(h.label('事项'));assert.match(h.query('.tree-page-header h1').textContent,/工作视图只看范围外/);assert.ok(h.query(`[data-outline-id="${outside}"]`));assert.equal(document.querySelector(`[data-outline-id="${parent}"]`),null);
 }finally{await h.close();}
});
