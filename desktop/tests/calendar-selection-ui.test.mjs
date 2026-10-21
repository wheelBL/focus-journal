import {test} from 'node:test';
import assert from 'node:assert/strict';
import {appDom} from './app-dom.mjs';
const pointer=(h,el,type,y)=>h.action(()=>{const e=new MouseEvent(type,{bubbles:true,cancelable:true,button:0,clientY:y});Object.defineProperty(e,'pointerId',{value:1});el.dispatchEvent(e);});
async function drag(h,from=432,to=480){
 const col=h.query('.day-column');col.getBoundingClientRect=()=>({top:0,height:1152});
 await pointer(h,col,'pointerdown',from);await pointer(h,col,'pointermove',to);assert.ok(h.query('.calendar-selection').textContent.includes('60 分钟'));await pointer(h,col,'pointerup',to);
}
test('dragging a range links actual effort to an existing item and supports correcting it from the calendar',async()=>{
 const h=await appDom();try{
  const id=h.add('撰写报告');await h.mount();await h.click(h.label('日历'));await drag(h);
  await h.click(h.button('补记投入已经做过的事'));assert.equal(h.label('实际开始').value,'2026-10-19T09:00');assert.equal(h.label('实际结束').value,'2026-10-19T10:00');
  await h.click(h.button('关联已有事项'));await h.input(h.label('查找事项'),'报告');await h.input(h.label('关联事项'),id);await h.input(h.label('这段时间的进展'),'完成初稿');await h.click(h.button('保存投入'));
  assert.equal(h.service.snapshot().state.sessions[0].durationMs,3600000);assert.equal(h.get(id).startedAt,new Date('2026-10-19T09:00').toISOString());assert.match(h.query('.toast').textContent,/实际开始和累计投入已更新/);
  await h.click(h.query('.calendar-event[data-session-id]'));await h.click(h.button('校正这段投入'));const fields=h.query('dialog').querySelectorAll('input[type=datetime-local]');await h.input(fields[1],'2026-10-19T09:45');await h.input(h.query('dialog input[maxlength="2000"]'),'扣除休息');await h.click(h.button('保存记录'));assert.equal(h.service.snapshot().state.sessions[0].durationMs,2700000);assert.equal(h.service.snapshot().state.audit.length,1);
 }finally{await h.close();}
});
test('range reminder can use an existing item and event creation keeps duration without effort',async()=>{
 const h=await appDom();try{
  const id=h.add('沟通材料');await h.mount();await h.click(h.label('日历'));await drag(h);await h.click(h.button('关联已有事项'));await h.input(h.label('关联事项'),id);await h.click(h.button('保存提醒'));
  assert.equal(h.get(id).reminder.at,new Date('2026-10-19T09:00').toISOString());assert.equal(h.service.snapshot().state.sessions.length,0);
  const col=h.query('.day-column');await h.key(col,'Enter');await h.click(h.button('添加事件保留一段安排'));await h.input(h.label('事件名称'),'团队沟通');await h.input(h.label('事件结束'),'2026-10-19T10:00');await h.click(h.button('保存事件'));
  assert.equal(h.service.snapshot().state.tasks.at(-1).eventEnd,new Date('2026-10-19T10:00').toISOString());assert.equal(h.service.snapshot().state.sessions.length,0);assert.ok(h.query('.calendar-scheduled-event'));
 }finally{await h.close();}
});
test('reverse selection and Escape cancel safely; errors retain the draft without orphan items',async()=>{
 const h=await appDom();try{
  await h.mount();await h.click(h.label('日历'));const col=h.query('.day-column');col.getBoundingClientRect=()=>({top:0,height:1152});await pointer(h,col,'pointerdown',480);await pointer(h,col,'pointermove',432);await h.key(col,'Escape');await pointer(h,col,'pointerup',432);assert.equal(document.querySelector('dialog'),null);assert.equal(document.querySelector('.calendar-selection'),null);
  await drag(h,480,432);await h.click(h.button('补记投入已经做过的事'));await h.input(h.label('事项名称'),'失败草稿');await h.input(h.label('实际开始'),'2026-10-20T09:00');await h.input(h.label('实际结束'),'2026-10-20T10:00');await h.click(h.button('保存投入'));
  assert.match(h.query('dialog [role=alert]').textContent,/未来/);assert.equal(h.label('事项名称').value,'失败草稿');assert.equal(h.service.snapshot().state.tasks.length,1);
  await h.input(h.label('实际开始'),'2026-10-19T09:00');await h.input(h.label('实际结束'),'2026-10-19T10:00');await h.click(h.button('保存投入'));assert.equal(h.service.snapshot().state.tasks.length,2);
 }finally{await h.close();}
});
test('layer controls, scale, context menu and record clicks do not start accidental selections',async()=>{
 const h=await appDom();try{
  h.service.execute({type:'calendar.save',payload:{mode:'event',title:'日程',start:new Date('2026-10-19T09:00').toISOString(),end:new Date('2026-10-19T10:00').toISOString()}});
  await h.mount();await h.click(h.label('日历'));await h.click(h.label('显示事件'));assert.equal(document.querySelector('.calendar-scheduled-event'),null);await h.click(h.label('显示事件'));assert.ok(h.query('.calendar-scheduled-event'));
  await h.input(h.label('时间刻度'),'96');assert.equal(h.query('.day-column').style.height,'2304px');assert.ok(h.query('.calendar-now-line'));
  const event=h.query('.calendar-scheduled-event');await pointer(h,event,'pointerdown',500);assert.equal(document.querySelector('.calendar-selection'),null);
  const col=h.query('.day-column');col.getBoundingClientRect=()=>({top:0,height:2304});await h.context(col);assert.equal(h.query('dialog').getAttribute('aria-label'),'安排这段时间');
  await h.click(h.button('取消'));await h.click(h.label('今日'));await h.click(h.label('日历'));assert.equal(h.label('时间刻度').value,'96');
 }finally{await h.close();}
});
