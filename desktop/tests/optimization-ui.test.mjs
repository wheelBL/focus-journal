import {test} from 'node:test';
import assert from 'node:assert/strict';
import {appDom} from './app-dom.mjs';
import {emptyFilter} from '../core/filters.ts';

test('multi-line rapid logging preserves the first line as title and following lines as literal body',async()=>{
 const h=await appDom();try{await h.mount();const input=h.label('快速添加事项名称');await h.input(input,'- 接口备忘 %参考\n明天截止是示例文字。\n保留 #标题 和 %原文');await h.key(input,'Enter');const item=h.service.snapshot().state.tasks.at(-1);assert.equal(item.title,'接口备忘');assert.equal(item.description,'明天截止是示例文字。\n保留 #标题 和 %原文');assert.equal(item.tagIds.length,1);assert.equal(item.dueAt,null);}finally{await h.close();}
});

test('editing an unrelated preview field cannot silently discard an unrecognized date',async()=>{
 const h=await appDom();try{await h.mount();const input=h.label('快速添加事项名称');await h.input(input,'写方案 2026-02-30截止');await h.click(h.button('修改预览'));const title=[...document.querySelectorAll('.capture-editor .field')].find(e=>e.textContent.startsWith('保存名称')).querySelector('input');await h.input(title,'新方案名称');await h.key(input,'Enter');assert.equal(h.service.snapshot().state.tasks.filter(t=>t.id!=='inbox').length,0);assert.match(document.body.textContent,/无法识别时间/);assert.ok(input.value.includes('2026-02-30'));}finally{await h.close();}
});

test('tree range selection has a stable anchor, contracts when reversed and clears on a different filter',async()=>{
 const h=await appDom();try{
  const ids=['甲','乙','丙','丁'].map(title=>h.add(title));await h.mount();await h.click(h.label('事项'));await h.input(h.label('视图排序'),'manual');const row=id=>h.query(`[data-outline-id="${id}"]`),selected=()=>[...document.querySelectorAll('.batch-selected')].map(e=>e.dataset.outlineId),shiftClick=id=>h.action(()=>row(id).dispatchEvent(new MouseEvent('click',{bubbles:true,shiftKey:true})));
  await h.click(row(ids[0]));await shiftClick(ids[3]);assert.deepEqual(selected(),ids);await shiftClick(ids[1]);assert.deepEqual(selected(),ids.slice(0,2));
  await h.click(row(ids[0]));await h.key(row(ids[0]),'ArrowDown',{shiftKey:true});await h.key(row(ids[1]),'ArrowDown',{shiftKey:true});await h.key(row(ids[2]),'ArrowUp',{shiftKey:true});assert.deepEqual(selected(),ids.slice(0,2));
  await h.input(h.label('在事项树中搜索'),'丁');assert.equal(document.querySelector('.batch-toolbar'),null);assert.equal(h.get(ids[0]).status,'open');
 }finally{await h.close();}
});

test('relative date views roll into a new local day without a data edit or manual reload',async()=>{
 const h=await appDom();try{
  const a=h.add('今天计划','inbox',{plannedDate:'2026-10-19'}),b=h.add('明天计划','inbox',{plannedDate:'2026-10-20'});
  const view=h.service.execute({type:'view.save',payload:{name:'当天计划',filter:{...emptyFilter(),planned:'today'}}}).state.views[0];window.journal.clock=async()=>h.service.clockSnapshot();
  await h.mount();await h.click(h.label('事项'));await h.input(h.label('常用视图'),view.id);assert.ok(document.querySelector(`[data-outline-id="${a}"]`));assert.equal(document.querySelector(`[data-outline-id="${b}"]`),null);
  h.clock.advance(86400000);await h.action(()=>new Promise(r=>setTimeout(r,1200)));assert.equal(document.querySelector(`[data-outline-id="${a}"]`),null);assert.ok(document.querySelector(`[data-outline-id="${b}"]`));
 }finally{await h.close();}
});

test('minute boundaries update visible deadline state without loading the complete journal',async()=>{
 const h=await appDom();try{
  const id=h.add('即将到期','inbox',{dueAt:new Date('2026-10-19T14:01:00').toISOString()});let loads=0;
  window.journal.snapshot=async()=>{loads++;return h.service.snapshot();};window.journal.clock=async()=>h.service.clockSnapshot();await h.mount();await h.click(h.label('事项'));const before=loads;assert.equal(document.querySelector(`[data-outline-id="${id}"] .tree-deadline.overdue`),null);
  h.clock.advance(120000);await h.action(()=>new Promise(r=>setTimeout(r,1200)));assert.ok(document.querySelector(`[data-outline-id="${id}"] .tree-deadline.overdue`));assert.equal(loads,before);
 }finally{await h.close();}
});
