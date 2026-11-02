import {test} from 'node:test';
import assert from 'node:assert/strict';
import {appDom} from './app-dom.mjs';
import {emptyFilter} from '../core/filters.ts';
import {readTree} from '../src/workspace-state.ts';

const addKind=(h,title,parentId,kind)=>h.service.execute({type:'outline.create',payload:{title,parentId,kind}}).state.tasks.at(-1).id;
const row=id=>document.querySelector(`[data-outline-id="${id}"]`);
const inboxButton=()=>[...document.querySelectorAll('[aria-label="事项视图"] button')].find(b=>b.textContent.startsWith('收件箱'));

test('group pending status excludes note descendants and includes an ordinary task parent exactly once',async()=>{
 const h=await appDom();try{
  const notes=addKind(h,'只有笔记的分组',null,'group');addKind(h,'笔记一',notes,'note');addKind(h,'笔记二',notes,'note');
  const mixed=addKind(h,'有普通父事项的分组',null,'group'),task=h.add('需求场景',mixed);addKind(h,'信息子项',task,'note');
  await h.mount();await h.click(h.label('事项'));
  assert.match(row(notes).querySelector('.tree-status').textContent,/暂无待办/);assert.match(row(mixed).querySelector('.tree-status').textContent,/1 个待办/);
  assert.equal(h.get(task).itemType,'task');assert.ok(row(task).querySelector('input[type="checkbox"]'));
 }finally{await h.close();}
});

test('children hidden by the unfinished filter do not leave an expansion control or keyboard expansion state',async()=>{
 const h=await appDom();try{
  const parent=h.add('过滤后是叶项',null),child=h.add('隐藏的已完成子项',parent);h.service.execute({type:'task.status',payload:{id:child,status:'done'}});
  await h.mount();await h.click(h.label('事项'));assert.equal(row(child),null);assert.equal(row(parent).hasAttribute('aria-expanded'),false);assert.equal(row(parent).querySelector('button.tree-chevron'),null);
  await h.click(row(parent));await h.key(row(parent),'ArrowRight');assert.equal(row(parent).hasAttribute('aria-expanded'),false);assert.equal(row(parent).getAttribute('aria-selected'),'true');assert.equal(row(child),null);
  await h.click(h.label('平铺视图'));assert.equal(row(parent).querySelector('button.tree-chevron'),null);
 }finally{await h.close();}
});

test('outline menu portals out of clipped panes, clamps to the viewport and keeps keyboard endpoints reachable',async()=>{
 const h=await appDom();const original=window.HTMLElement.prototype.getBoundingClientRect,originalScroll=window.HTMLElement.prototype.scrollIntoView;let scrolled=null;try{
  const id=h.add('底部菜单项',null);await h.mount();await h.click(h.label('事项'));
  Object.defineProperty(window,'innerHeight',{configurable:true,value:400});Object.defineProperty(window,'innerWidth',{configurable:true,value:300});
  window.HTMLElement.prototype.getBoundingClientRect=function(){return this.classList.contains('tree-context-menu')?{left:0,top:0,width:242,height:800,bottom:800,right:242}:original.call(this);};
  window.HTMLElement.prototype.scrollIntoView=function(){scrolled=this;};
  await h.action(()=>row(id).dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true,clientX:295,clientY:395})));
  const menu=h.query('[role="menu"]');assert.equal(menu.closest('.tree-page'),null);assert.equal(menu.parentElement.parentElement,document.body);assert.equal(menu.style.left,'50px');assert.equal(menu.style.top,'8px');assert.equal(menu.style.maxHeight,'384px');
  const enabled=[...menu.querySelectorAll('button:not(:disabled)')];assert.equal(document.activeElement,enabled[0]);await h.key(document.activeElement,'End');assert.equal(document.activeElement,enabled.at(-1));assert.equal(scrolled,enabled.at(-1));await h.key(document.activeElement,'Home');assert.equal(document.activeElement,enabled[0]);await h.key(document.activeElement,'Escape');assert.equal(document.querySelector('[role="menu"]'),null);assert.equal(document.activeElement,row(id));
 }finally{window.HTMLElement.prototype.getBoundingClientRect=original;window.HTMLElement.prototype.scrollIntoView=originalScroll;await h.close();}
});

test('Inbox is a dedicated view with direct pending organization count, nested contents and return to All Items',async()=>{
 const h=await appDom();try{
  const task=h.add('待整理事项'),note=addKind(h,'待整理笔记','inbox','note'),child=h.add('保留嵌套',task),outside=h.add('范围外事项',null);
  const filter=emptyFilter();window.localStorage.setItem(`journal.tree.${h.service.snapshot().dataPath}`,JSON.stringify({selected:outside,filter,activeView:'',collapsed:['inbox'],showDetails:true,scrollTop:0,layout:'tree',completedDefaultVersion:1}));
  await h.mount();await h.click(h.label('事项'));await h.click(inboxButton());
  assert.equal(inboxButton().getAttribute('aria-pressed'),'true');assert.match(inboxButton().textContent,/2 待整理/);assert.equal(row('inbox'),null);assert.equal(row(outside),null);assert.equal(row(task).getAttribute('aria-level'),'1');assert.equal(row(child).getAttribute('aria-level'),'2');assert.ok(row(note));assert.equal(row(note).querySelector('input[type=checkbox]'),null);assert.ok([task,note,child].some(id=>row(id).getAttribute('aria-selected')==='true'));
  assert.match(h.query('.tree-page-header h1').textContent,/收件箱.*2 待整理/);const remembered=readTree(`journal.tree.${h.service.snapshot().dataPath}`,h.service.snapshot().state);assert.equal(remembered.activeView,'@inbox');
  await h.click(h.button('全部事项',h.query('[aria-label="事项视图"]')));assert.ok(row(outside));assert.ok(row('inbox'));assert.equal(inboxButton().getAttribute('aria-pressed'),'false');assert.equal(h.label('在事项树中搜索').value,'');
 }finally{await h.close();}
});

test('Inbox reminder defaults to 09:00, retains failed edits, and saves disable/time without duplicates',async()=>{
 const h=await appDom();try{
  h.add('待整理');await h.mount();await h.click(h.label('事项'));await h.click(inboxButton());await h.click(h.label('收件箱整理提醒设置'));
  assert.equal(h.label('收件箱整理提醒时间').value,'09:00');await h.input(h.label('收件箱整理提醒时间'),'10:30');const original=window.journal.command;let reject,calls=0;
  window.journal.command=c=>c.type==='inbox-review.settings'?(calls++,new Promise((_,no)=>{reject=no;})):original(c);
  await h.click(h.button('保存',h.query('dialog')));await h.click(h.button('正在保存…',h.query('dialog')));assert.equal(calls,1);await h.action(()=>reject(Error('提醒设置暂不可写')));assert.match(h.query('dialog [role="alert"]').textContent,/暂不可写/);assert.equal(h.label('收件箱整理提醒时间').value,'10:30');
  window.journal.command=original;await h.click(h.query('dialog input[type="checkbox"]'));await h.click(h.button('保存',h.query('dialog')));assert.equal(document.querySelector('dialog'),null);assert.equal(h.service.snapshot().state.settings.inboxReview.enabled,false);assert.equal(h.service.snapshot().state.settings.inboxReview.time,'10:30');assert.match(h.label('收件箱整理提醒设置').textContent,/已关闭/);
 }finally{await h.close();}
});

test('native Inbox request takes priority over stale locate and never recreates a deleted Inbox',async()=>{
 const h=await appDom();try{
  const outside=h.add('旧定位',null);h.service.execute({type:'item.change',payload:{id:'inbox',action:'delete',confirmBranch:true}});window.sessionStorage.setItem('journal-open-inbox','1');window.sessionStorage.setItem('journal-locate',outside);
  const before=h.service.snapshot().state.tasks.length;await h.mount();await h.click(h.label('事项'));assert.equal(inboxButton().getAttribute('aria-pressed'),'true');assert.equal(row(outside),null);assert.match(h.query('.tree-empty').textContent,/收件箱暂不可用/);assert.equal(h.service.snapshot().state.tasks.length,before);assert.equal(h.button('新增事项').disabled,true);await h.key(h.label('事项树'),'Insert');assert.equal(document.querySelector('.inline-creator'),null);assert.equal(window.sessionStorage.getItem('journal-locate'),null);assert.equal(window.sessionStorage.getItem('journal-open-inbox'),null);
 }finally{await h.close();}
});


test('changing filter scope leaves Inbox and keeps the resulting rows and creation destination consistent',async()=>{
 const h=await appDom();try{
  h.add('收件箱内容');const outside=h.add('另一个范围',null),child=h.add('范围内内容',outside);
  await h.mount();await h.click(h.label('事项'));await h.click(inboxButton());await h.click(h.button('筛选'));await h.input(h.label('筛选范围'),outside);
  assert.equal(inboxButton().getAttribute('aria-pressed'),'false');assert.match(h.query('.tree-page-header h1').textContent,/全部事项.*另一个范围/);assert.ok(row(child));assert.equal(row('inbox'),null);
  await h.click(row(child));await h.click(h.button('新增事项'));await h.input(h.label('新事项名称'),'在所选范围内新增');await h.click(h.button('保存并结束'));assert.equal(h.service.snapshot().state.tasks.at(-1).parentId,outside);
  await h.command({type:'view.save',payload:{name:'另一个范围视图',filter:{...emptyFilter(),scopeId:outside}}});const saved=h.service.snapshot().state.views.find(v=>v.name==='另一个范围视图');await h.click(inboxButton());await h.input(h.label('常用视图'),saved.id);assert.equal(h.label('常用视图').value,saved.id);assert.match(h.query('.tree-page-header h1').textContent,/另一个范围视图/);
 }finally{await h.close();}
});
