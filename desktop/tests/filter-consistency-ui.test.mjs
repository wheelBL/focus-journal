import {test} from 'node:test';
import assert from 'node:assert/strict';
import {appDom} from './app-dom.mjs';
import {emptyFilter} from '../core/filters.ts';
import {condition,group,relative,withRules} from '../core/filter-rules.ts';

test('date-only view explains finished matches, offers open-only, removes ancestor context and saves the choice',async()=>{
 const h=await appDom();try{
  const parent=h.add('无截止父项',null),closed=h.add('已闭环子项',parent,{dueAt:'2026-10-23'}),other=h.add('本周还有工作',null,{dueAt:'2026-10-24'});
  h.service.execute({type:'task.status',payload:{id:closed,status:'done'}});
  const f=withRules(emptyFilter(),group([condition('dueAt','before',relative('next-week'))]));
  h.service.execute({type:'view.save',payload:{name:'本周需完成',filter:f}});
  await h.mount();await h.click(h.label('事项'));await h.input(h.label('常用视图'),h.service.snapshot().state.views[0].id);
  const row=id=>document.querySelector(`[data-outline-id="${id}"]`);
  assert.match(row(parent).textContent,/父级路径/);assert.match(h.query('.closed-filter-hint').textContent,/1 个已结束/);
  await h.click(row(closed));assert.match(h.query('.inspector-title').textContent,/已闭环子项/);
  await h.click(h.button('只看未完成'));assert.equal(row(closed),null);assert.equal(row(parent),null);assert.ok(row(other));assert.equal(h.label('显示已完成').checked,false);
  assert.match(h.query('.inspector-title').textContent,/本周还有工作/);
  await h.click(h.button('更新当前视图'));await h.click(h.button('全部事项',h.query('[aria-label="事项视图"]')));await h.input(h.label('常用视图'),h.service.snapshot().state.views[0].id);
  assert.equal(row(parent),null);assert.equal(document.querySelector('.view-dirty'),null);
 }finally{await h.close();}
});

test('completed visibility toggles both directions, retains information and keeps quick filters editable',async()=>{
 const h=await appDom();try{
  const p=h.add('父项',null),closed=h.add('做完的',p),note=h.add('- 信息',null);h.service.execute({type:'task.status',payload:{id:closed,status:'done'}});
  await h.mount();await h.click(h.label('事项'));assert.equal(h.label('显示已完成').checked,false);
  assert.equal(document.querySelector(`[data-outline-id="${closed}"]`),null);assert.ok(document.querySelector(`[data-outline-id="${note}"]`));
  await h.click(h.button('筛选'));assert.equal(h.query('.quick-fields').disabled,false);assert.equal(h.label('筛选状态').value,'unfinished');
  await h.click(h.label('显示已完成'));assert.equal(h.label('显示已完成').checked,true);assert.ok(document.querySelector(`[data-outline-id="${closed}"]`));assert.equal(h.label('筛选状态').value,'any');
 }finally{await h.close();}
});

test('completion, reopening and cancellation cannot pin nonmatching rows or their parents',async()=>{
 const h=await appDom();try{
  const p=h.add('父项',null),a=h.add('当前事项',p,{dueAt:'2026-10-23'}),b=h.add('保留待办',null,{dueAt:'2026-10-23'});
  h.service.execute({type:'view.save',payload:{name:'未完成本周',filter:withRules(emptyFilter(),group([condition('status','is','open'),condition('dueAt','before',relative('next-week'))]))}});
  await h.mount();await h.click(h.label('事项'));await h.input(h.label('常用视图'),h.service.snapshot().state.views[0].id);
  const row=id=>document.querySelector(`[data-outline-id="${id}"]`);
  await h.click(h.label('完成当前事项'));assert.equal(row(a),null);assert.equal(row(p),null);assert.ok(row(b));assert.equal(document.querySelector('.retained-notice'),null);
  await h.click(h.button('撤销状态调整',h.query('.outline-toolbar')));assert.ok(row(a));await h.key(row(a),' ');assert.equal(row(a),null);
  await h.command({type:'task.status',payload:{id:a,status:'open'}});await h.click(row(a));await h.command({type:'task.status',payload:{id:a,status:'cancelled'}});assert.equal(row(a),null);assert.equal(row(p),null);
  await h.click(h.label('今日'));await h.click(h.label('事项'));assert.equal(row(a),null);assert.equal(row(p),null);
 }finally{await h.close();}
});

test('an edited row remains temporarily but expires after leaving Items; nested status rules cannot be flattened by a checkbox',async()=>{
 const h=await appDom();try{
  const a=h.add('原有名称',null);await h.mount();await h.click(h.label('事项'));await h.input(h.label('在事项树中搜索'),'原有');
  await h.click(h.query(`[data-outline-id="${a}"]`));await h.key(h.query(`[data-outline-id="${a}"]`),'F2');await h.input(h.label('名称 原有名称'),'编辑后名称');await h.key(h.label('名称 原有名称'),'Enter');
  assert.match(h.query(`[data-outline-id="${a}"]`).textContent,/暂留/);assert.ok(h.query('.retained-notice'));
  await h.click(h.label('今日'));await h.click(h.label('事项'));assert.equal(document.querySelector(`[data-outline-id="${a}"]`),null);
  const rules=group([group([condition('status','is','open'),condition('title','contains','编辑')],'any')]);
  await h.command({type:'view.save',payload:{name:'复杂条件',filter:withRules(emptyFilter(),rules)}});await h.input(h.label('常用视图'),h.service.snapshot().state.views[0].id);
  assert.equal(h.label('显示已完成').disabled,true);assert.deepEqual(h.service.snapshot().state.views[0].filter.rules,rules);
 }finally{await h.close();}
});
