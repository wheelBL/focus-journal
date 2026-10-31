import {test} from 'node:test';
import assert from 'node:assert/strict';
import {appDom} from './app-dom.mjs';

test('Today and review tick live totals without reparsing historical effort; stopping moves effort once',async()=>{
 const h=await appDom();try{
  const id=h.add('实时推进'),past=h.add('历史投入');h.service.execute({type:'calendar.save',payload:{mode:'effort',taskId:past,start:'2026-10-19T09:00',end:'2026-10-19T09:30'}});
  const session=h.service.execute({type:'focus.start',payload:{taskId:id}}).timer.sessionId;h.clock.advance(60000);window.journal.clock=async()=>h.service.clockSnapshot();
  await h.mount();assert.match(h.query('.today-progress-stats').textContent,/31 分钟/);
  const historicalStart=h.service.snapshot().state.sessions.find(s=>s.taskId===past).segments[0].start,parse=Date.parse;
  const tickWithoutHistory=async()=>{let count=0;Date.parse=value=>{if(value===historicalStart)count++;return parse(value);};try{h.clock.advance(120000);await h.action(()=>new Promise(r=>setTimeout(r,1200)));}finally{Date.parse=parse;}assert.equal(count,0,'a clock-only refresh must not parse immutable historical segments');};
  await tickWithoutHistory();assert.match(h.query('.today-progress-stats').textContent,/33 分钟/);
  await h.click(h.label('回顾'));await h.click(h.button('投入复盘'));assert.match(h.query('.review-summary').textContent,/33 分钟/);
  await tickWithoutHistory();assert.match(h.query('.review-summary').textContent,/35 分钟/);
  await h.command({type:'focus.stop',payload:{sessionId:session}});assert.match(h.query('.review-summary').textContent,/35 分钟/);
  await h.click(h.label('今日'));assert.match(h.query('.today-progress-stats').textContent,/35 分钟/);
 }finally{await h.close();}
});

test('review bounds rows, retains expanded batch across ticks, resets filters and lazily mounts project content',async()=>{
 const h=await appDom();try{
  for(let i=0;i<65;i++)h.add(`回顾分页 ${i}`);window.journal.clock=async()=>h.service.clockSnapshot();await h.mount();await h.click(h.label('回顾'));await h.click(h.button('投入复盘'));await h.click(h.button('未记录投入'));
  assert.equal(document.querySelectorAll('.review-results .review-row').length,60);const count=h.query('.review-result-count').textContent,total=Number(count.match(/\/ (\d+)/)[1]);assert.ok(total>=65);assert.match(count,/统计包含全部结果/);
  assert.equal(document.querySelectorAll('.project-review-items').length,0,'collapsed projects do not mount their descendants');
  const project=h.query('.project-review-summary details[data-project-review-id]');await h.click(h.query('summary',project));assert.ok(h.query('.project-review-items',project));
  const unrecorded=h.query('.project-review-items > details',project);assert.equal(unrecorded.querySelector('button'),null);await h.click(h.query('summary',unrecorded));assert.ok(unrecorded.querySelector('button'));await h.click(h.query('summary',project));assert.equal(project.querySelector('.project-review-items'),null);
  await h.click(h.button(`显示更多（还有 ${total-60} 件）`));assert.equal(document.querySelectorAll('.review-results .review-row').length,total);h.clock.advance(60000);await h.action(()=>new Promise(r=>setTimeout(r,1200)));assert.equal(document.querySelectorAll('.review-results .review-row').length,total);
  await h.input(h.label('回顾事项名称'),'回顾分页 1');assert.equal(document.querySelectorAll('.review-results .review-row').length,11);await h.input(h.label('回顾事项名称'),'');assert.equal(document.querySelectorAll('.review-results .review-row').length,60);
 }finally{await h.close();}
});
