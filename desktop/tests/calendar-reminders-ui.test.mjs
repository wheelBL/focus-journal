import {test} from 'node:test';
import assert from 'node:assert/strict';
import {appDom} from './app-dom.mjs';

test('double click a scrolled calendar slot creates an item with editable time, no effort or implicit plan',async()=>{
 const h=await appDom();try{
  await h.mount();await h.click(h.label('日历'));const column=h.query('.day-column');column.getBoundingClientRect=()=>({top:-200,height:1152});
  await h.action(()=>column.dispatchEvent(new MouseEvent('dblclick',{bubbles:true,clientY:400})));
  assert.equal(h.label('提醒时间').value,'2026-10-19T12:30');await h.input(h.label('事项名称'),'交材料');await h.click(h.button('保存提醒'));
  const task=h.service.snapshot().state.tasks.at(-1);assert.equal(new Date(task.reminder.at).getHours(),12);assert.equal(task.plannedDate,null);assert.equal(task.dueAt,null);assert.equal(h.service.snapshot().state.sessions.length,0);
  await h.click(h.query('.calendar-reminder'));await h.click(h.button('2026-10-19 12:30'));await h.input(h.label('提醒时间'),'2026-10-20T15:45');await h.click(h.button('保存提醒'));assert.equal(new Date(h.get(task.id).reminder.at).getDate(),20);
 }finally{await h.close();}
});
test('month blank cells and keyboard create reminders; the date button still opens day effort',async()=>{
 const h=await appDom();try{
  await h.mount();await h.click(h.label('日历'));await h.click(h.button('月'));const cell=h.label('2026-10-23，双击添加提醒');await h.action(()=>cell.dispatchEvent(new MouseEvent('dblclick',{bubbles:true})));
  assert.equal(h.label('提醒时间').value,'2026-10-23T09:00');await h.click(h.button('取消'));await h.key(cell,'Enter');assert.equal(h.label('提醒时间').value,'2026-10-23T09:00');await h.click(h.button('取消'));
  await h.click(h.label('查看 2026-10-23 的投入'));assert.equal(document.querySelectorAll('.day-column').length,1);await h.click(h.button('添加提醒'));assert.equal(h.label('提醒时间').value,'2026-10-23T09:00');
 }finally{await h.close();}
});
test('existing task reminders are reachable from tree details and removable',async()=>{
 const h=await appDom();try{const id=h.add('读书');await h.mount();await h.click(h.label('事项'));await h.click(h.query('[data-outline-id="'+id+'"]'));await h.click(h.query('.inspector-more-arrangements > summary'));await h.click(h.button('设置提醒'));await h.input(h.label('提醒时间'),'2026-10-22T08:30');await h.click(h.button('保存提醒'));assert.ok(h.get(id).reminder);await h.click(h.button('2026-10-22 08:30'));await h.click(h.button('移除提醒'));assert.equal(h.get(id).reminder,null);}finally{await h.close();}
});

test('quick capture only creates an item; old notes stay on the timeline and timers keep their own work',async()=>{
 const h=await appDom();try{
  const work=h.add('正在推进');h.service.execute({type:'note.add',payload:{kind:'event',text:'已有事件记录'}});h.service.execute({type:'focus.start',payload:{taskId:work,skipEstimate:true}});
  await h.mount();assert.ok(document.body.textContent.includes('已有事件记录'));assert.equal(document.querySelector('.capture-kinds'),null);const input=h.label('快速添加事项名称');await h.input(input,'临时想到的事情');await h.key(input,'Enter');
  const state=h.service.snapshot();assert.equal(state.state.tasks.at(-1).title,'临时想到的事情');assert.equal(state.state.tasks.at(-1).parentId,'inbox');assert.equal(state.state.notes.length,1);assert.equal(state.timers.length,1);assert.equal(state.timers[0].taskId,work);assert.equal(input.value,'');
 }finally{await h.close();}
});

test('save-view modal gives confirmation, preserves errors and applies the saved conditions',async()=>{
 const h=await appDom();try{
  h.add('本周提交','inbox',{dueAt:'2026-10-23'});await h.mount();await h.click(h.label('事项'));await h.click(h.button('筛选'));await h.input(h.label('筛选截止时间'),'through-week');await h.click(h.label('视图选项'));await h.click(h.button('保存视图'));
  assert.equal(h.query('dialog').getAttribute('aria-label'),'保存当前视图');await h.input(h.label('常用视图名称'),'本周需完成');await h.click(h.button('保存'));assert.ok(h.service.snapshot().state.views.some(v=>v.name==='本周需完成'));assert.match(h.query('.toast').textContent,/已保存/);
  await h.click(h.label('视图选项'));await h.click(h.button('另存为新视图'));await h.input(h.label('常用视图名称'),'本周需完成');await h.click(h.button('保存'));assert.match(h.query('dialog [role=alert]').textContent,/同名/);assert.equal(h.label('常用视图名称').value,'本周需完成');await h.input(h.label('常用视图名称'),'本周另一视图');await h.click(h.button('保存'));assert.equal(h.service.snapshot().state.views.length,2);
 }finally{await h.close();}
});
