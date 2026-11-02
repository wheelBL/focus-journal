import {test} from 'node:test';
import assert from 'node:assert/strict';
import {appDom} from './app-dom.mjs';

test('sidebar quit and configured quit request the same desktop exit without submitting forms',async()=>{
 const h=await appDom();try{
  const calls=[];window.journal.windowAction=async action=>{calls.push(action);};
  await h.mount();const before=h.service.snapshot().revision;
  assert.ok(h.label('退出专注记').closest('.sidebar-app-actions')?.querySelector('[aria-label="设置"]'));
  assert.match(h.label('退出专注记').title,/尚未提交的表单不会自动提交/);
  await h.click(h.label('退出专注记'));await h.key(document.body,'q',{ctrlKey:true,shiftKey:true});
  assert.deepEqual(calls,['quit','quit']);assert.equal(h.service.snapshot().revision,before);
  await h.click(h.label('设置'));assert.equal(document.querySelector('button[aria-label="保存并退出专注记"]'),null);
 }finally{await h.close();}
});

test('exit waits for its request, shows a failure and permits retry',async()=>{
 const h=await appDom();let fail;try{
  let requests=0;window.journal.windowAction=()=>{requests++;return new Promise((resolve,reject)=>{fail=reject;});};
  await h.mount();await h.click(h.label('退出专注记'));assert.equal(h.label('退出专注记').disabled,true);
  await h.key(document.body,'q',{ctrlKey:true,shiftKey:true});assert.equal(requests,1);
  await h.action(()=>fail(new Error('退出保存失败，请重试')));assert.equal(h.label('退出专注记').disabled,false);assert.match(document.querySelector('.toast').textContent,/退出保存失败/);
  window.journal.windowAction=async()=>{requests++;};await h.click(h.label('退出专注记'));assert.equal(requests,2);
 }finally{await h.close();}
});
