import {test} from 'node:test';
import assert from 'node:assert/strict';
import {appDom} from './app-dom.mjs';

test('current search focuses the visible list, global search stays global, rebindings apply and recorder is protected',async()=>{
 const h=await appDom();try{
  h.add('测试任务');await h.mount();await h.click(h.label('任务'));
  await h.key(document.body,'f',{ctrlKey:true,code:'KeyF'});assert.equal(document.activeElement,h.label('在事项树中搜索'));
  await h.key(document.activeElement,'k',{ctrlKey:true,code:'KeyK'});assert.equal(document.activeElement,h.label('搜索任务和笔记'));
  await h.input(h.label('搜索任务和笔记'),'测试');await h.key(document.body,'f',{ctrlKey:true,code:'KeyF'});assert.equal(document.activeElement,h.label('搜索任务和笔记'));
  await h.input(h.label('搜索任务和笔记'),'');await h.action(()=>{window.localStorage.setItem('journal.shortcuts.v1',JSON.stringify({'search-current':'Primary+G'}));window.dispatchEvent(new Event('journal:shortcuts-changed'));});
  h.label('搜索任务和笔记').focus();await h.key(document.body,'f',{ctrlKey:true,code:'KeyF'});assert.notEqual(document.activeElement,h.label('在事项树中搜索'));
  await h.key(document.body,'g',{ctrlKey:true,code:'KeyG'});assert.equal(document.activeElement,h.label('在事项树中搜索'));
  const recorder=document.createElement('input');recorder.dataset.shortcutRecorder='';document.body.append(recorder);recorder.focus();await h.key(recorder,'g',{ctrlKey:true,code:'KeyG'});assert.equal(document.activeElement,recorder);recorder.remove();
  await h.click(h.label('笔记'));await h.key(document.body,'g',{ctrlKey:true,code:'KeyG'});assert.equal(document.activeElement,h.label('搜索笔记'));
  await h.click(h.label('提醒'));await h.key(document.body,'g',{ctrlKey:true,code:'KeyG'});assert.equal(document.activeElement,h.label('搜索提醒'));
 }finally{await h.close();}
});


test('tree bindings change immediately and preserve text editing and fixed Enter rename',async()=>{
 const h=await appDom();try{
  const id=h.add('树项目',null);await h.mount();await h.click(h.label('任务'));const row=h.query(`[data-outline-id="${id}"]`);await h.click(row);
  await h.action(()=>{window.localStorage.setItem('journal.shortcuts.v1',JSON.stringify({'create-sibling':'Primary+G',rename:null}));window.dispatchEvent(new Event('journal:shortcuts-changed'));});
  await h.key(row,'Insert');assert.equal(document.querySelector('.inline-creator'),null);
  await h.key(row,'g',{ctrlKey:true,code:'KeyG'});assert.ok(h.label('新事项名称'));await h.key(h.label('新事项名称'),'Escape');
  await h.key(row,'F2');assert.equal(document.querySelector('.inline-editor'),null);await h.key(row,'Enter');assert.ok(document.querySelector('.inline-editor'));
  const input=h.query('.inline-editor input');await h.key(input,'g',{ctrlKey:true,code:'KeyG'});assert.equal(document.querySelector('.inline-creator'),null);
 }finally{await h.close();}
});

test('AltGraph and IME boundary keys do not trigger app or fixed tree shortcuts',async()=>{
 const h=await appDom();try{
  const id=h.add('输入法测试',null);await h.mount();await h.click(h.label('任务'));
  await h.action(()=>{window.localStorage.setItem('journal.shortcuts.v1',JSON.stringify({'search-current':'Primary+Alt+F'}));window.dispatchEvent(new Event('journal:shortcuts-changed'));});
  const global=h.label('搜索任务和笔记');global.focus();
  const altGraph=new KeyboardEvent('keydown',{key:'f',code:'KeyF',ctrlKey:true,altKey:true,bubbles:true,cancelable:true});Object.defineProperty(altGraph,'getModifierState',{value:name=>name==='AltGraph'});
  await h.action(()=>global.dispatchEvent(altGraph));assert.equal(document.activeElement,global);assert.equal(altGraph.defaultPrevented,false);
  const row=h.query(`[data-outline-id="${id}"]`);await h.click(row);
  const enter=new KeyboardEvent('keydown',{key:'Enter',keyCode:229,bubbles:true,cancelable:true});await h.action(()=>row.dispatchEvent(enter));assert.equal(document.querySelector('.inline-editor'),null);assert.equal(enter.defaultPrevented,false);
  await h.input(global,'输入法搜索');const escape=new KeyboardEvent('keydown',{key:'Escape',keyCode:229,bubbles:true,cancelable:true});await h.action(()=>global.dispatchEvent(escape));assert.equal(global.value,'输入法搜索');assert.equal(escape.defaultPrevented,false);
 }finally{await h.close();}
});
