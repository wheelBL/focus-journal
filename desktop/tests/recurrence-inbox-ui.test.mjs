import {test} from 'node:test';
import assert from 'node:assert/strict';
import {appDom} from './app-dom.mjs';

test('Inbox exposes ordinary project toggle, edit, timing and lifecycle; details have no move controls',async()=>{
 const h=await appDom();try{
  await h.mount();await h.click(h.label('事项'));const row=()=>h.query('[data-outline-id="inbox"]');
  await h.click(row());assert.ok(document.querySelector('.task-inspector'));assert.equal(document.querySelector('.move-control'),null);
  await h.context(row());await h.click(h.button('取消项目标记'));assert.equal(h.get('inbox').isProject,false);assert.ok(!row().classList.contains('project'));
  await h.key(row(),'F2');await h.input(h.label('名称 收件箱'),'待整理');await h.key(h.label('名称 收件箱'),'Enter');assert.equal(h.get('inbox').title,'待整理');
  await h.click(h.label('开始待整理'));assert.equal(h.service.snapshot().timers[0].taskId,'inbox');assert.match(row().querySelector('.tree-status').textContent,/正在计时/);
  await h.click(h.label('收起详情'));assert.equal(document.querySelector('.task-inspector'),null);
  await h.click(h.label('今日'));await h.click(h.label('事项'));assert.ok(document.querySelector('.task-inspector'));
 }finally{await h.close();}
});
test('repeat controls save weekly selected days, create one successor, stop and retain this occurrence',async()=>{
 const h=await appDom();try{
  const id=h.add('清理邮件','inbox',{plannedDate:'2026-10-19'});await h.mount();await h.click(h.label('事项'));await h.click(h.query(`[data-outline-id="${id}"]`));await h.click(h.query('.inspector-more-arrangements > summary'));await h.click(h.button('不重复'));
  await h.input(h.label('重复周期'),'week');await h.click(h.label('每周二'));await h.click(h.button('保存重复'));assert.deepEqual(h.get(id).recurrence.weekdays,[1,2]);
  await h.click(h.label('完成清理邮件'));const next=h.get(id).recurrenceNextId;assert.ok(next);assert.equal(h.get(next).plannedDate,'2026-10-20');assert.equal(h.get(id).status,'done');
  await h.click(h.query(`[data-outline-id="${next}"]`));await h.click(h.query('.recurrence-heading button'));await h.input(h.label('重复方式'),'completion');await h.input(h.label('重复间隔'),'2');await h.click(h.button('保存重复'));assert.equal(h.get(next).recurrence.mode,'completion');
  await h.click(h.query('.recurrence-heading button'));await h.click(h.button('停止重复'));assert.equal(h.get(next).recurrence,null);assert.equal(h.get(id).status,'done');
 }finally{await h.close();}
});
test('recurring events appear on each calendar occurrence and share an explicitly labelled series editor',async()=>{
 const h=await appDom();try{
  const id=h.add('o 周会');h.service.execute({type:'event.save',payload:{id,at:'2026-10-19T09:00:00+08:00',end:'2026-10-19T10:00:00+08:00'}});
  await h.mount();await h.click(h.label('事项'));await h.click(h.query(`[data-outline-id="${id}"]`));await h.click(h.button('不重复'));await h.input(h.label('重复周期'),'week');await h.click(h.label('每周三'));assert.match(document.querySelector('.recurrence-help').textContent,/整组/);await h.click(h.button('保存重复'));
  await h.click(h.label('日历'));assert.equal([...document.querySelectorAll('.calendar-scheduled-event')].filter(e=>e.textContent.includes('周会')).length,2);assert.equal(h.service.snapshot().state.sessions.length,0);await h.input(h.label('查看日期'),'2026-10-21');await h.click(h.label('今日'));assert.ok([...document.querySelectorAll('.note-entry')].some(e=>e.textContent.includes('周会')));
 }finally{await h.close();}
});
test('progress, urgency, branch progress and leaf affordances remain independent and text-readable',async()=>{
 const h=await appDom();try{
  const parent=h.add('父事项'),waiting=h.add('待启动叶子',parent),progress=h.add('已投入叶子',parent,{dueAt:'2026-10-19'}),paused=h.add('暂放叶子');
  h.service.execute({type:'session.manual',payload:{taskId:progress,date:'2026-10-18',minutes:15}});h.service.execute({type:'item.change',payload:{id:paused,action:'pause'}});
  await h.mount();await h.click(h.label('事项'));const row=id=>h.query(`[data-outline-id="${id}"]`);
  assert.equal(row(waiting).querySelector('.tree-status').textContent,'待启动');assert.equal(row(progress).querySelector('.tree-status').textContent,'进行中');assert.equal(row(progress).querySelector('.overdue-label').textContent,'逾期');
  assert.equal(row(parent).querySelector('.tree-status').textContent,'进行中');assert.equal(row(parent).querySelector('.branch-count').textContent,'0/2');assert.match(row(parent).querySelector('.child-overdue').textContent,/子项逾期 1/);assert.equal(row(waiting).querySelector('.branch-count'),null);assert.ok(row(parent).querySelector('.branch-icon'));
  assert.equal(row(paused).querySelector('.tree-status').textContent,'已暂停');await h.click(h.label('开始已投入叶子'));assert.equal(row(progress).querySelector('.tree-status').textContent,'正在计时');assert.ok(row(progress).querySelector('.overdue-label'));
 }finally{await h.close();}
});
