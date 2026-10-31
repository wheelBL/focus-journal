import {test} from 'node:test';
import assert from 'node:assert/strict';
import {appDom} from './app-dom.mjs';
test('Mac Command search, inline creation, nesting, timing and deletion retain their targets',async()=>{
 const h=await appDom({platform:'darwin'});try{const parent=h.add('Mac 项目',null),child=h.add('已有事项',parent);await h.mount();await h.click(h.label('事项'));
 await h.key(window,'k',{metaKey:true});assert.equal(document.activeElement.getAttribute('aria-label'),'搜索任务和笔记');await h.action(()=>document.activeElement.blur());
 const row=()=>h.query(`[data-outline-id="${child}"]`);await h.click(row());await h.key(row(),'n',{metaKey:true,altKey:true});assert.ok(h.label('新事项名称'));await h.input(h.label('新事项名称'),'Mac 新子项');await h.key(h.label('新事项名称'),'Enter',{metaKey:true});assert.equal(h.service.snapshot().state.tasks.at(-1).parentId,child);assert.equal(document.querySelector('.inline-creator'),null);
 await h.click(row());await h.key(row(),'Enter',{metaKey:true});assert.equal(h.service.snapshot().timers[0].taskId,child);await h.key(row(),'Enter',{metaKey:true});assert.equal(h.service.snapshot().timers[0].paused,true);
 await h.key(row(),'Backspace');assert.ok(h.query('dialog'));assert.equal(h.get(child).deletedAt,null);await h.key(h.query('dialog'),'Escape');
 }finally{await h.close();}
});
test('Mac Command Enter saves multiline edits and Command N respects the current editing layer',async()=>{
 const h=await appDom({platform:'darwin'});try{const id=h.add('Mac 编辑',null);await h.mount();await h.click(h.label('事项'));await h.click(h.query(`[data-outline-id="${id}"]`));await h.click(h.label('事项说明：未填写'));await h.input(h.label('事项说明'),'保留输入');await h.key(h.label('事项说明'),'Enter',{metaKey:true});assert.equal(h.get(id).description,'保留输入');assert.equal(document.querySelector('.inline-editor textarea'),null);
 await h.key(window,'/',{metaKey:true});assert.ok(h.query('dialog').textContent.includes('⌘'));assert.equal(h.query('dialog').textContent.includes('Windows 快速记录'),false);await h.key(window,'n',{metaKey:true});assert.equal(document.querySelectorAll('dialog').length,1);
 }finally{await h.close();}
});

test('macOS Edit menu routes tree undo to organizing and editable fields to native text undo',async()=>{
 const h=await appDom({platform:'darwin'});let edit,off=false;const native=[];
 window.journal.onEditAction=cb=>{edit=cb;return()=>{off=true;};};window.journal.editText=async action=>{native.push(action);};
 try{const id=h.add('原有名称',null);await h.mount();await h.click(h.label('事项'));await h.click(h.query(`[data-outline-id="${id}"]`));await h.command({type:'outline.patch',payload:{id,field:'title',value:'修改名称'}});await h.action(()=>edit('undo'));assert.equal(h.get(id).title,'原有名称');assert.equal(native.length,0);
 await h.click(h.label('事项说明：未填写'));await h.input(h.label('事项说明'),'仍在编辑');await h.action(()=>edit('undo'));assert.deepEqual(native,['undo']);assert.equal(h.label('事项说明').value,'仍在编辑');
 }finally{await h.close();}assert.equal(off,true);
});
