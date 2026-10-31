import {test} from 'node:test';
import assert from 'node:assert/strict';
import {appDom} from './app-dom.mjs';
import {emptyFilter} from '../core/filters.ts';
import {condition,group,withRules} from '../core/filter-rules.ts';

const row=(h,id)=>h.query(`[data-outline-id="${id}"]`);
const effort=(h,id)=>h.query('.tree-effort',row(h,id)).textContent;
async function tick(h,ms=60000){h.clock.advance(ms);h.service.tick();await h.action(()=>new Promise(r=>setTimeout(r,1100)));}
function clockOnly(h){let loads=0;window.journal.clock=async()=>h.service.clockSnapshot();window.journal.snapshot=async()=>{loads++;return h.service.snapshot();};return ()=>loads;}

test('outline, inspector and search effort keep growing across checkpoints without reloading history',async()=>{
 const h=await appDom();try{
  const parent=h.add('实时汇总项目',null,{isProject:true}),child=h.add('实时汇总子项',parent);
  h.service.execute({type:'session.manual',payload:{taskId:parent,date:'2026-10-18',minutes:2}});h.service.execute({type:'session.manual',payload:{taskId:child,date:'2026-10-18',minutes:5}});
  h.service.execute({type:'focus.start',payload:{taskId:child}});h.clock.advance(60000);const loads=clockOnly(h);
  await h.mount();await h.click(h.label('事项'));const initial=loads();assert.match(effort(h,child),/^6 分钟/);assert.match(effort(h,parent),/^8 分钟/);
  await h.click(row(h,parent));await h.click(h.query('[data-inspector-tab="records"]'));assert.match(h.query('.effort-metrics').textContent,/本项累计2 分钟含子项合计8 分钟/);
  await tick(h);assert.equal(loads(),initial);assert.match(effort(h,child),/^7 分钟/);assert.match(effort(h,parent),/^9 分钟/);assert.match(h.query('.effort-metrics').textContent,/本项累计2 分钟含子项合计9 分钟/);
  await h.input(h.label('搜索任务和笔记'),'实时汇总子项');assert.match(h.query(`[data-search-item="${child}"] > span`).textContent,/7 分钟/);
  await tick(h);assert.equal(loads(),initial);assert.equal(h.query(`[data-search-item="${child}"] > span`).textContent,'8 分钟');
 }finally{await h.close();}
});

test('actual effort filters become eligible as time grows, without inheriting child effort or a full snapshot',async()=>{
 const h=await appDom();try{
  const parent=h.add('父项无自身投入',null),child=h.add('投入跨过筛选阈值',parent);h.service.execute({type:'focus.start',payload:{taskId:child}});
  const filter=withRules(emptyFilter(),group([condition('actualMinutes','greater',1)]));const view=h.service.execute({type:'view.save',payload:{name:'本项投入超过一分钟',filter}}).state.views[0];
  const loads=clockOnly(h);await h.mount();await h.click(h.label('事项'));await h.input(h.label('常用视图'),view.id);const initial=loads();assert.equal(document.querySelector(`[data-outline-id="${child}"]`),null);
  await tick(h,70000);assert.equal(loads(),initial);assert.ok(row(h,child));assert.equal(row(h,child).classList.contains('context-row'),false);assert.equal(row(h,parent).classList.contains('context-row'),true);assert.match(h.query('.tree-page-header h1').textContent,/1 个事项/);assert.equal(h.label('常用视图').value,view.id);
 }finally{await h.close();}
});

test('aggregate ticks preserve active inline drafts, focus, selection and chosen order',async()=>{
 const h=await appDom();try{
  const first=h.add('第一项'),second=h.add('第二项');h.service.execute({type:'focus.start',payload:{taskId:second}});const loads=clockOnly(h);
  await h.mount();await h.click(h.label('事项'));await h.input(h.label('视图排序'),'manual');await h.key(row(h,first),'F2');const input=h.label('名称 第一项');await h.input(input,'仍在编辑的名称');await h.action(()=>input.setSelectionRange(2,5));
  const order=[...document.querySelectorAll('[data-outline-id]')].map(el=>el.dataset.outlineId),initial=loads();await tick(h,20000);
  assert.equal(loads(),initial);assert.equal(h.label('名称 第一项'),input);assert.equal(input.value,'仍在编辑的名称');assert.equal(document.activeElement,input);assert.equal(input.selectionStart,2);assert.equal(input.selectionEnd,5);assert.equal(h.label('视图排序').value,'manual');assert.deepEqual([...document.querySelectorAll('[data-outline-id]')].map(el=>el.dataset.outlineId),order);assert.equal(effort(h,second),'20 秒');
  await h.key(input,'Escape');assert.equal(h.get(first).title,'第一项');
 }finally{await h.close();}
});
