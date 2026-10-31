import {test} from 'node:test';
import assert from 'node:assert/strict';
import {appDom} from './app-dom.mjs';
import {emptyFilter} from '../core/filters.ts';

function visibility(h){let hidden=false;Object.defineProperty(document,'hidden',{configurable:true,get:()=>hidden});return value=>h.action(()=>{hidden=value;document.dispatchEvent(new Event('visibilitychange'));});}
const wait=h=>h.action(()=>new Promise(r=>setTimeout(r,1100)));
const readout=()=>document.querySelector('.big-timer, .dock-timer-row > strong')?.textContent;

test('durable timer checkpoints update the clock without reloading history or losing the current page',async()=>{
 const h=await appDom();try{
  const id=h.add('连续专注');h.service.execute({type:'focus.start',payload:{taskId:id}});let loads=0;
  window.journal.clock=async()=>h.service.clockSnapshot();window.journal.snapshot=async()=>{loads++;return h.service.snapshot();};
  await h.mount();const initial=loads;h.clock.advance(10000);h.service.tick();await wait(h);assert.equal(loads,initial);assert.equal(readout(),'00:10');
  h.clock.advance(10000);h.service.tick();await wait(h);assert.equal(loads,initial);assert.equal(readout(),'00:20');
  h.service.execute({type:'outline.patch',payload:{id,field:'title',value:'内容变化仍会刷新'}});await wait(h);assert.equal(loads,initial+1);assert.match(document.body.textContent,/内容变化仍会刷新/);
 }finally{await h.close();}
});

test('hidden main UI stops clock requests and immediately catches up when shown, without stopping real timing',async()=>{
 const h=await appDom();try{
  const id=h.add('后台继续工作');h.service.execute({type:'focus.start',payload:{taskId:id}});let reads=0,loads=0;
  window.journal.clock=async()=>{reads++;return h.service.clockSnapshot();};window.journal.snapshot=async()=>{loads++;return h.service.snapshot();};const hidden=visibility(h);
  await h.mount();await hidden(true);const beforeReads=reads,beforeLoads=loads;h.clock.advance(600000);await wait(h);assert.equal(reads,beforeReads);assert.equal(loads,beforeLoads);assert.equal(h.service.clockSnapshot().timers[0].durationMs,600000);
  await hidden(false);assert.equal(reads,beforeReads+1);assert.equal(loads,beforeLoads+1);assert.equal(readout(),'10:00');
 }finally{await h.close();}
});

test('showing the main UI during an in-flight clock read queues a fresh snapshot and discards the stale response',async()=>{
 const h=await appDom();let release;try{
  const id=h.add('不会倒退');h.service.execute({type:'focus.start',payload:{taskId:id}});let reads=0,loads=0;const stale=h.service.clockSnapshot();
  window.journal.clock=async()=>{reads++;return reads===1?new Promise(resolve=>{release=()=>resolve(stale);}):h.service.clockSnapshot();};window.journal.snapshot=async()=>{loads++;return h.service.snapshot();};const hidden=visibility(h);
  await h.mount();await wait(h);assert.equal(reads,1);await hidden(true);h.clock.advance(900000);await hidden(false);assert.equal(reads,1,'foreground refresh waits for the existing request');
  const beforeLoads=loads;await h.action(()=>release());assert.equal(reads,2);assert.equal(loads,beforeLoads+1);assert.equal(readout(),'15:00');h.clock.advance(60000);await wait(h);assert.equal(readout(),'16:00');
 }finally{release?.();await h.close();}
});

test('a failed foreground clock request falls back immediately and later polling recovers without clearing timers',async()=>{
 const h=await appDom();try{
  const id=h.add('请求失败仍保留计时');h.service.execute({type:'focus.start',payload:{taskId:id}});let fail=true,loads=0;
  window.journal.clock=async()=>{if(fail)throw Error('clock unavailable');return h.service.clockSnapshot();};window.journal.snapshot=async()=>{loads++;return h.service.snapshot();};const hidden=visibility(h);
  await h.mount();await hidden(true);h.clock.advance(300000);const before=loads;await hidden(false);assert.equal(loads,before+1);assert.equal(readout(),'05:00');
  fail=false;h.clock.advance(60000);await wait(h);assert.equal(readout(),'06:00');
 }finally{await h.close();}
});

test('returning after midnight updates relative saved views and picks up journal edits made while hidden',async()=>{
 const h=await appDom();try{
  const first=h.add('昨日计划','inbox',{plannedDate:'2026-10-19'}),next=h.add('今日计划','inbox',{plannedDate:'2026-10-20'});
  const view=h.service.execute({type:'view.save',payload:{name:'当天计划',filter:{...emptyFilter(),planned:'today'}}}).state.views[0];window.journal.clock=async()=>h.service.clockSnapshot();const hidden=visibility(h);
  await h.mount();await h.click(h.label('事项'));await h.input(h.label('常用视图'),view.id);assert.ok(document.querySelector(`[data-outline-id="${first}"]`));
  await hidden(true);h.clock.advance(86400000);h.service.execute({type:'outline.patch',payload:{id:next,field:'title',value:'后台已更新的今日计划'}});await hidden(false);
  assert.equal(document.querySelector(`[data-outline-id="${first}"]`),null);assert.match(h.query(`[data-outline-id="${next}"]`).textContent,/后台已更新的今日计划/);
 }finally{await h.close();}
});
