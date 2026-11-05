import {test} from 'node:test';
import assert from 'node:assert/strict';
import {appDom} from './app-dom.mjs';
import {emptyFilter} from '../core/filters.ts';
import {readTree} from '../src/workspace-state.ts';

const addKind=(h,title,parentId,kind)=>h.service.execute({type:'outline.create',payload:{title,parentId,kind}}).state.tasks.at(-1).id;
const row=id=>document.querySelector(`[data-outline-id="${id}"]`);
const inboxButton=()=>[...document.querySelectorAll('[aria-label="事项视图"] button')].find(b=>b.textContent.startsWith('收件箱'));

test('task tree excludes note descendants and retains an ordinary task parent',async()=>{
 const h=await appDom();try{
  const notes=addKind(h,'只有笔记的分组',null,'group');addKind(h,'笔记一',notes,'note');addKind(h,'笔记二',notes,'note');
  const mixed=addKind(h,'有普通父事项的分组',null,'group'),task=h.add('需求场景',mixed);addKind(h,'信息子项',task,'note');
  await h.mount();await h.click(h.label('任务'));
  assert.ok(row(notes));assert.ok(row(mixed));assert.equal(row(h.service.snapshot().state.tasks.find(t=>t.title==='笔记一').id),null);assert.equal(row(h.service.snapshot().state.tasks.find(t=>t.title==='信息子项').id),null);assert.equal(document.querySelectorAll(`[data-outline-id="${task}"]`).length,1);
  assert.equal(h.get(task).itemType,'task');assert.ok(row(task).querySelector('input[type="checkbox"]'));
 }finally{await h.close();}
});

test('children hidden by the unfinished filter do not leave an expansion control or keyboard expansion state',async()=>{
 const h=await appDom();try{
  const parent=h.add('过滤后是叶项',null),child=h.add('隐藏的已完成子项',parent);h.service.execute({type:'task.status',payload:{id:child,status:'done'}});
  await h.mount();await h.click(h.label('任务'));assert.equal(row(child),null);assert.equal(row(parent).hasAttribute('aria-expanded'),false);assert.equal(row(parent).querySelector('button.tree-chevron'),null);
  await h.click(row(parent));await h.key(row(parent),'ArrowRight');assert.equal(row(parent).hasAttribute('aria-expanded'),false);assert.equal(row(parent).getAttribute('aria-selected'),'true');assert.equal(row(child),null);
  await h.click(h.label('平铺视图'));assert.equal(row(parent).querySelector('button.tree-chevron'),null);
 }finally{await h.close();}
});

test('outline menu portals out of clipped panes, clamps to the viewport and keeps keyboard endpoints reachable',async()=>{
 const h=await appDom();const original=window.HTMLElement.prototype.getBoundingClientRect,originalScroll=window.HTMLElement.prototype.scrollIntoView;let scrolled=null;try{
  const id=h.add('底部菜单项',null);await h.mount();await h.click(h.label('任务'));
  Object.defineProperty(window,'innerHeight',{configurable:true,value:400});Object.defineProperty(window,'innerWidth',{configurable:true,value:300});
  window.HTMLElement.prototype.getBoundingClientRect=function(){return this.classList.contains('tree-context-menu')?{left:0,top:0,width:242,height:800,bottom:800,right:242}:original.call(this);};
  window.HTMLElement.prototype.scrollIntoView=function(){scrolled=this;};
  await h.action(()=>row(id).dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true,clientX:295,clientY:395})));
  const menu=h.query('[role="menu"]');assert.equal(menu.closest('.tree-page'),null);assert.equal(menu.parentElement.parentElement,document.body);assert.equal(menu.style.left,'50px');assert.equal(menu.style.top,'8px');assert.equal(menu.style.maxHeight,'384px');
  const enabled=[...menu.querySelectorAll('button:not(:disabled)')];assert.equal(document.activeElement,enabled[0]);await h.key(document.activeElement,'End');assert.equal(document.activeElement,enabled.at(-1));assert.equal(scrolled,enabled.at(-1));await h.key(document.activeElement,'Home');assert.equal(document.activeElement,enabled[0]);await h.key(document.activeElement,'Escape');assert.equal(document.querySelector('[role="menu"]'),null);assert.equal(document.activeElement,row(id));
 }finally{window.HTMLElement.prototype.getBoundingClientRect=original;window.HTMLElement.prototype.scrollIntoView=originalScroll;await h.close();}
});

test('Inbox is a dedicated view with pending organization count and return to tasks',async()=>{
 const h=await appDom();try{
  const task=h.add('待整理事项'),note=addKind(h,'待整理笔记','inbox','note'),child=h.add('保留嵌套',task),outside=h.add('范围外事项',null);
  await h.mount();await h.click(h.label('收件箱'));const page=h.query('.inbox-page'),list=h.label('收件箱内容');assert.match(page.textContent,/2 条待澄清/);assert.match(list.textContent,/待整理事项/);assert.match(list.textContent,/待整理笔记/);assert.doesNotMatch(list.textContent,/保留嵌套|范围外事项/);assert.match(list.textContent,/事项/);assert.match(list.textContent,/笔记/);
  await h.click(h.label('任务'));assert.ok(row(outside));assert.ok(row(task));assert.ok(row(child));assert.equal(row(note),null);assert.equal(h.get(child).parentId,task);
 }finally{await h.close();}
});

test('Inbox reminder defaults to 09:00, retains failed edits, and saves disable/time without duplicates',async()=>{
 const h=await appDom();try{
  h.add('待整理');await h.mount();await h.click(h.label('收件箱'));await h.click(h.label('收件箱整理提醒设置'));
  assert.equal(h.label('收件箱整理提醒时间').value,'09:00');await h.input(h.label('收件箱整理提醒时间'),'10:30');const original=window.journal.command;let reject,calls=0;
  window.journal.command=c=>c.type==='inbox-review.settings'?(calls++,new Promise((_,no)=>{reject=no;})):original(c);
  await h.click(h.button('保存',h.query('dialog')));await h.click(h.button('正在保存…',h.query('dialog')));assert.equal(calls,1);await h.action(()=>reject(Error('提醒设置暂不可写')));assert.match(h.query('dialog [role="alert"]').textContent,/暂不可写/);assert.equal(h.label('收件箱整理提醒时间').value,'10:30');
  window.journal.command=original;await h.click(h.query('dialog input[type="checkbox"]'));await h.click(h.button('保存',h.query('dialog')));assert.equal(document.querySelector('dialog'),null);assert.equal(h.service.snapshot().state.settings.inboxReview.enabled,false);assert.equal(h.service.snapshot().state.settings.inboxReview.time,'10:30');assert.match(h.label('收件箱整理提醒设置').textContent,/已关闭/);
 }finally{await h.close();}
});

test('native Inbox request takes priority over stale locate and never recreates a deleted Inbox',async()=>{
 const h=await appDom();try{
  const outside=h.add('旧定位',null);h.service.execute({type:'item.change',payload:{id:'inbox',action:'delete',confirmBranch:true}});window.sessionStorage.setItem('journal-open-inbox','1');window.sessionStorage.setItem('journal-locate',outside);
  const before=h.service.snapshot().state.tasks.length;await h.mount();assert.ok(h.query('.inbox-page'));assert.match(h.query('.inbox-page').textContent,/收件箱/);assert.equal(h.service.snapshot().state.tasks.length,before);assert.equal(h.button('记录到收件箱').disabled,true);assert.equal(window.sessionStorage.getItem('journal-locate'),null);assert.equal(window.sessionStorage.getItem('journal-open-inbox'),null);
 }finally{await h.close();}
});

test('organizing an Inbox item into a group preserves its identity and makes it visible in that task scope',async()=>{
 const h=await appDom();try{
  const item=h.add('收件箱内容'),group=addKind(h,'另一个范围',null,'group');await h.mount();await h.click(h.label('收件箱'));assert.equal(h.label('收件箱条目名称').value,'收件箱内容');await h.input(h.label('归属分组'),group);await h.click(h.button('保存并下一条'));assert.equal(h.get(item).parentId,group);assert.match(h.query('.inbox-page').textContent,/没有待澄清内容/);await h.click(h.label('任务'));assert.ok(row(item));
 }finally{await h.close();}
});
