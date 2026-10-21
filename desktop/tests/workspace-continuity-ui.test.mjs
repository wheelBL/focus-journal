import {test} from 'node:test';
import assert from 'node:assert/strict';
import {appDom} from './app-dom.mjs';

test('workspace location, view meaning, inspector modes and completion remain coherent',async t=>{
 const h=await appDom(),{add,get,service,mount,click,key,input,label,query,button,action,command}=h;
 const project=add('项目 A',null),other=add('项目 B',null),a=add('事项 A',project),b=add('事项 B',project),c=add('事项 C',other);
 service.execute({type:'outline.patch',payload:{id:project,field:'isProject',value:true}});service.execute({type:'outline.patch',payload:{id:other,field:'isProject',value:true}});
 await mount();await click(label('事项'));const row=id=>query(`[data-outline-id="${id}"]`),tab=name=>[...query('.inspector-tabs').querySelectorAll('button')].find(b=>b.textContent.startsWith(name));
 try{
  await t.test('closing details survives selection and keyboard navigation; tabs survive changing items',async()=>{
   await click(row(a));await click(label('收起详情'));await click(row(b));await key(row(b),'ArrowDown');assert.equal(document.querySelector('.task-inspector'),null);
   await click(row(a));await click(button('详情'));await click(tab('投入'));assert.ok(query('.inspector-records'));assert.equal(document.querySelector('.inspector-properties'),null);
   await click(row(b));assert.ok(query('.inspector-records'));await click(tab('复盘'));await click(row(a));assert.ok(query('.inspector-review'));assert.equal(document.querySelector('.inspector-properties'),null);
   await click(tab('内容'));assert.ok(query('.inspector-properties'));
  });
  await t.test('local search temporarily expands matches and restores collapsed branches and scroll',async()=>{
   await click(label('折叠项目 A'));const scroll=query('.outline-scroll');await action(()=>{scroll.scrollTop=120;});assert.equal(document.querySelector(`[data-outline-id="${a}"]`),null);
   await input(label('在事项树中搜索'),'事项 A');assert.ok(row(a));await input(label('在事项树中搜索'),'');assert.equal(document.querySelector(`[data-outline-id="${a}"]`),null);assert.equal(scroll.scrollTop,120);await click(label('展开项目 A'));
  });
  await t.test('saved views restore their own scope; temporary project scope is explicit and All Items resets it',async()=>{
   await click(button('保存视图'));await input(label('常用视图名称'),'工作清单');await action(()=>label('常用视图名称').form.requestSubmit());const view=service.snapshot().state.views.find(v=>v.name==='工作清单');
   await click(button('项目 A',query('[aria-label="事项范围"]')));assert.match(query('.tree-page-header h1').textContent,/工作清单.*项目 A/);assert.ok(button('更新当前视图'));await click(label('清除范围'));assert.ok(row(c));
   await input(label('在事项树中搜索'),'事项 A');await click(button('全部事项',query('[aria-label="事项视图"]')));assert.equal(label('在事项树中搜索').value,'');assert.ok(row(c));assert.equal(label('常用视图').value,'');
   await click(button('项目 A',query('[aria-label="事项范围"]')));await input(label('常用视图'),view.id);assert.ok(row(c));assert.equal(document.querySelector('.view-scope-title'),null);
  });
  await t.test('leaf completion is identical from checkbox, keyboard and details and all paths offer undo',async()=>{
   await click(label('完成事项 A'));assert.equal(get(a).status,'done');assert.equal(document.querySelector('dialog'),null);await click(button('撤销状态调整',query('.outline-toolbar')));assert.equal(get(a).status,'open');
   await click(row(a));await key(row(a),' ');assert.equal(get(a).status,'done');assert.equal(document.querySelector('dialog'),null);await click(button('撤销状态调整',query('.outline-toolbar')));
   await click(row(a));await click(button('完成事项',query('.task-inspector')));assert.equal(get(a).status,'done');await click(button('撤销状态调整',query('.outline-toolbar')));
   await key(row(a),'Enter',{ctrlKey:true});await click(label('完成事项 A'));assert.ok(query('dialog[aria-label="完成事项"]'));assert.equal(get(a).status,'open');await click(button('返回',query('dialog')));await command({type:'focus.stop',payload:{taskId:a}});
   await click(label('完成项目 A'));assert.ok(label('处理未结束子项'));await click(button('返回',query('dialog')));
  });
  await t.test('header capture follows current scope and exhausted effort is re-estimated in the right mode',async()=>{
   await click(button('项目 A',query('[aria-label="事项范围"]')));await click(row(project));await click(button('新增事项'));await input(label('新事项名称'),'范围内新事项');await key(label('新事项名称'),'Enter',{ctrlKey:true});assert.equal(service.snapshot().state.tasks.at(-1).parentId,project);await click(label('清除范围'));
   await command({type:'outline.patch',payload:{id:a,field:'estimateMinutes',value:25}});await command({type:'session.manual',payload:{taskId:a,date:'2026-10-18',minutes:30}});await click(row(a));assert.match(query('.node-meta').textContent,/进行中/);assert.match(query('.estimate-exhausted').textContent,/估计已用尽/);
   await click(tab('复盘'));assert.match(query('.estimate-facts').textContent,/本项，不含子项/);assert.match(query('.estimate-facts').textContent,/剩余待重估/);await click(button('调整剩余估计'));assert.equal(label('当前估计剩余').value,'');await input(label('当前估计剩余'),'0');await click(button('保存调整'));assert.match(query('.estimate-facts').textContent,/0 分钟（已确认）/);assert.equal(get(a).status,'open');
   await click(tab('投入'));assert.ok(button('补记本项投入'));assert.ok(button('校正'));await click(button('补记本项投入'));assert.equal(query('dialog select').value,a);await click(label('关闭'));
  });
 }finally{await h.close();}
});
