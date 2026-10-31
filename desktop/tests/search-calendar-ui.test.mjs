import {test} from 'node:test';
import assert from 'node:assert/strict';
import {appDom} from './app-dom.mjs';

test('global search provides bounded results, explicit hidden content and resets the result batch on a new query',async()=>{
 const h=await appDom();try{
  for(let i=0;i<65;i++)h.add(`搜索样例 ${i}`);const gone=h.add('搜索样例 已删除');h.service.execute({type:'item.change',payload:{id:gone,action:'delete'}});
  await h.mount();await h.input(h.label('搜索任务和笔记'),'搜索样例');assert.equal(document.querySelectorAll('.search-page .project-task').length,60);assert.match(h.query('.search-page [role="status"]').textContent,/60 \/ 65/);
  await h.click(h.button('显示更多（还有 5 条）'));assert.equal(document.querySelectorAll('.search-page .project-task').length,65);
  await h.click(h.query('.search-page input[type=checkbox]'));assert.equal(document.querySelectorAll('.search-page .project-task').length,60);await h.click(h.button('显示更多（还有 6 条）'));assert.equal(document.querySelectorAll('.search-page .project-task').length,66);assert.ok([...document.querySelectorAll('.search-page .task-link')].some(e=>e.textContent==='搜索样例 已删除'));
  await h.input(h.label('搜索任务和笔记'),'搜索样例 1');assert.equal(document.querySelectorAll('.search-page .project-task').length,11);
 }finally{await h.close();}
});

test('calendar overlays live timing without losing completed effort, then moves the stopped record into history exactly once',async()=>{
 const h=await appDom();try{
  const id=h.add('正在推进'),past=h.add('已记录工作');h.service.execute({type:'calendar.save',payload:{mode:'effort',taskId:past,start:'2026-10-19T09:00',end:'2026-10-19T09:30'}});
  const session=h.service.execute({type:'focus.start',payload:{taskId:id}}).timer.sessionId;h.clock.advance(60000);window.journal.clock=async()=>h.service.clockSnapshot();
  await h.mount();await h.click(h.label('日历'));const row=()=>h.query(`.calendar-event[data-session-id="${session}"]`),before=parseFloat(row().style.height);assert.match(h.query('.calendar-head').textContent,/31 分钟/);
  const historicalStart=h.service.snapshot().state.sessions.find(s=>s.taskId===past).segments[0].start,parse=Date.parse;let historyParses=0;
  Date.parse=value=>{if(value===historicalStart)historyParses++;return parse(value);};
  try{h.clock.advance(120000);await h.action(()=>new Promise(r=>setTimeout(r,1200)));}finally{Date.parse=parse;}
  assert.equal(historyParses,0,'clock-only updates must not reparse ended history');assert.ok(parseFloat(row().style.height)>before);assert.match(h.query('.calendar-head').textContent,/33 分钟/);
  await h.command({type:'focus.stop',payload:{sessionId:session}});assert.equal(document.querySelectorAll(`.calendar-event[data-session-id="${session}"]`).length,1);assert.match(h.query('.calendar-head').textContent,/33 分钟/);
  await h.click(h.button('月'));const cell=h.query('[aria-label="2026-10-19，双击添加提醒"]');assert.match(cell.textContent,/33 分钟/);await h.click(h.label('显示实际投入'));assert.equal(cell.querySelector('strong'),null);
 }finally{await h.close();}
});
