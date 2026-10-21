import {test} from 'node:test';
import assert from 'node:assert/strict';
import {appDom} from './app-dom.mjs';

const row=(h,id)=>h.query(`[data-outline-id="${id}"]`);
const focusNav=h=>[...h.query('[aria-label="事项视图"]').querySelectorAll('button')].find(b=>b.querySelector('span')?.textContent==='今日重点');

test('pinning via inspector immediately marks and promotes a branch; focused view retains paths and removal clears them',async()=>{
 const h=await appDom();try{
  const urgent=h.add('逾期事项',null,{dueAt:'2026-10-18'}),parent=h.add('较晚创建的项目',null),id=h.add('重点子项',parent);
  await h.mount();await h.click(h.label('事项'));await h.click(row(h,id));await h.click(h.label('加入今日重点 重点子项'));
  assert.ok(row(h,id).querySelector('.daily-focus-badge'));assert.match(row(h,id).getAttribute('aria-label'),/今日重点/);
  const roots=[...document.querySelectorAll('.outline-row[aria-level="1"]')].map(e=>e.dataset.outlineId);assert.ok(roots.indexOf(parent)<roots.indexOf(urgent));
  assert.equal(focusNav(h).querySelector('small').textContent,'1');
  await h.click(focusNav(h));assert.match(h.query('.tree-page-header h1').textContent,/今日重点/);assert.equal(focusNav(h).getAttribute('aria-pressed'),'true');
  assert.match(row(h,parent).textContent,/父级路径/);assert.equal(document.querySelector(`[data-outline-id="${urgent}"]`),null);
  await h.click(row(h,id));await h.click(h.label('移出今日重点 重点子项'));
  assert.equal(document.querySelector(`[data-outline-id="${parent}"]`),null);assert.equal(focusNav(h).querySelector('small').textContent,'0');
  await h.click(h.button('全部事项',h.query('[aria-label="事项视图"]')));assert.ok(row(h,urgent));assert.ok(row(h,parent));
 }finally{await h.close();}
});

test('context focus keeps explicit manual order, and saved focus filters survive navigation and completion',async()=>{
 const h=await appDom();try{
  const first=h.add('第一项',null),last=h.add('第二项',null);
  await h.mount();await h.click(h.label('事项'));await h.input(h.label('视图排序'),'manual');
  await h.context(row(h,last));await h.click(h.button('加入今日重点',h.query('[role="menu"]')));
  const order=[...document.querySelectorAll('[data-outline-id]')].map(e=>e.dataset.outlineId);assert.ok(order.indexOf(first)<order.indexOf(last));
  assert.ok(row(h,last).querySelector('.daily-focus-badge'));
  await h.click(focusNav(h));await h.click(h.button('保存视图'));await h.input(h.label('常用视图名称'),'每天的重点');
  await h.click(h.button('保存',h.query('[aria-label="保存当前视图"]')));const saved=h.service.snapshot().state.views[0];
  assert.deepEqual(saved.filter.rules.children.find(c=>c.field==='focusDate'),{kind:'condition',field:'focusDate',op:'period',value:'today'});
  await h.click(h.label('今日'));await h.click(h.label('事项'));assert.equal(h.label('常用视图').value,saved.id);
  await h.click(h.label('完成第二项'));assert.equal(document.querySelector(`[data-outline-id="${last}"]`),null);
 }finally{await h.close();}
});

test('selected and running focus never disappear from Today; direct start/resume and completed progress use the same item',async()=>{
 const h=await appDom();try{
  const id=h.add('今天最重要的事',null);h.service.execute({type:'item.focus',payload:{id,date:'2026-10-19'}});h.service.execute({type:'task.select',payload:{id}});
  await h.mount();const panel=()=>h.label('今日重点清单'),focus=()=>h.query(`[data-focus-id="${id}"]`,panel());
  assert.match(focus().textContent,/今天最重要的事/);assert.match(panel().textContent,/已完成 0 \/ 1/);assert.ok(h.query('.task-card.daily-focus-card'));
  await h.click(h.label('开始计时 今天最重要的事',panel()));assert.equal(h.service.snapshot().timers[0].taskId,id);assert.match(focus().textContent,/专注中/);
  assert.equal(panel().textContent.includes('先选几件'),false);await h.command({type:'focus.pause',payload:{taskId:id}});
  await h.click(h.label('恢复计时 今天最重要的事',panel()));assert.equal(h.service.snapshot().timers[0].paused,false);assert.match(focus().textContent,/正在计时/);
  await h.command({type:'focus.stop',payload:{taskId:id,complete:true}});
  assert.match(panel().textContent,/已完成 1 \/ 1/);assert.match(panel().textContent,/今天选定的重点都完成了/);assert.equal(document.querySelector(`[data-focus-id="${id}"]`),null);
 }finally{await h.close();}
});

test('paused focus remains visible with disabled timing, while clock-only midnight removes the previous day highlight',async()=>{
 const h=await appDom();try{
  const id=h.add('暂停的重点',null);h.service.execute({type:'item.focus',payload:{id,date:'2026-10-19'}});h.service.execute({type:'item.change',payload:{id,action:'pause'}});
  window.journal.clock=async()=>h.service.clockSnapshot();
  await h.mount();const panel=h.label('今日重点清单');assert.match(panel.textContent,/事项已暂停/);assert.equal(h.label('开始计时 暂停的重点',panel).disabled,true);
  await h.click(h.label('事项'));await h.click(focusNav(h));assert.ok(row(h,id));
  h.clock.advance(10*60*60*1000);await h.action(()=>new Promise(resolve=>setTimeout(resolve,1150)));
  assert.equal(document.querySelector(`[data-outline-id="${id}"]`),null);assert.equal(focusNav(h).querySelector('small').textContent,'0');
  assert.equal(h.get(id).focusDate,'2026-10-19');assert.equal(h.service.snapshot().timers.length,0);
 }finally{await h.close();}
});
