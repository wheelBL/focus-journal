import {test} from 'node:test';
import assert from 'node:assert/strict';
import {appDom} from './app-dom.mjs';

process.env.TZ='Asia/Shanghai';
const escape=h=>h.action(()=>h.query('dialog').dispatchEvent(new Event('cancel',{cancelable:true})));
async function free(h){await h.mount();await h.click(h.button('先计时'));await h.click(h.label('调整开始时间 未关联事项'));}

test('quick backfill retains one free session and shows total effort separately from the next reminder',async()=>{
 const h=await appDom();try{
  await free(h);const original=h.service.snapshot().timer.sessionId;
  assert.equal(h.button('保存并继续计时').disabled,true);await h.click(h.button('40 分钟前'));assert.match(h.query('.session-start-preview').textContent,/本次累计.*40 分钟/);assert.match(h.query('.session-start-reminder').textContent,/从现在起再专注 25 分钟/);
  await h.click(h.button('保存并继续计时'));assert.equal(document.querySelector('dialog'),null);assert.equal(h.service.snapshot().state.sessions.length,1);assert.equal(h.service.snapshot().timer.sessionId,original);assert.equal(h.service.snapshot().timer.durationMs,40*60000);assert.match(h.query('.unassigned-timer .big-timer').textContent,/40:00/);assert.match(h.query('.unassigned-timer .focus-status').textContent,/距离提醒 25:00/);
  h.clock.advance(5*60000);await h.click(h.button('暂停'));assert.equal(h.service.snapshot().timer.durationMs,45*60000);
  await h.click(h.label('调整开始时间 未关联事项'));await h.input(h.label('实际开始时间'),'2026-10-19T13:15:00');assert.match(h.query('.session-start-reminder').textContent,/仍保持暂停，恢复后再专注/);await h.click(h.button('保存开始时间'));assert.equal(h.service.snapshot().timer.paused,true);assert.equal(h.service.snapshot().timer.durationMs,50*60000);
 }finally{await h.close();}
});

test('cancel and Escape write nothing; future time is disabled and a changed start gets a conflict message',async()=>{
 const h=await appDom();try{
  await free(h);const before=h.service.exportJson();await h.click(h.button('40 分钟前'));await escape(h);assert.equal(h.service.exportJson(),before);
  await h.click(h.label('调整开始时间 未关联事项'));await h.input(h.label('实际开始时间'),'2026-10-19T14:01:00');assert.equal(h.button('保存并继续计时').disabled,true);await h.click(h.button('取消'));assert.equal(h.service.exportJson(),before);
  await h.click(h.label('调整开始时间 未关联事项'));await h.click(h.button('40 分钟前'));const id=h.service.snapshot().timer.sessionId;
  await h.command({type:'focus.set-start',payload:{sessionId:id,startedAt:'2026-10-19T13:30:00+08:00'}});await h.click(h.button('保存并继续计时'));assert.match(h.query('dialog [role=alert]').textContent,/别处调整/);assert.equal(h.label('实际开始时间').value,'2026-10-19T13:20');assert.equal(h.service.snapshot().timer.durationMs,30*60000);
 }finally{await h.close();}
});

test('pending writes block close and duplicate submissions; failed writes preserve the draft for retry',async()=>{
 const h=await appDom();try{
  await free(h);await h.click(h.button('40 分钟前'));const real=window.journal.command;let reject,calls=0;
  window.journal.command=c=>c.type==='focus.set-start'?(calls++,new Promise((_,r)=>{reject=r;})):real(c);
  await h.click(h.button('保存并继续计时'));await escape(h);await h.click(h.label('关闭',h.query('dialog')));await h.click(h.button('正在保存…'));assert.equal(calls,1);assert.equal(h.query('dialog').getAttribute('aria-busy'),'true');
  await h.action(()=>reject(Error('无法写入，请重试')));assert.match(h.query('dialog [role=alert]').textContent,/无法写入/);assert.equal(h.label('实际开始时间').value,'2026-10-19T13:20');assert.equal(h.service.snapshot().timer.durationMs,0);
  window.journal.command=real;await h.click(h.button('保存并继续计时'));assert.equal(h.service.snapshot().timer.durationMs,40*60000);
 }finally{await h.close();}
});

test('named timing exposes the same editor in Today, the dock and item details; concurrent timers keep their identity',async()=>{
 const h=await appDom();try{
  const taskId=h.add('已经做了40分钟'),other=h.add('并行的事');await h.mount();await h.command({type:'focus.start',payload:{taskId}});await h.command({type:'focus.start',payload:{taskId:other}});
  const before=h.service.snapshot().timers.find(t=>t.taskId===other);await h.click(h.label('调整开始时间 已经做了40分钟',h.query('.today-page')));await h.click(h.button('40 分钟前'));await h.click(h.button('保存并继续计时'));
  assert.deepEqual(h.service.snapshot().timers.find(t=>t.taskId===other),before);assert.equal(h.service.snapshot().timers.find(t=>t.taskId===taskId).durationMs,40*60000);
  await h.click(h.label('事项'));assert.ok(h.label('调整开始时间 已经做了40分钟',h.query('.timer-dock')));
  await h.click(h.query(`[data-outline-id="${taskId}"]`));assert.ok(h.label('调整开始时间 已经做了40分钟',h.query('.task-inspector')));
  await h.click(h.label('调整开始时间 已经做了40分钟',h.query('.task-inspector')));assert.match(h.query('dialog').textContent,/已经做了40分钟/);await h.click(h.button('取消'));
 }finally{await h.close();}
});

test('overlap errors retain the input, while an externally ended timer can safely leave the editor',async()=>{
 const h=await appDom();try{
  const taskId=h.add('已有记录');h.service.execute({type:'session.manual',payload:{taskId,date:'2026-10-19',start:'2026-10-19T13:00:00+08:00',end:'2026-10-19T13:40:00+08:00',minutes:40}});
  await h.mount();await h.command({type:'focus.start',payload:{taskId}});await h.click(h.label('调整开始时间 已有记录'));await h.click(h.button('40 分钟前'));await h.click(h.button('保存并继续计时'));assert.match(h.query('dialog [role=alert]').textContent,/重叠/);assert.equal(h.service.snapshot().timer.durationMs,0);
  await h.command({type:'focus.stop',payload:{sessionId:h.service.snapshot().timer.sessionId}});assert.match(h.query('dialog').textContent,/已结束或更新/);await h.click(h.button('返回'));assert.equal(document.querySelector('dialog'),null);
 }finally{await h.close();}
});
