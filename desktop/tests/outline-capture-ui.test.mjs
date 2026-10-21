import {test} from 'node:test';
import assert from 'node:assert/strict';
import {appDom} from './app-dom.mjs';

test('outline capture, note information and automatic order work through actual components',async t=>{
 const h=await appDom(),{add,get,service,mount,click,key,input,label,query,button,context,action,command}=h;
 const a=add('第一件事'),b=add('第二件事');await mount();await click(label('事项'));
 const row=id=>query(`[data-outline-id="${id}"]`),last=()=>service.snapshot().state.tasks.at(-1);
 const submit=()=>action(()=>label('新事项名称').form.requestSubmit());
 try{
  await t.test('Tab and Shift+Tab during capture preserve draft and persist exact parent relationships',async()=>{
   await click(row(b));await key(row(b),'Insert');await input(label('新事项名称'),'子事项草稿');await key(label('新事项名称'),'Tab');assert.equal(label('新事项名称').value,'子事项草稿');await submit();const child=last().id;assert.equal(get(child).parentId,b);
   await input(label('新事项名称'),'孙事项');await key(label('新事项名称'),'Tab');await key(label('新事项名称'),'Enter',{ctrlKey:true});const grand=last().id;assert.equal(get(grand).parentId,child);assert.ok(!document.querySelector('.inline-creator'));
   await key(row(grand),'Insert');await input(label('新事项名称'),'提升层级');await key(label('新事项名称'),'Tab',{shiftKey:true});await key(label('新事项名称'),'Enter',{ctrlKey:true});assert.equal(last().parentId,b);
   await key(row(b),'Insert');await input(label('新事项名称'),'输入法草稿');await key(label('新事项名称'),'Enter',{isComposing:true,ctrlKey:true});assert.ok(!service.snapshot().state.tasks.some(t=>t.title==='输入法草稿'));await key(label('新事项名称'),'Escape');
  });
  await t.test('row shortcuts move a whole branch, rename, manage one timer and leave text editing alone',async()=>{
   await input(label('视图排序'),'manual');await click(row(b));await key(row(b),'Tab');assert.equal(get(b).parentId,a);await key(row(b),'Tab',{shiftKey:true});assert.equal(get(b).parentId,'inbox');
   await key(row(b),'ArrowUp',{ctrlKey:true});assert.ok(get(b).order<get(a).order);
   await key(row(b),'F2');await input(label('名称 第二件事'),'重新命名');await key(label('名称 第二件事'),'Enter');assert.equal(get(b).title,'重新命名');
   await key(row(b),'Enter',{ctrlKey:true});assert.equal(service.snapshot().timers[0].taskId,b);await key(row(b),'Enter',{ctrlKey:true});assert.equal(service.snapshot().timers[0].paused,true);await key(row(b),'Enter',{ctrlKey:true});assert.equal(service.snapshot().timers[0].paused,false);await key(row(b),'Enter',{ctrlKey:true,shiftKey:true});assert.equal(service.snapshot().timers.length,0);await click(label('关闭'));
   await key(row(a),'F2');await key(label('名称 第一件事'),'Tab');assert.equal(get(a).parentId,'inbox');await key(label('名称 第一件事'),'Escape');
  });
  let note;
  await t.test('hyphen capture and context entry create information with tags and body but no task controls',async()=>{
   await click(row(a));await key(row(a),'Insert');await input(label('新事项名称'),'- 参考信息');await key(label('新事项名称'),'Enter',{ctrlKey:true});note=last().id;assert.equal(get(note).itemType,'note');assert.equal(get(note).title,'参考信息');
   assert.equal(row(note).querySelector('input[type="checkbox"]'),null);assert.equal(row(note).querySelector('.row-start'),null);assert.equal(row(note).querySelector('.tree-estimate .editable-value'),null);
   const inspector=query('.task-inspector');assert.ok(!inspector.textContent.includes('初始估计'));assert.ok(!inspector.textContent.includes('计划开始'));
   await click(label('笔记内容：未填写'));await input(label('笔记内容'),'接口响应字段参考');await key(label('笔记内容'),'Enter',{ctrlKey:true});await input(label('自定义标签'),'资料');await action(()=>label('自定义标签').form.requestSubmit());assert.equal(get(note).description,'接口响应字段参考');assert.equal(get(note).tagIds.length,1);
   await key(row(note),' ');await key(row(note),'Enter',{ctrlKey:true});assert.equal(service.snapshot().timers.length,0);assert.equal(get(note).status,'open');
   await context(row(note));await click(button('新增子笔记'));await input(label('新事项名称'),'子参考');await key(label('新事项名称'),'Enter',{ctrlKey:true});assert.equal(last().itemType,'note');assert.equal(last().parentId,note);
  });
  await t.test('information type filter and global search find notes; conversion preserves identity and content',async()=>{
   await click(button('筛选'));await input(label('筛选条目类型'),'note');assert.ok(row(note));assert.equal(document.querySelector(`[data-outline-id="${b}"]`),null);
   await click(row(note));await click(button('转为事项'));assert.equal(get(note).itemType,'task');assert.equal(get(note).description,'接口响应字段参考');assert.ok(row(note));assert.match(query('.retained-notice').textContent,/不符合/);
   await click(button('清除筛选'));assert.ok(label('开始参考信息'));await input(label('搜索任务和笔记'),'接口响应字段参考');assert.ok(button('参考信息'));await input(label('搜索任务和笔记'),'');await click(label('事项'));
  });
  await t.test('automatic sorting does not mutate stored order, holds positions during typing, and is saved with a view',async()=>{
   await input(label('视图排序'),'smart');const before=get(a).order;await command({type:'outline.patch',payload:{id:a,field:'dueAt',value:'2026-10-18'}});const visible=()=>[...query('[role="tree"]').querySelectorAll('[data-outline-id]')].map(n=>n.dataset.outlineId);
   assert.ok(visible().indexOf(a)<visible().indexOf(b));assert.equal(get(a).order,before);
   await click(row(b));await key(row(b),'Insert');await input(label('新事项名称'),'保持位置');const prior=visible();await command({type:'outline.patch',payload:{id:b,field:'dueAt',value:'2026-10-17'}});assert.deepEqual(visible(),prior);await key(label('新事项名称'),'Escape');assert.ok(visible().indexOf(b)<visible().indexOf(a));
   await click(button('保存视图'));await input(label('常用视图名称'),'自动工作顺序');await action(()=>label('常用视图名称').form.requestSubmit());const view=service.snapshot().state.views.find(v=>v.name==='自动工作顺序');assert.equal(view.filter.sort,'smart');await input(label('视图排序'),'title');await input(label('常用视图'),view.id);assert.equal(label('视图排序').value,'smart');
  });
 }finally{await h.close();}
});
