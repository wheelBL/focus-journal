import {test} from 'node:test';
import assert from 'node:assert/strict';
import {appDom} from './app-dom.mjs';

const key='journal.today-capture.full app scenario tests';
const previewTitle=h=>h.query('.capture-editor .field input');

test('Today retains corrected preview fields through search and navigation and clears the complete draft only after saving',async()=>{
 const h=await appDom();try{
  h.add('用来搜索');await h.mount();await h.input(h.label('快速添加事项名称'),'原名称 明天开始');await h.click(h.button('修改预览'));
  await h.input(previewTitle(h),'修正后的名称');await h.input(h.label('记录正文'),'必须保留的正文');
  const stored=JSON.parse(window.localStorage.getItem(key));assert.equal(stored.version,1);assert.equal(stored.overrides.title,'修正后的名称');assert.equal(stored.overrides.description,'必须保留的正文');
  await h.input(h.label('搜索任务和笔记'),'用来搜索');await h.key(h.label('搜索任务和笔记'),'Escape');assert.ok(h.query('.capture-editor'));assert.equal(previewTitle(h).value,'修正后的名称');assert.equal(h.label('记录正文').value,'必须保留的正文');
  await h.click(h.label('事项'));await h.click(h.label('今日'));await h.click(h.button('修改预览'));assert.equal(previewTitle(h).value,'修正后的名称');assert.equal(h.label('记录正文').value,'必须保留的正文');
  await h.key(h.label('快速添加事项名称'),'Enter');const task=h.service.snapshot().state.tasks.at(-1);assert.equal(task.title,'修正后的名称');assert.equal(task.description,'必须保留的正文');assert.equal(task.plannedDate,'2026-10-20');assert.equal(window.localStorage.getItem(key),null);
 }finally{await h.close();}
});

test('restoring after midnight keeps the original relative-date interpretation and explicit literal choices',async()=>{
 const h=await appDom();try{
  await h.mount();await h.input(h.label('快速添加事项名称'),'调查 明天开始 周五截止');await h.click(h.button('修改预览'));await h.click(h.button('周五截止'));
  const saved=JSON.parse(window.localStorage.getItem(key));assert.equal(saved.literals.length,1);
  await h.click(h.label('事项'));h.clock.advance(86400000);await h.command({type:'settings.save',payload:{targetMinutes:25,breakMinutes:5}});await h.click(h.label('今日'));await h.click(h.button('今天'));
  assert.equal(JSON.parse(window.localStorage.getItem(key)).anchor,saved.anchor);assert.match(h.query('.capture-preview').textContent,/开始 · 2026-10-20/);
  await h.key(h.label('快速添加事项名称'),'Enter');const task=h.service.snapshot().state.tasks.at(-1);assert.equal(task.title,'调查 周五截止');assert.equal(task.plannedDate,'2026-10-20');assert.equal(task.dueAt,null);
 }finally{await h.close();}
});

test('legacy raw drafts migrate and unavailable UI storage does not block saving an actual item',async()=>{
 const h=await appDom();const proto=Object.getPrototypeOf(window.localStorage),original=Object.getOwnPropertyDescriptor(proto,'setItem');try{
  window.localStorage.setItem(key,'旧版草稿');await h.mount();assert.equal(h.label('快速添加事项名称').value,'旧版草稿');assert.equal(JSON.parse(window.localStorage.getItem(key)).raw,'旧版草稿');await h.key(h.label('快速添加事项名称'),'Enter');assert.equal(window.localStorage.getItem(key),null);
  Object.defineProperty(proto,'setItem',{...original,value(){throw Error('storage full');}});
  await h.input(h.label('快速添加事项名称'),'存储失败仍能记录');await h.click(h.button('修改预览'));await h.input(h.label('记录正文'),'正文也应保存');await h.key(h.label('快速添加事项名称'),'Enter');const task=h.service.snapshot().state.tasks.at(-1);assert.equal(task.title,'存储失败仍能记录');assert.equal(task.description,'正文也应保存');assert.equal(h.label('快速添加事项名称').value,'');
 }finally{Object.defineProperty(proto,'setItem',original);await h.close();}
});

test('failed journal saves retain preview corrections for retry after leaving and returning',async()=>{
 const h=await appDom();try{
  const command=window.journal.command;let fail=true;window.journal.command=async c=>{if(c.type==='capture.create'&&fail)throw Error('模拟写入失败');return command(c);};
  await h.mount();await h.input(h.label('快速添加事项名称'),'待保存');await h.click(h.button('修改预览'));await h.input(previewTitle(h),'保留修正');await h.input(h.label('记录正文'),'失败后仍保留');await h.key(h.label('快速添加事项名称'),'Enter');assert.match(h.query('.semantic-capture [role=alert]').textContent,/模拟写入失败/);assert.equal(h.service.snapshot().state.tasks.length,1);
  await h.click(h.label('事项'));await h.click(h.label('今日'));await h.click(h.button('修改预览'));assert.equal(previewTitle(h).value,'保留修正');assert.equal(h.label('记录正文').value,'失败后仍保留');fail=false;await h.key(h.label('快速添加事项名称'),'Enter');assert.equal(h.service.snapshot().state.tasks.at(-1).description,'失败后仍保留');assert.equal(window.localStorage.getItem(key),null);
 }finally{await h.close();}
});
