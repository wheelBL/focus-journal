import {test} from 'node:test';
import assert from 'node:assert/strict';
import {appDom} from './app-dom.mjs';

async function select(h,id){await h.click(h.query(`[data-outline-id="${id}"]`));}
const isExtra=element=>!!element.closest('.inspector-more-arrangements');

test('inspector path shows ancestors once, keeps parent navigation, and omits an empty root breadcrumb',async()=>{
 const h=await appDom();try{
  const parent=h.add('父事项',null),child=h.add('正在处理的子事项',parent);await h.mount();await h.click(h.label('事项'));await select(h,child);
  assert.equal(h.query('.node-breadcrumb').textContent,'父事项');assert.equal(h.query('.inspector-title').textContent,'正在处理的子事项');
  await h.click(h.button('父事项',h.query('.node-breadcrumb')));assert.equal(h.query('.inspector-title').textContent,'父事项');assert.equal(document.querySelector('.node-breadcrumb'),null);
  assert.ok(h.query('.inspector-children'));await h.click(h.query('.inspector-children > summary'));await h.click(h.button('正在处理的子事项',h.query('.inspector-children')));assert.equal(h.query('.inspector-title').textContent,'正在处理的子事项');
 }finally{await h.close();}
});

test('empty optional arrangements are folded while plan, deadline, custom tags and one-click timing remain direct',async()=>{
 const h=await appDom();try{
  const id=h.add('简单事项',null);await h.mount();await h.click(h.label('事项'));await select(h,id);
  const extra=h.query('.inspector-more-arrangements');assert.equal(extra.open,false);
  for(const name of ['详情计划开始：未填写','详情截止时间：未设置','自定义标签'])assert.equal(isExtra(h.label(name)),false);
  assert.equal(isExtra(h.button('设置提醒')),true);assert.equal(isExtra(h.button('不重复')),true);assert.equal(isExtra(h.query('.regular-review-settings')),true);
  await h.click(h.query('.inspector-focus > button'));assert.equal(h.service.snapshot().timers[0].taskId,id);assert.match(h.query('.node-meta .item-status').textContent,/正在计时/);assert.ok(h.button('暂停',h.query('.compact-timer')));assert.ok(h.button('结束本次',h.query('.compact-timer')));
  await h.click(h.query('.inspector-more-arrangements > summary'));assert.equal(extra.open,true);await h.click(h.button('设置提醒'));await h.input(h.label('提醒时间'),'2026-10-22T08:30');await h.click(h.button('保存提醒'));
  assert.equal(isExtra(h.button('2026-10-22 08:30')),false);assert.ok(h.get(id).reminder);assert.ok(h.query('.inspector-history'));assert.ok(h.query('.lifecycle-actions'));
 }finally{await h.close();}
});

test('configured reminder, repeat and review remain visible and optional disclosure disappears when unnecessary',async()=>{
 const h=await appDom();try{
  const id=h.add('有完整安排',null,{plannedDate:'2026-10-19'});
  h.service.execute({type:'item-reminder.set',payload:{id,at:'2026-10-22T08:30:00+08:00'}});
  h.service.execute({type:'recurrence.set',payload:{id,rule:{mode:'calendar',unit:'week',interval:1,anchor:'2026-10-19',weekdays:[1],until:null}}});
  h.service.execute({type:'item-review.configure',payload:{id,enabled:true,nextDate:'2026-10-25',interval:{unit:'weeks',count:1}}});
  await h.mount();await h.click(h.label('事项'));await select(h,id);
  assert.equal(document.querySelector('.inspector-more-arrangements'),null);assert.equal(isExtra(h.query('.item-reminder-control')),false);assert.equal(isExtra(h.query('.recurrence-control')),false);assert.equal(isExtra(h.query('.regular-review-settings')),false);assert.match(h.query('.regular-review-settings > summary').textContent,/2026-10-25/);
  await h.click(h.query('.recurrence-heading button'));await h.click(h.button('停止重复'));assert.equal(h.get(id).recurrence,null);assert.equal(h.query('.inspector-more-arrangements').open,false);assert.equal(isExtra(h.button('不重复')),true);assert.equal(isExtra(h.query('.item-reminder-control')),false);
 }finally{await h.close();}
});

test('secondary inspector actions open deliberately, support Escape and outside dismissal, and retain branch focus',async()=>{
 const h=await appDom();try{
  const parent=h.add('独立分支',null);h.add('分支中的事项',parent);const other=h.add('另一分支',null);await h.mount();await h.click(h.label('事项'));await select(h,parent);
  const trigger=h.query('.inspector-more-actions > button'),panel=h.query('.inspector-more-actions [role=group]');assert.equal(trigger.getAttribute('aria-expanded'),'false');assert.equal(panel.hidden,true);
  await h.click(trigger);assert.equal(panel.hidden,false);await h.action(()=>h.button('聚焦此分支',panel).focus());await h.key(document.activeElement,'Escape');assert.equal(panel.hidden,true);assert.equal(document.activeElement,trigger);
  await h.click(trigger);await h.action(()=>document.body.dispatchEvent(new MouseEvent('pointerdown',{bubbles:true})));assert.equal(panel.hidden,true);
  await h.click(trigger);await h.click(h.button('聚焦此分支',panel));assert.equal(panel.hidden,true);assert.equal(document.querySelector(`[data-outline-id="${other}"]`),null);assert.ok(document.querySelector(`[data-outline-id="${parent}"]`));
  await h.click(trigger);await h.click(h.button('AI 帮我梳理',panel));assert.ok(h.query('.ai-assistant'));assert.equal(panel.hidden,true);
 }finally{await h.close();}
});
