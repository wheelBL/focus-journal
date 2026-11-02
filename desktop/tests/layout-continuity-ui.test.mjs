import {test} from 'node:test';
import assert from 'node:assert/strict';
import {appDom} from './app-dom.mjs';
import {emptyFilter} from '../core/filters.ts';

const row=(id)=>document.querySelector(`[data-outline-id="${id}"]`);

test('layout switching preserves collapsed branches, selection and independent scroll positions, including virtual lists',async()=>{
 const h=await appDom();try{
  const parent=h.add('分支',null),child=h.add('子项',parent),other=h.add('选中项',null);
  for(let i=0;i<405;i++)h.add(`填充${i}`,null);
  await h.mount();await h.click(h.label('任务'));await h.click(h.label('折叠分支'));await h.click(row(other));
  const pane=h.label('事项树');await h.action(()=>{pane.scrollTop=3200;pane.dispatchEvent(new Event('scroll',{bubbles:true}));});
  const visibleIds=()=>[...pane.querySelectorAll('[data-outline-id]')].map(el=>el.dataset.outlineId);const treeViewport=visibleIds();assert.ok(treeViewport.length<100);assert.ok(!treeViewport.includes(other));
  await h.click(h.label('树形视图'));assert.equal(pane.scrollTop,3200);assert.deepEqual(visibleIds(),treeViewport);
  await h.click(h.label('平铺视图'));assert.equal(document.querySelector('[aria-label="全部展开"]'),null);assert.equal(pane.scrollTop,3200);
  await h.action(()=>{pane.scrollTop=6400;pane.dispatchEvent(new Event('scroll',{bubbles:true}));});
  const flatViewport=visibleIds();assert.ok(flatViewport.length<100);assert.notDeepEqual(flatViewport,treeViewport);
  await h.click(h.label('树形视图'));assert.equal(pane.scrollTop,3200);assert.deepEqual(visibleIds(),treeViewport);
  await h.click(h.label('平铺视图'));assert.equal(pane.scrollTop,6400);assert.deepEqual(visibleIds(),flatViewport);
  await h.click(h.label('树形视图'));assert.equal(pane.scrollTop,3200);
  const saved=JSON.parse(window.localStorage.getItem(`journal.tree.${h.service.snapshot().dataPath}`));assert.equal(saved.selected,other);assert.ok(saved.collapsed.includes(parent));assert.deepEqual(saved.layoutPositions,{tree:3200,flat:6400});await h.click(h.label('今日'));await h.click(h.label('任务'));assert.equal(h.label('事项树').scrollTop,3200);await h.click(h.label('平铺视图'));assert.equal(h.label('事项树').scrollTop,6400);
 }finally{await h.close();}
});

test('bulk expansion affects only the filtered tree and never reveals hidden completed items',async()=>{
 const h=await appDom();try{
  const parent=h.add('范围内',null),child=h.add('范围内子项',parent),done=h.add('已完成隐藏',parent),outside=h.add('范围外',null);h.add('范围外子项',outside);
  h.service.execute({type:'task.status',payload:{id:done,status:'done'}});
  const filter={...emptyFilter(),scopeId:parent};
  window.localStorage.setItem(`journal.content-scope.${h.service.snapshot().dataPath}`,JSON.stringify(parent));
  window.localStorage.setItem(`journal.tree.${h.service.snapshot().dataPath}`,JSON.stringify({selected:child,filter,activeView:'',collapsed:[parent,outside],showDetails:true,scrollTop:0,layout:'tree',completedDefaultVersion:1}));
  await h.mount();await h.click(h.label('任务'));assert.ok(!row(child));await h.click(h.label('全部展开'));assert.ok(row(child));assert.ok(!row(done));assert.ok(!row(outside));
  let saved=JSON.parse(window.localStorage.getItem(`journal.tree.${h.service.snapshot().dataPath}`));assert.ok(saved.collapsed.includes(outside));assert.ok(!saved.collapsed.includes(parent));assert.equal(saved.selected,child);
  await h.click(h.label('全部折叠'));assert.ok(!row(child));saved=JSON.parse(window.localStorage.getItem(`journal.tree.${h.service.snapshot().dataPath}`));assert.ok(saved.collapsed.includes(outside));assert.ok(saved.collapsed.includes(parent));
  await h.click(h.label('视图选项'));const panel=h.query('.filter-controls .action-popover-panel');assert.equal(panel.querySelector('[aria-label="全部展开"]'),null);assert.equal(panel.querySelector('[aria-label="全部折叠"]'),null);
 }finally{await h.close();}
});
