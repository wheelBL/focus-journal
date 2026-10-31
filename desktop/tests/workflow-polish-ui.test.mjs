import {test} from 'node:test';
import assert from 'node:assert/strict';
import {appDom} from './app-dom.mjs';

test('global search supports creation, Escape and IME without losing Today capture',async()=>{
 const h=await appDom();try{
  h.add('准备材料');await h.mount();
  await h.input(h.label('快速添加事项名称'),'尚未保存的想法');
  await h.key(document.body,'k',{ctrlKey:true});assert.equal(document.activeElement,h.label('搜索任务和笔记'));
  await h.input(h.label('搜索任务和笔记'),'准备');await h.key(h.label('搜索任务和笔记'),'Escape');
  assert.equal(h.label('快速添加事项名称').value,'尚未保存的想法');
  await h.click(h.label('事项'));await h.input(h.label('搜索任务和笔记'),'准备');
  await h.key(h.label('搜索任务和笔记'),'n',{ctrlKey:true,isComposing:true});assert.equal(document.querySelector('dialog'),null);
  await h.key(h.label('搜索任务和笔记'),'n',{ctrlKey:true});assert.ok(h.query('dialog[aria-label="新建一件事"]'));
  await h.input(h.query('dialog input'),'从搜索中新建');await h.click(h.button('保存事项',h.query('dialog')));
  assert.ok(h.service.snapshot().state.tasks.some(t=>t.title==='从搜索中新建'));
  await h.key(h.label('搜索任务和笔记'),'Escape');assert.ok(h.query('.outline-scroll'));
  await h.click(h.label('今日'));assert.equal(h.label('快速添加事项名称').value,'尚未保存的想法');
 }finally{await h.close();}
});
