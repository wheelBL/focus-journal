import {test} from 'node:test';
import assert from 'node:assert/strict';
import {appDom} from './app-dom.mjs';

test('timed, manually added and reminder blocks share item color across views, navigation and later assignment',async()=>{
 const h=await appDom();try{
  const a=h.add('同一事项'),b=h.add('不同事项');
  h.service.execute({type:'focus.start',payload:{taskId:a}});h.clock.advance(600000);h.service.execute({type:'focus.stop',payload:{taskId:a}});
  for(const [taskId,start,end] of [[a,'09:00','09:30'],[b,'10:00','10:30']])h.service.execute({type:'calendar.save',payload:{mode:'effort',taskId,start:`2026-10-19T${start}`,end:`2026-10-19T${end}`}});
  h.service.execute({type:'item-reminder.set',payload:{id:a,at:'2026-10-19T16:00'}});
  const free=h.service.execute({type:'focus.start-unassigned'}).timer.sessionId;h.clock.advance(60000);h.service.execute({type:'focus.stop',payload:{sessionId:free}});
  await h.mount();await h.click(h.label('日历'));
  const owned=id=>[...document.querySelectorAll(`[data-item-id="${id}"]`)],color=e=>e.style.getPropertyValue('--calendar-color');
  const initial=color(owned(a)[0]);assert.ok(initial);assert.equal(document.querySelectorAll(`.calendar-event[data-item-id="${a}"]`).length,3);assert.ok(owned(a).every(e=>color(e)===initial));assert.notEqual(color(owned(b)[0]),initial);assert.notEqual(color(h.query(`[data-session-id="${free}"]`)),initial);
  await h.click(h.label('显示事项提醒'));assert.ok(owned(a).every(e=>color(e)===initial));await h.click(h.label('显示事项提醒'));
  await h.click(h.button('月'));assert.equal(color(owned(a)[0]),initial);await h.click(h.button('日'));assert.ok(owned(a).every(e=>color(e)===initial));
  await h.command({type:'session.assign',payload:{id:free,taskId:a}});assert.equal(color(h.query(`[data-session-id="${free}"]`)),initial);
  await h.command({type:'outline.patch',payload:{id:a,field:'title',value:'改名后'}});await h.click(h.label('事项'));await h.click(h.label('日历'));assert.ok(owned(a).every(e=>color(e)===initial));
  await h.click(h.query('.calendar-guide summary'));assert.match(h.query('.calendar-guide details').textContent,/同一事项使用同一颜色/);
 }finally{await h.close();}
});

test('recurring event and its reminder keep the same color in week, month and subsequent dates',async()=>{
 const h=await appDom();try{
  h.service.execute({type:'calendar.save',payload:{mode:'event',title:'每日交流',start:'2026-10-19T11:00',end:'2026-10-19T12:00'}});
  const id=h.service.snapshot().state.tasks.at(-1).id;
  h.service.execute({type:'item-reminder.set',payload:{id,at:'2026-10-19T10:45'}});
  h.service.execute({type:'recurrence.set',payload:{id,rule:{mode:'calendar',unit:'day',interval:1,anchor:'2026-10-19',weekdays:[],until:'2026-10-22'}}});
  await h.mount();await h.click(h.label('日历'));
  const colors=()=>[...document.querySelectorAll(`[data-item-id="${id}"]`)].map(e=>e.style.getPropertyValue('--calendar-color'));
  const initial=colors()[0];assert.ok(initial);assert.ok(colors().length>=4);assert.ok(colors().every(c=>c===initial));
  await h.click(h.button('月'));assert.ok(colors().every(c=>c===initial));await h.click(h.button('日'));await h.input(h.label('查看日期'),'2026-10-20');assert.ok(colors().length);assert.ok(colors().every(c=>c===initial));
 }finally{await h.close();}
});
