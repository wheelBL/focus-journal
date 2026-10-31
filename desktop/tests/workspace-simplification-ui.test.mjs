import {test} from 'node:test';
import assert from 'node:assert/strict';
import {appDom} from './app-dom.mjs';
import {emptyFilter} from '../core/filters.ts';
import {condition,group,withRules} from '../core/filter-rules.ts';

test('default outline is quiet, secondary controls remain keyboard-accessible, and completion stays reversible',async()=>{
 const h=await appDom();try{
  const id=h.add('验证视图选项');await h.mount();await h.click(h.label('事项'));
  assert.equal(document.querySelector('.filter-summary'),null);
  assert.equal([...document.querySelectorAll('.filter-controls button')].some(e=>e.textContent==='清除筛选'),false);
  const trigger=h.label('视图选项'),panel=h.query('.action-popover-panel');assert.equal(panel.hidden,true);
  await h.click(trigger);assert.equal(panel.hidden,false);await h.key(h.label('显示已完成'),'Escape');assert.equal(panel.hidden,true);assert.equal(document.activeElement,trigger);
  await h.click(h.label('完成验证视图选项'));assert.equal(document.querySelector(`[data-outline-id="${id}"]`),null);
  await h.click(h.button('撤销状态调整'));assert.ok(document.querySelector(`[data-outline-id="${id}"]`));
  await h.click(trigger);await h.click(h.label('显示已完成'));assert.equal(panel.hidden,false);assert.equal(h.label('显示已完成').checked,true);
 }finally{await h.close();}
});

test('saved-view disclosure saves full custom conditions and never hides nested OR logic',async()=>{
 const h=await appDom();try{
  h.add('有安排');await h.mount();await h.click(h.label('事项'));
  const rules=group([group([condition('status','is-not','done'),condition('title','contains','安排')],'any')]);
  await h.command({type:'view.save',payload:{name:'组合规则',filter:withRules(emptyFilter(),rules)}});
  await h.click(h.button('组合规则',h.query('[aria-label="事项视图"]')));assert.match(h.query('.filter-summary').textContent,/安排/);
  await h.click(h.label('视图选项'));await h.click(h.button('另存为新视图'));
  assert.equal(h.query('.action-popover-panel').hidden,true);await h.input(h.label('常用视图名称'),'保留组合');await h.click(h.button('保存',h.query('dialog')));
  assert.deepEqual(h.service.snapshot().state.views.find(v=>v.name==='保留组合').filter.rules,rules);
  await h.click(h.button('清除筛选'));assert.equal(document.querySelector('.filter-summary'),null);
 }finally{await h.close();}
});
