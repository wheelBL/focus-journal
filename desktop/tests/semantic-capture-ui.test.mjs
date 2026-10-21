import {test} from 'node:test';
import assert from 'node:assert/strict';
import {appDom} from './app-dom.mjs';

test('rapid logging previews, literal correction, nested input and events use one real save flow',async t=>{
 const h=await appDom();try{
  const work=h.add('工作');await h.mount();
  await t.test('Today preview parses metadata and Enter creates a task without starting a timer',async()=>{
   const input=h.label('快速添加事项名称');await h.input(input,'. 📌 写周报 #收件箱/工作 %写作 明天开始 周五截止 估计50分钟');assert.match(h.query('.capture-preview').textContent,/保存名称：📌 写周报/);assert.equal(document.querySelector('[role="listbox"]'),null);await h.key(input,'Enter');const item=h.service.snapshot().state.tasks.at(-1);assert.equal(item.title,'📌 写周报');assert.equal(item.parentId,work);assert.equal(item.estimateMinutes,50);assert.equal(item.dueAt,'2026-10-23');assert.equal(h.service.snapshot().timers.length,0);
  });
  await t.test('literal correction leaves the recognized phrase in the saved title; errors retain drafts',async()=>{
   const input=h.label('快速添加事项名称');await h.input(input,'调查 明天截止');await h.click(h.button('修改预览'));await h.click(h.button('明天截止'));await h.key(input,'Enter');assert.equal(h.service.snapshot().state.tasks.at(-1).title,'调查 明天截止');assert.equal(h.service.snapshot().state.tasks.at(-1).dueAt,null);
   await h.input(input,'重要内容 #不存在');await h.key(input,'Enter');assert.equal(input.value,'重要内容 #不存在');assert.match(document.body.textContent,/找不到/);await h.input(input,'');
  });
  await t.test('event capture renders an information inspector and distinct calendar block with zero effort',async()=>{
   const input=h.label('快速添加事项名称');await h.input(input,'o 今天14:00-15:00 团队讨论 今天13:50提醒 %会议');await h.key(input,'Enter');const event=h.service.snapshot().state.tasks.at(-1);assert.equal(event.itemType,'event');assert.equal(event.reminder.state,'scheduled');await h.click(h.label('事项'));await h.click(h.query(`[data-outline-id="${event.id}"]`));assert.match(h.query('.task-inspector').textContent,/事件详情/);assert.equal(h.query(`[data-outline-id="${event.id}"]`).querySelector('input[type="checkbox"]'),null);assert.equal(h.service.snapshot().state.sessions.length,0);await h.click(h.label('日历'));assert.ok(document.querySelector('.calendar-scheduled-event'));
  });
  await t.test('tree capture retains Tab nesting and previews free tags and deadline',async()=>{
   await h.click(h.label('事项'));await h.click(h.query(`[data-outline-id="${work}"]`));await h.key(h.query(`[data-outline-id="${work}"]`),'Insert');const input=h.label('新事项名称');await h.input(input,'- 参考信息 %资料');await h.key(input,'Tab');await h.key(input,'Enter',{ctrlKey:true});const note=h.service.snapshot().state.tasks.at(-1);assert.equal(note.parentId,work);assert.equal(note.itemType,'note');assert.equal(note.tagIds.length,1);
  });
 }finally{await h.close();}
});

test('multiselect impact, undo, focus and persistent workspace stay independent of planning and time',async t=>{
 const h=await appDom();try{
  const a=h.add('甲'),b=h.add('乙'),note=h.add('- 信息');await h.mount();await h.click(h.label('事项'));const row=id=>h.query(`[data-outline-id="${id}"]`);
  await t.test('Ctrl click selects two records and batch date preview skips the note',async()=>{
   await h.click(row(a));await h.action(()=>row(note).dispatchEvent(new MouseEvent('click',{bubbles:true,ctrlKey:true})));assert.match(h.query('.batch-toolbar').textContent,/已选 2 条/);await h.click(h.button('整理所选…'));await h.input(h.label('批量操作'),'plannedDate');await h.input(h.label('批量计划开始'),'2026-10-22');assert.match(h.query('.batch-impact').textContent,/1 条笔记或事件不适用/);await h.click(h.button('确认计划开始'));assert.equal(h.get(a).plannedDate,'2026-10-22');assert.equal(h.get(note).plannedDate,null);await h.click(h.label('撤销整理操作'));assert.equal(h.get(a).plannedDate,null);
  });
  await t.test('focus selection does not move a planned date and the tree state is durably saved',async()=>{
   await h.click(row(a));await h.click(h.label('加入今日重点 甲'));assert.equal(h.get(a).focusDate,'2026-10-19');assert.equal(h.get(a).plannedDate,null);await h.click(h.label('收起详情'));await h.input(h.label('在事项树中搜索'),'甲');const stored=JSON.parse(window.localStorage.getItem('journal.tree.full app scenario tests'));assert.equal(stored.selected,a);assert.equal(stored.showDetails,false);assert.equal(stored.filter.query,'甲');await h.click(h.label('今日'));assert.match(document.body.textContent,/今日重点/);assert.equal(JSON.parse(window.localStorage.getItem('journal.location')).view,'today');
  });
 }finally{await h.close();}
});

test('clock updates live row text without requesting the full journal each second',async()=>{
 const h=await appDom();try{
  const id=h.add('计时中的事项');h.service.execute({type:'focus.start',payload:{taskId:id}});let snapshots=0;window.journal.snapshot=async()=>{snapshots++;return h.service.snapshot();};window.journal.clock=async()=>h.service.clockSnapshot();await h.mount();await h.click(h.label('事项'));const before=snapshots;h.clock.advance(4000);await h.action(()=>new Promise(r=>setTimeout(r,1100)));assert.match(h.query(`[data-outline-id="${id}"] .row-timer`).textContent,/00:04/);assert.equal(snapshots,before);
 }finally{await h.close();}
});
