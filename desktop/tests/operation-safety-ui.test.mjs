import {test} from 'node:test';
import assert from 'node:assert/strict';
import {appDom} from './app-dom.mjs';

function hold(type){
 const real=window.journal.command;let resolve,reject,calls=0;
 window.journal.command=command=>command.type===type?(calls++,new Promise((yes,no)=>{resolve=()=>yes(real(command));reject=no;})):real(command);
 return {get calls(){return calls;},finish:()=>resolve(),fail:()=>reject(Error('保存失败，请重试')),restore:()=>{window.journal.command=real;}};
}

test('branch completion protects child decisions until a single write finishes and keeps failures retryable',async()=>{
 const h=await appDom();try{
  const parent=h.add('交付工作'),child=h.add('校对附件',parent);await h.mount();await h.click(h.label('事项'));
  await h.click(h.label('完成交付工作',h.query('[role=tree]')));const d=h.query('dialog'),choice=h.label('处理未结束子项');
  assert.equal(h.button('确认完成事项',d).disabled,true);assert.match(d.textContent,/先选择子项的处理方式/);
  await h.input(choice,'done');const gate=hold('task.status');await h.click(h.button('确认完成事项',d));
  assert.equal(d.getAttribute('aria-busy'),'true');assert.equal(choice.disabled,true);assert.equal(h.button('返回',d).disabled,true);assert.equal(h.label('关闭',d).disabled,true);
  await h.action(()=>d.dispatchEvent(new Event('cancel',{cancelable:true})));await h.input(choice,'cancelled');await h.click(h.button('正在保存…',d));
  assert.equal(choice.value,'done');assert.equal(gate.calls,1);assert.equal(h.query('dialog'),d);
  await h.action(gate.fail);assert.equal(choice.disabled,false);assert.equal(choice.value,'done');assert.match(h.query('dialog [role=alert]').textContent,/保存失败/);assert.equal(h.get(parent).status,'open');
  gate.restore();await h.click(h.button('确认完成事项',d));assert.equal(h.get(parent).status,'done');assert.equal(h.get(child).status,'done');assert.equal(document.querySelector('dialog'),null);
  await h.click(h.button('撤销状态调整',h.query('.outline-tools')));assert.equal(h.get(parent).status,'open');assert.equal(h.get(child).status,'open');
 }finally{await h.close();}
});

test('trash confirmation cannot close mid-save and a failed branch deletion can be safely abandoned',async()=>{
 const h=await appDom();try{
  const id=h.add('保留我的资料');await h.mount();await h.click(h.label('事项'));await h.context(h.query(`[data-outline-id="${id}"]`));await h.click(h.button('移入回收站',h.query('[role=menu]')));
  const d=h.query('dialog'),gate=hold('item.change');await h.click(h.button('确认移入回收站',d));await h.action(()=>d.dispatchEvent(new Event('cancel',{cancelable:true})));
  assert.equal(h.query('dialog'),d);assert.equal(h.button('返回',d).disabled,true);assert.equal(gate.calls,1);
  await h.action(gate.fail);assert.ok(!h.get(id).deletedAt);assert.equal(h.button('返回',d).disabled,false);await h.click(h.button('返回',d));assert.equal(document.querySelector('dialog'),null);assert.ok(!h.get(id).deletedAt);
  gate.restore();
 }finally{await h.close();}
});
