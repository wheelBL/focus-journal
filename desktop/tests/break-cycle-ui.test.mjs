import {test} from 'node:test';
import assert from 'node:assert/strict';
import {appDom} from './app-dom.mjs';

test('end-and-rest is visible for named and unnamed focus; countdown stays on every page and welcome waits for consent',async()=>{
 const h=await appDom();try{
  const taskId=h.add('阅读技术资料');await h.mount();await h.command({type:'focus.start',payload:{taskId}});
  h.clock.advance(25*60000);await h.click(h.button('结束并休息 5 分钟',h.query('.task-card')));
  assert.equal(h.service.snapshot().timers.length,0);assert.equal(document.querySelector('dialog'),null);
  assert.equal(h.label('休息剩余时间').textContent,'05:00');
  for(const page of ['事项','日历','回顾','设置','今日']){await h.click(h.label(page));assert.ok(h.label('休息与下一次专注'));assert.equal(h.label('休息剩余时间').textContent,'05:00');}
  h.clock.advance(60000);await h.command({type:'break.acknowledge'});assert.equal(h.label('休息剩余时间').textContent,'04:00');
  h.clock.advance(240000);await h.action(()=>h.service.tick());await h.command({type:'break.acknowledge'});
  assert.match(h.label('休息与下一次专注').textContent,/欢迎回来/);assert.match(h.label('休息与下一次专注').textContent,/阅读技术资料/);assert.equal(h.service.snapshot().timers.length,0);
  await h.click(h.button('开始下一次 25 分钟'));assert.equal(h.service.snapshot().timer.taskId,taskId);assert.equal(document.querySelector('.break-bar'),null);assert.equal(h.service.snapshot().state.sessions[0].durationMs,25*60000);
  await h.command({type:'focus.stop',payload:{sessionId:h.service.snapshot().timer.sessionId}});await h.click(h.button('暂不休息'));
  await h.click(h.button('先计时'));h.clock.advance(60000);await h.click(h.button('结束并休息 5 分钟',h.query('.unassigned-timer')));
  assert.equal(h.label('休息剩余时间').textContent,'05:00');assert.equal(h.service.snapshot().state.sessions.at(-1).taskId,null);assert.ok(h.query('.unassigned-queue'));assert.equal(document.querySelector('dialog'),null);
 }finally{await h.close();}
});
test('ordinary stop offers rest after closing the summary; assigning a free session can start rest in one save',async()=>{
 const h=await appDom();try{
  await h.mount();await h.click(h.button('先计时'));h.clock.advance(60000);await h.click(h.button('结束并补充事项'));
  await h.input(h.label('这段时间做了什么'),'写下设计结论');await h.click(h.query('.assignment-rest-choice input'));await h.click(h.button('保存并休息'));
  assert.equal(h.label('休息剩余时间').textContent,'05:00');assert.equal(h.service.snapshot().state.sessions.at(-1).taskId,h.service.snapshot().state.tasks.at(-1).id);
  await h.click(h.button('提前结束休息'));assert.match(h.label('休息与下一次专注').textContent,/欢迎回来/);await h.click(h.button('选择其他事项'));assert.ok(h.query('.tree-page'));assert.equal(h.service.snapshot().timers.length,0);assert.equal(document.querySelector('.break-bar'),null);
  const id=h.service.snapshot().state.tasks.at(-1).id;await h.command({type:'focus.start',payload:{taskId:id}});await h.click(h.label('今日'));h.clock.advance(60000);await h.click(h.button('结束本次',h.query('.task-card')));await h.click(h.button('稍后填写'));
  assert.match(h.label('休息与下一次专注').textContent,/这一段已保存/);await h.click(h.button('休息 5 分钟',h.query('.break-bar')));assert.equal(h.label('休息剩余时间').textContent,'05:00');
 }finally{await h.close();}
});
test('rest actions explain other running timers and do not stop them implicitly',async()=>{
 const h=await appDom();try{
  await h.mount();await h.click(h.button('先计时'));await h.click(h.button('先计时'));
  const buttons=[...document.querySelectorAll('.stop-for-break')];assert.equal(buttons.length,2);assert.ok(buttons.every(b=>b.disabled&&b.title.includes('其他计时器')));
  await h.click(h.button('暂停',document.querySelectorAll('.unassigned-timer')[0]));assert.equal(document.querySelectorAll('.stop-for-break')[1].disabled,false);
  await h.click(document.querySelectorAll('.stop-for-break')[1]);assert.equal(h.service.snapshot().timers.length,1);assert.equal(h.service.snapshot().timer.paused,true);assert.equal(h.label('休息剩余时间').textContent,'05:00');
 }finally{await h.close();}
});


test('a newer snapshot is not overwritten by a cached clock tick at the same revision',async()=>{
 const h=await appDom();let refresh=()=>{},clockReads=0;const subscribe=window.journal.onChanged;
 window.journal.onChanged=cb=>{refresh=cb;return subscribe(cb);};window.journal.clock=async()=>{clockReads++;return h.service.clockSnapshot();};
 try{h.service.execute({type:'break.start'});await h.mount();await h.action(()=>new Promise(r=>setTimeout(r,1100)));assert.ok(clockReads>0);assert.equal(h.label('休息剩余时间').textContent,'05:00');
  h.clock.advance(60000);await h.action(()=>refresh());assert.equal(h.label('休息剩余时间').textContent,'04:00');
 }finally{await h.close();}
});
