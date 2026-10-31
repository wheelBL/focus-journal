import {test} from 'node:test';
import assert from 'node:assert/strict';
import {appDom} from './app-dom.mjs';

test('global quick timer works from Items; pause and finish create an item without replacing time evidence',async()=>{
 const h=await appDom();try{
  await h.mount();await h.click(h.label('事项'));const count=h.service.snapshot().state.tasks.length;
  await h.click(h.button('先计时'));assert.ok(document.querySelector('.today-page'));assert.equal(h.service.snapshot().state.tasks.length,count);
  const id=h.service.snapshot().timer.sessionId;h.clock.advance(60000);await h.click(h.button('暂停',h.query('.unassigned-timer')));
  h.clock.advance(120000);await h.click(h.button('恢复专注',h.query('.unassigned-timer')));h.clock.advance(60000);
  await h.click(h.button('结束并补充事项'));const original=h.service.snapshot().state.sessions[0];
  const modal=h.label('补充这段时间的事项');assert.match(modal.textContent,/2 分钟 · 时间已保存/);assert.match(modal.textContent,/已扣除暂停/);assert.equal(h.button('保存并关联').disabled,true);
  await h.input(h.label('这段时间做了什么'),'临时解决导入问题');await h.input(h.query('textarea',modal),'已经恢复导入');
  await h.click(h.button('保存并关联'));const state=h.service.snapshot().state,record=state.sessions.find(r=>r.id===id),task=state.tasks.at(-1);
  assert.equal(task.title,'临时解决导入问题');assert.equal(record.taskId,task.id);assert.equal(record.summary,'已经恢复导入');assert.deepEqual(record.segments,original.segments);assert.equal(record.durationMs,120000);assert.equal(record.manual,false);
  assert.match(h.query('.session-entry').textContent,/临时解决导入问题/);assert.equal(document.querySelector('.unassigned-queue'),null);
 }finally{await h.close();}
});

test('defer, calendar inspection and period review retain unassigned effort; associate a searched existing item',async()=>{
 const h=await appDom();try{
  const taskId=h.add('处理客户反馈');await h.mount();await h.click(h.button('先计时'));h.clock.advance(600000);await h.click(h.button('结束并补充事项'));await h.click(h.button('稍后补充'));
  assert.match(h.query('.unassigned-queue').textContent,/1 条/);assert.match(h.query('.today-progress-stats').textContent,/10 分钟/);
  await h.click(h.label('日历'));const block=h.query('[data-session-id]');assert.match(block.textContent,/未关联事项/);await h.click(block);assert.ok(h.button('补充事项'));await h.click(h.button('补充事项'));
  await h.click(h.button('关联已有事项'));await h.input(h.label('查找已有事项'),'客户反馈');await h.click(h.query('.assignment-candidates button'));
  await h.click(h.button('保存并关联'));assert.equal(h.service.snapshot().state.sessions[0].taskId,taskId);assert.match(h.query('[data-session-id]').textContent,/处理客户反馈/);
  await h.click(h.label('回顾'));await h.click(h.query('[data-review-tab=effort]'));assert.match(h.query('.review-summary').textContent,/10 分钟/);
  await h.click(h.button('先计时'));h.clock.advance(300000);await h.click(h.button('结束并补充事项'));await h.click(h.button('稍后补充'));
  await h.click(h.label('回顾'));assert.match(h.query('.review-summary').textContent,/15 分钟/);assert.match(h.query('.unassigned-queue').textContent,/5 分钟/);
  await h.click(h.label('今日'));await h.input(h.label('查看日期'),'2026-10-18');assert.ok(h.query('.unassigned-queue'));
 }finally{await h.close();}
});

test('assignment errors retain the draft and original session; dock ends the chosen unassigned timer',async()=>{
 const h=await appDom();try{
  h.add('已有事项');await h.mount();await h.click(h.button('先计时'));h.clock.advance(60000);await h.click(h.label('事项'));
  const id=h.service.snapshot().timer.sessionId;await h.click(h.label('结束未关联事项计时'));const real=window.journal.command;window.journal.command=async c=>{if(c.type==='session.assign')throw Error('模拟磁盘写入失败');return real(c);};
  await h.input(h.label('这段时间做了什么'),'应保留的输入');await h.click(h.button('保存并关联'));
  assert.match(h.query('dialog [role=alert]').textContent,/写入失败/);assert.equal(h.label('这段时间做了什么').value,'应保留的输入');assert.equal(h.service.snapshot().state.sessions.find(s=>s.id===id).taskId,null);
  window.journal.command=real;await h.click(h.button('保存并关联'));assert.equal(h.service.snapshot().state.sessions.find(s=>s.id===id).durationMs,60000);assert.equal(document.querySelector('dialog'),null);
 }finally{await h.close();}
});

test('multiple free timers and saved prior-day records remain separately accessible',async()=>{
 const h=await appDom();try{
  await h.mount();await h.click(h.button('先计时'));h.clock.advance(60000);await h.click(h.button('先计时'));
  assert.equal(document.querySelectorAll('.unassigned-timer').length,2);assert.match(h.query('.toast').textContent,/每次只做一件事情/);
  const [a,b]=h.service.snapshot().timers;await h.click(h.button('结束并补充事项',document.querySelectorAll('.unassigned-timer')[0]));await h.click(h.button('稍后补充'));
  assert.deepEqual(h.service.snapshot().timers.map(t=>t.sessionId),[b.sessionId]);
  await h.command({type:'focus.pause',payload:{sessionId:b.sessionId}});h.clock.advance(86400000);await h.command({type:'session.summary',payload:{id:a.sessionId,summary:'昨天的记录'}});
  await h.click(h.query('.unassigned-queue summary'));await h.click(h.button('补充事项',h.query('.unassigned-queue')));assert.match(h.label('补充这段时间的事项').textContent,/2026-10-19/);assert.equal(h.query('dialog textarea').value,'昨天的记录');
 }finally{await h.close();}
});
