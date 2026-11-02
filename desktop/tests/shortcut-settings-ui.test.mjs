import {test} from 'node:test';
import assert from 'node:assert/strict';
import {appDom} from './app-dom.mjs';

const category=(h,name)=>h.click(h.button(name,h.label('设置分区')));
const visible=()=>[...document.querySelectorAll('.settings-category')].find(element=>!element.hidden)?.id;
const stored=()=>JSON.parse(window.localStorage.getItem('journal.shortcuts.v1'));
const open=async h=>{await h.mount();await h.click(h.label('设置'));await category(h,'快捷键');};
const helpRow=label=>[...document.querySelectorAll('.shortcut-groups dd')].find(element=>element.textContent===label)?.previousElementSibling?.textContent;

test('recording shortcuts protects IME and avoids dispatch, validates conflicts and preserves the draft across settings categories',async()=>{
 const h=await appDom();try{
  await open(h);const field=h.label('搜索当前列表快捷键');assert.equal(field.value,'Ctrl + F');assert.equal(field.readOnly,true);assert.equal(field.dataset.shortcutRecorder,'true');
  await h.key(field,'b',{ctrlKey:true});assert.equal(field.value,'Ctrl + B');assert.equal(stored(),null);assert.equal(document.querySelector('dialog[open]'),null);
  await h.key(field,'n',{ctrlKey:true,isComposing:true});assert.equal(field.value,'Ctrl + B');
  await h.key(field,'k',{ctrlKey:true});assert.equal(field.value,'Ctrl + B');assert.match(h.query('#shortcut-error-search-current').textContent,/搜索全部内容.*冲突/);assert.equal(h.button('保存快捷键设置').disabled,true);
  await category(h,'专注与休息');await category(h,'快捷键');assert.equal(h.label('搜索当前列表快捷键'),field);assert.equal(field.value,'Ctrl + B');assert.equal(field.getAttribute('aria-invalid'),'true');
  await h.key(field,'c',{ctrlKey:true});assert.match(h.query('#shortcut-error-search-current').textContent,/保留给文字编辑/);assert.equal(field.value,'Ctrl + B');
  await h.key(field,'b',{ctrlKey:true});assert.equal(document.querySelector('#shortcut-error-search-current'),null);assert.equal(h.button('保存快捷键设置').disabled,false);
  await h.click(h.button('保存快捷键设置'));assert.equal(stored()['search-current'],'Primary+B');assert.match(h.query('#settings-shortcuts').textContent,/快捷键已保存/);
 }finally{await h.close();}
});

test('failed shortcut save leaves every binding and draft intact for a single atomic retry, with clear and restore actions',async()=>{
 const h=await appDom();try{
  await open(h);const field=h.label('搜索当前列表快捷键');await h.key(field,'b',{ctrlKey:true});await h.click(h.label('清除查看快捷键快捷键'));
  assert.equal(h.label('查看快捷键快捷键').value,'未设置');
  const storagePrototype=Object.getPrototypeOf(window.localStorage),original=storagePrototype.setItem;let writes=0;
  storagePrototype.setItem=function(){writes++;throw new Error('disk unavailable');};
  await h.click(h.button('保存快捷键设置'));assert.equal(writes,1);assert.equal(stored(),null);assert.match(h.query('#settings-shortcuts [role=alert]').textContent,/无法保存快捷键设置/);assert.equal(field.value,'Ctrl + B');assert.equal(h.label('查看快捷键快捷键').value,'未设置');
  storagePrototype.setItem=function(...args){writes++;return original.apply(this,args);};
  await h.click(h.button('保存快捷键设置'));assert.equal(writes,2);assert.equal(stored()['search-current'],'Primary+B');assert.equal(stored().help,null);
  await h.click(h.label('恢复搜索当前列表默认快捷键'));assert.equal(field.value,'Ctrl + F');assert.equal(stored()['search-current'],'Primary+B');
  await h.click(h.button('恢复全部默认'));assert.equal(h.label('查看快捷键快捷键').value,'Ctrl + /');assert.equal(document.querySelector('dialog[open]'),null);assert.equal(stored().help,null);
  await h.click(h.button('保存快捷键设置'));assert.equal(stored()['search-current'],'Primary+F');assert.equal(stored().help,'Primary+Slash');storagePrototype.setItem=original;
 }finally{await h.close();}
});

test('help shows saved bindings and actual global capture key, and opens either configuration category in one click',async()=>{
 const h=await appDom();try{
  window.journal.capture={preferences:async()=>({shortcut:'Ctrl+Alt+J',registered:true}),configure:async()=>{},open:async()=>{}};
  await open(h);await h.key(h.label('搜索当前列表快捷键'),'b',{ctrlKey:true});await h.click(h.button('保存快捷键设置'));await category(h,'使用习惯');
  await h.click(h.button('查看事项快捷键'));assert.equal(helpRow('搜索当前列表'),'Ctrl + B');assert.equal(helpRow('搜索全部内容'),'Ctrl + K');assert.equal(helpRow('全局快速记录（应用保持运行时）'),'Ctrl+Alt+J');assert.match(h.label('事项快捷操作').textContent,/输入法组合输入/);assert.ok(helpRow('缩进 / 提升整棵分支'));
  await h.click(h.button('配置快捷键',h.label('事项快捷操作')));assert.equal(document.querySelector('dialog[open]'),null);assert.equal(visible(),'settings-category-shortcuts');
  await h.click(h.button('设置全局快速记录快捷键',h.query('#settings-shortcuts')));assert.equal(visible(),'settings-category-capture');
  await category(h,'使用习惯');await h.click(h.button('查看事项快捷键'));await h.click(h.button('设置全局快速记录快捷键',h.label('事项快捷操作')));assert.equal(document.querySelector('dialog[open]'),null);assert.equal(visible(),'settings-category-capture');
 }finally{await h.close();}
});

test('macOS records Command bindings and documents the fixed native quit key without accepting its reassignment',async()=>{
 const h=await appDom({platform:'darwin'});try{
  await open(h);const field=h.label('搜索当前列表快捷键');assert.equal(field.value,'⌘ + F');await h.key(field,'b',{metaKey:true});assert.equal(field.value,'⌘ + B');
  await h.key(field,'q',{metaKey:true});assert.equal(field.value,'⌘ + B');assert.match(h.query('#shortcut-error-search-current').textContent,/系统保留用于退出/);
  await h.key(field,'b',{metaKey:true});await h.click(h.button('保存快捷键设置'));await category(h,'使用习惯');await h.click(h.button('查看事项快捷键'));assert.equal(helpRow('搜索当前列表'),'⌘ + B');assert.equal(helpRow('系统退出快捷键'),'⌘ + Q');
 }finally{await h.close();}
});

test('list search, row edit titles and context menu hints reflect rebinding and omit cleared shortcut hints',async()=>{
 const h=await appDom();try{
  const id=h.add('快捷键提示');await open(h);
  await h.key(h.label('搜索当前列表快捷键'),'b',{ctrlKey:true});await h.key(h.label('新增同级事项快捷键'),'j',{ctrlKey:true,shiftKey:true});await h.click(h.label('清除新增子事项快捷键'));await h.key(h.label('编辑名称快捷键'),'m',{ctrlKey:true,shiftKey:true});await h.click(h.button('保存快捷键设置'));
  await h.click(h.label('任务'));const row=h.query(`[data-outline-id="${id}"]`);assert.equal(h.label('在事项树中搜索').placeholder,'搜索事项 · Ctrl + B');assert.match(h.label('名称 快捷键提示：快捷键提示').title,/Ctrl \+ Shift \+ M/);assert.doesNotMatch(h.label('名称 快捷键提示：快捷键提示').title,/F2/);
  await h.context(row);const menu=h.label('事项操作'),item=prefix=>[...menu.querySelectorAll('button')].find(button=>button.textContent.trim().startsWith(prefix));
  assert.equal(item('新增同级事项').querySelector('kbd').textContent,'Ctrl Shift J');assert.equal(item('新增子事项').querySelector('kbd'),null);assert.equal(item('新增子事项').disabled,false);assert.equal(item('重命名').querySelector('kbd').textContent,'Ctrl Shift M');
  await h.key(menu,'Escape');await h.click(h.label('设置'));await category(h,'快捷键');await h.click(h.label('清除编辑名称快捷键'));await h.click(h.button('保存快捷键设置'));await h.click(h.label('任务'));
  assert.match(h.label('名称 快捷键提示：快捷键提示').title,/Enter 编辑/);await h.context(h.query(`[data-outline-id="${id}"]`));assert.equal([...h.label('事项操作').querySelectorAll('button')].find(button=>button.textContent.trim()==='重命名').querySelector('kbd'),null);
 }finally{await h.close();}
});

test('external shortcut changes refresh a clean settings form and preserve a locally edited draft',async()=>{
 const h=await appDom();try{
  await open(h);const field=h.label('搜索当前列表快捷键');
  const external=bindings=>h.action(()=>{window.localStorage.setItem('journal.shortcuts.v1',JSON.stringify(bindings));window.dispatchEvent(new Event('storage'));});
  await external({'search-current':'Primary+B'});assert.equal(field.value,'Ctrl + B');assert.equal(h.button('保存快捷键设置').disabled,true);
  await h.key(field,'b',{ctrlKey:true,shiftKey:true});await external({'search-current':'Primary+J'});assert.equal(field.value,'Ctrl + Shift + B');assert.equal(h.button('保存快捷键设置').disabled,false);
  await h.click(h.button('保存快捷键设置'));assert.equal(stored()['search-current'],'Primary+Shift+B');
 }finally{await h.close();}
});
