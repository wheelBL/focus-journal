import {test} from 'node:test';
import assert from 'node:assert/strict';
import {appDom} from './app-dom.mjs';

test('one undo history includes status and editing and can redo from another page',async()=>{
 const h=await appDom();try{
  const id=h.add('待办',null);await h.mount();await h.click(h.label('任务'));
  await h.command({type:'task.status',payload:{id,status:'done'}});
  await h.command({type:'outline.patch',payload:{id,field:'title',value:'完成的工作'}});
  await h.key(document.body,'z',{ctrlKey:true});assert.equal(h.get(id).title,'待办');assert.equal(h.get(id).status,'done');
  await h.key(document.body,'z',{ctrlKey:true});assert.equal(h.get(id).status,'open');
  await h.key(document.body,'z',{ctrlKey:true,shiftKey:true});assert.equal(h.get(id).status,'done');
  await h.click(h.label('今日'));await h.key(document.body,'y',{ctrlKey:true});assert.equal(h.get(id).title,'完成的工作');
 }finally{await h.close();}
});

test('native text, dialogs and IME keep their own undo while app bindings change live',async()=>{
 const h=await appDom();try{
  const id=h.add('初始',null);await h.mount();await h.click(h.label('任务'));
  await h.command({type:'outline.patch',payload:{id,field:'title',value:'已编辑'}});
  const input=h.label('在事项树中搜索');input.focus();
  const key=new KeyboardEvent('keydown',{key:'z',ctrlKey:true,bubbles:true,cancelable:true});await h.action(()=>input.dispatchEvent(key));assert.equal(key.defaultPrevented,false);assert.equal(h.get(id).title,'已编辑');
  input.blur();
  const editor=document.createElement('div');editor.setAttribute('contenteditable','');document.body.append(editor);
  const richKey=new KeyboardEvent('keydown',{key:'z',ctrlKey:true,bubbles:true,cancelable:true});await h.action(()=>editor.dispatchEvent(richKey));assert.equal(richKey.defaultPrevented,false);editor.remove();
  const modal=document.createElement('dialog');modal.setAttribute('open','');document.body.append(modal);await h.key(modal,'z',{ctrlKey:true});assert.equal(h.get(id).title,'已编辑');modal.remove();
  await h.key(document.body,'z',{ctrlKey:true,keyCode:229});assert.equal(h.get(id).title,'已编辑');
  const checkbox=document.createElement('input');checkbox.type='checkbox';document.body.append(checkbox);checkbox.focus();await h.key(checkbox,'z',{ctrlKey:true});assert.equal(h.get(id).title,'初始');await h.key(checkbox,'y',{ctrlKey:true});assert.equal(h.get(id).title,'已编辑');checkbox.remove();
  await h.action(()=>{window.localStorage.setItem('journal.shortcuts.v1',JSON.stringify({undo:'Primary+U',redo:'Primary+R'}));window.dispatchEvent(new Event('journal:shortcuts-changed'));});
  await h.key(document.body,'z',{ctrlKey:true});assert.equal(h.get(id).title,'已编辑');
  await h.key(document.body,'u',{ctrlKey:true});assert.equal(h.get(id).title,'初始');
  await h.key(document.body,'y',{ctrlKey:true});assert.equal(h.get(id).title,'初始');
  await h.key(document.body,'r',{ctrlKey:true});assert.equal(h.get(id).title,'已编辑');
 }finally{await h.close();}
});

test('Command Z and edit menu share history and text remains native',async()=>{
 const h=await appDom({platform:'darwin'});let edit;const native=[];
 window.journal.onEditAction=fn=>{edit=fn;return()=>{};};window.journal.editText=async action=>{native.push(action);};
 try{
  const id=h.add('Mac',null);await h.mount();await h.click(h.label('任务'));
  await h.command({type:'outline.patch',payload:{id,field:'title',value:'Mac修改'}});
  await h.key(document.body,'z',{metaKey:true});assert.equal(h.get(id).title,'Mac');
  await h.action(()=>edit('redo'));assert.equal(h.get(id).title,'Mac修改');
  const input=h.label('在事项树中搜索');input.focus();await h.action(()=>edit('undo'));assert.deepEqual(native,['undo']);assert.equal(h.get(id).title,'Mac修改');
  await h.key(input,'z',{metaKey:true});await h.key(input,'z',{metaKey:true,shiftKey:true});assert.deepEqual(native,['undo','undo','redo']);assert.equal(h.get(id).title,'Mac修改');
 }finally{await h.close();}
});
