import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';
import {JournalService} from '../core/service.ts';
import {emptyState} from '../core/types.ts';

// In-process DOM tests exercise the real React events and service without launching Electron.
const dom=new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>',{url:'http://localhost',pretendToBeVisual:true});
for(const key of ['window','document','HTMLElement','HTMLInputElement','HTMLSelectElement','HTMLTextAreaElement','Event','MouseEvent','KeyboardEvent','CustomEvent'])globalThis[key]=dom.window[key];
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
globalThis.requestAnimationFrame=callback=>setTimeout(callback,0);globalThis.cancelAnimationFrame=clearTimeout;
dom.window.HTMLElement.prototype.scrollIntoView=function(){};dom.window.HTMLElement.prototype.scrollBy=function(){};
dom.window.HTMLElement.prototype.setPointerCapture=function(){this.captured=true;};dom.window.HTMLElement.prototype.hasPointerCapture=function(){return !!this.captured;};dom.window.HTMLElement.prototype.releasePointerCapture=function(){this.captured=false;};
dom.window.HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','');};dom.window.HTMLDialogElement.prototype.close=function(){this.removeAttribute('open');};
const {default:React,act}=await import('react'),{createRoot}=await import('react-dom/client');
const folder=path.resolve('qa-evidence/release-0.8.0/dom');mkdirSync(folder,{recursive:true});
const output=path.join(folder,'harness.mjs');await build({entryPoints:['tests/interaction-harness.tsx'],outfile:output,bundle:true,platform:'node',format:'esm',packages:'external',jsx:'automatic',loader:{'.css':'empty'},logLevel:'silent'});
const {Harness}=await import(pathToFileURL(output).href);
class Store{path='DOM tests';state=emptyState();load(){return structuredClone(this.state);}save(s){this.state=structuredClone(s);}close(){}}
class Clock{time=Date.parse('2026-10-19T14:00:00+08:00');mono=0;now(){return this.time;}monotonic(){return this.mono;}advance(ms){this.time+=ms;this.mono+=ms;}}
const query=(selector,root=document)=>{const el=root.querySelector(selector);assert.ok(el,`Missing ${selector}`);return el;};
const label=(name,root=document)=>query(`[aria-label="${name}"]`,root);
const button=(name,root=document)=>{const el=[...root.querySelectorAll('button')].find(b=>b.textContent.trim()===name);assert.ok(el,`Missing button ${name}`);return el;};
const row=name=>label(name,query('[role=tree]'));
const action=async callback=>{await act(async()=>{await callback();await new Promise(resolve=>setTimeout(resolve,5));});};
const click=el=>action(()=>el.click());
const context=el=>action(()=>el.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true,clientX:200,clientY:180})));
const input=(el,value)=>action(()=>{const proto=el instanceof HTMLSelectElement?HTMLSelectElement.prototype:el instanceof HTMLTextAreaElement?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,'value').set.call(el,value);el.dispatchEvent(new Event(el instanceof HTMLSelectElement?'change':'input',{bubbles:true}));});
const key=(el,k,extra={})=>action(()=>{const e=new KeyboardEvent('keydown',{key:k,bubbles:true,cancelable:true,...extra});el.dispatchEvent(e);if(k==='Enter'&&!e.defaultPrevented&&el.form&&!extra.isComposing)el.form.requestSubmit();});
const submit=el=>action(()=>el.requestSubmit());

test('real tree interactions: context creation, keyboard, inline edit, tags, filters, views, timer and undo',async t=>{
 const clock=new Clock(),service=new JournalService(new Store(),clock),messages=[];
 const create=(title,parentId=null)=>service.execute({type:'outline.create',payload:{title,parentId}}).state.tasks.at(-1).id;
 const parent=create('父事项'),other=create('另一事项'),original=create('原有子项',parent);
 service.execute({type:'outline.patch',payload:{id:parent,field:'isProject',value:true}});
 const oldDue=create('上周到期',parent),sunday=create('周日截止',parent),monday=create('下周一截止',parent),doneDue=create('已经完成');
 for(const [id,value] of [[oldDue,'2026-10-18T12:00:00'],[sunday,'2026-10-25T23:59:00'],[monday,'2026-10-26T00:00:00'],[doneDue,'2026-10-20T12:00:00']])service.execute({type:'outline.patch',payload:{id,field:'dueAt',value}});
 service.execute({type:'task.status',payload:{id:doneDue,status:'done'}});
 const root=createRoot(query('#root'));await action(()=>root.render(React.createElement(Harness,{service,messages})));
 try{
 await t.test('right-click creates at target, Enter continues at same level, Escape exits; no duplicate creation buttons',async()=>{
  assert.equal(document.querySelectorAll('.row-add,.inspector-add').length,0);assert.equal(document.querySelectorAll('.tree-page-header button').length,1);
  await context(row('父事项'));await click(button('新增子事项 Ctrl Insert'));assert.equal(document.activeElement,label('新事项名称'));
  await input(label('新事项名称'),'新增子项');await key(label('新事项名称'),'Enter');
  const a=service.snapshot().state.tasks.find(t=>t.title==='新增子项');assert.equal(a.parentId,parent);assert.ok(row('新增子项'));assert.equal(label('新事项名称').value,'');
  await input(label('新事项名称'),'连续创建');await key(label('新事项名称'),'Enter');assert.equal(service.snapshot().state.tasks.find(t=>t.title==='连续创建').parentId,parent);
  await key(label('新事项名称'),'Escape');assert.ok(!document.querySelector('[aria-label="新事项名称"]'));
 });
 await t.test('keyboard sibling/child creation, F2 editing, IME Enter does not commit prematurely',async()=>{
  await click(row('原有子项'));await key(row('原有子项'),'Insert');await input(label('新事项名称'),'同级事项');await key(label('新事项名称'),'Enter',{isComposing:true});assert.ok(!service.snapshot().state.tasks.some(t=>t.title==='同级事项'));await key(label('新事项名称'),'Enter');await key(label('新事项名称'),'Escape');
  const a=service.snapshot().state.tasks.find(t=>t.title==='同级事项');assert.equal(a.parentId,parent);
  await key(row('同级事项'),'Insert',{ctrlKey:true});await input(label('新事项名称'),'孙事项');await key(label('新事项名称'),'Enter');await key(label('新事项名称'),'Escape');assert.equal(service.snapshot().state.tasks.find(t=>t.title==='孙事项').parentId,a.id);
  await key(row('同级事项'),'F2');await input(label('名称 同级事项'),'行内改名');await key(label('名称 同级事项'),'Enter');assert.ok(row('行内改名'));
  await key(row('行内改名'),'z',{ctrlKey:true});assert.ok(row('同级事项'));assert.ok(row('孙事项'));
 });
 await t.test('free text tags have no suggestion list; filtered edit stays until selecting elsewhere',async()=>{
  await click(row('原有子项'));const field=label('自定义标签');assert.equal(field.autocomplete,'off');assert.equal(field.getAttribute('list'),null);assert.equal(document.querySelectorAll('[role=listbox]').length,0);
  await input(field,' 自定义 ');await key(field,'Enter');await input(label('自定义标签'),'自定义');await key(label('自定义标签'),'Enter');assert.equal(service.snapshot().state.tags.length,1);
  await click(row('另一事项'));await input(label('自定义标签'),'自定义');await key(label('自定义标签'),'Enter');
  await click(query('.row-tag',row('原有子项')));assert.ok(row('父事项'));assert.ok(!document.querySelector('[aria-label="同级事项"]'));assert.ok(row('原有子项'));
  await click(row('原有子项'));await click(label('从此事项移除标签 自定义'));assert.ok(row('原有子项'));assert.match(query('.retained-notice').textContent,/不符合当前筛选/);
  await click(row('另一事项'));assert.ok(!document.querySelector('[role=treeitem][aria-label="原有子项"]'));
  await click(button('清除筛选'));assert.ok(row('原有子项'));
 });
 await t.test('filter controls persist dynamic saved views; selected edited item survives query changes',async()=>{
  await click(button('筛选'));await input(label('筛选计划开始'),'today');await click(button('保存视图'));await input(label('常用视图名称'),'今日计划');await submit(label('常用视图名称').form);assert.deepEqual(service.snapshot().state.views[0].filter.rules.children,[{kind:'condition',field:'status',op:'is-not',value:'done'},{kind:'condition',field:'status',op:'is-not',value:'cancelled'},{kind:'condition',field:'plannedDate',op:'period',value:'today'}]);
  await click(button('清除筛选'));await input(label('常用视图'),service.snapshot().state.views[0].id);assert.equal(label('筛选计划开始').value,'today');await click(button('清除筛选'));
  await input(label('在事项树中搜索'),'原有');await click(row('原有子项'));await key(row('原有子项'),'F2');await input(label('名称 原有子项'),'改了名称');await key(label('名称 原有子项'),'Enter');assert.ok(row('改了名称'));assert.ok(document.querySelector('.retained-notice'));
  await click(button('清除筛选'));await click(label('折叠全部'));assert.ok(!document.querySelector('[role=treeitem][aria-label="改了名称"]'));await click(label('展开全部'));assert.ok(row('改了名称'));
 });
 await t.test('project markers can time directly; a parent with open descendants cannot be completed',async()=>{
  await context(row('另一事项'));await click(button('标记为项目'));assert.equal(service.snapshot().state.tasks.find(t=>t.id===other).isProject,true);
  await click(label('开始另一事项'));assert.equal(service.snapshot().timer.taskId,other);clock.advance(11000);
  await click(button('结束本次'));assert.equal(service.snapshot().timer,null);assert.equal(service.snapshot().state.sessions[0].durationMs,11000);
  await click(label('完成父事项'));assert.equal(service.snapshot().state.tasks.find(t=>t.id===parent).status,'open');
 });
 await t.test('empty-area menu and keyboard menu navigation; new items do not inherit active filter tags',async()=>{
  await click(query('.row-tag',row('另一事项')));await context(query('[role=tree]'));await key(query('[role=menu]'),'End');assert.match(document.activeElement.textContent,/撤销/);await key(query('[role=menu]'),'Home');assert.match(document.activeElement.textContent,/新增最外层事项/);
  await click(button('新增最外层事项'));await input(label('新事项名称'),'筛选中新建');await key(label('新事项名称'),'Enter');await key(label('新事项名称'),'Escape');
  const created=service.snapshot().state.tasks.find(t=>t.title==='筛选中新建');assert.equal(created.parentId,null);assert.deepEqual(created.tagIds,[]);assert.ok(row('筛选中新建'));assert.ok(document.querySelector('.retained-notice'));
  await click(row('另一事项'));assert.ok(!document.querySelector('[role=treeitem][aria-label="筛选中新建"]'));
 });
 await t.test('pointer drag moves a whole item without inheriting tags; undo keeps recorded effort',async()=>{
  await click(button('清除筛选'));const target=row('另一事项'),source=row('筛选中新建'),grip=label('拖动筛选中新建',source);
  document.elementFromPoint=()=>target;target.getBoundingClientRect=()=>({left:0,top:100,width:600,height:44,bottom:144,right:600,x:0,y:100,toJSON(){}});
  const pointer=(type,x,y)=>action(()=>{const event=new MouseEvent(type,{bubbles:true,cancelable:true,button:0,clientX:x,clientY:y});Object.defineProperty(event,'pointerId',{value:1});grip.dispatchEvent(event);});
  await pointer('pointerdown',20,20);await pointer('pointermove',200,122);await pointer('pointerup',200,122);
  let moved=service.snapshot().state.tasks.find(t=>t.title==='筛选中新建');assert.equal(moved.parentId,other);assert.deepEqual(moved.tagIds,[]);
  await click(label('撤销整理操作'));moved=service.snapshot().state.tasks.find(t=>t.title==='筛选中新建');assert.equal(moved.parentId,null);assert.equal(service.snapshot().state.sessions[0].durationMs,11000);
 });
 await t.test('tag manager merges names, confirms global deletion, and undo restores item and view references',async()=>{
  await click(row('另一事项'));await input(label('自定义标签'),'合并目标');await key(label('自定义标签'),'Enter');
  await click(button('管理标签'));await click(label('标签名称 自定义：自定义'));await input(label('标签名称 自定义'),'合并目标');await key(label('标签名称 自定义'),'Enter');
  assert.equal(service.snapshot().state.tags.length,1);assert.equal(service.snapshot().state.tasks.find(t=>t.id===other).tagIds.length,1);
  await click(button('删除'));assert.match(query('.tag-delete-confirm').textContent,/解除全部关联/);assert.equal(service.snapshot().state.tags.length,1);await click(button('确认删除标签'));assert.equal(service.snapshot().state.tags.length,0);
  await click(label('关闭'));await click(label('撤销整理操作'));assert.equal(service.snapshot().state.tags.length,1);assert.equal(service.snapshot().state.tasks.find(t=>t.id===other).tagIds.length,1);
 });
 await t.test('quick weekly view includes overdue; common/advanced switch is lossless; save, update, copy and rename work',async()=>{
  await click(button('清除筛选'));await input(label('筛选状态'),'open');await input(label('筛选截止时间'),'through-week');
  assert.ok(row('上周到期'));assert.ok(row('周日截止'));assert.ok(row('父事项'));assert.ok(!document.querySelector('[role=treeitem][aria-label="下周一截止"]'));assert.ok(!document.querySelector('[role=treeitem][aria-label="已经完成，已完成"]'));assert.match(query('.match-count').textContent,/匹配 2 个/);
  await click(button('保存视图'));await input(label('常用视图名称'),'本周需完成');await submit(label('常用视图名称').form);const weekly=service.snapshot().state.views.find(v=>v.name==='本周需完成'),original=structuredClone(weekly.filter);
  await click(button('高级条件'));assert.equal(label('条件 2 起点日期方式').value,'next-week');await click(button('常用筛选'));assert.equal(label('筛选截止时间').value,'through-week');assert.deepEqual(service.snapshot().state.views.find(v=>v.id===weekly.id).filter,original);
  await input(label('筛选截止时间'),'this-week');assert.ok(!document.querySelector('[role=treeitem][aria-label="上周到期"]'));assert.ok(button('更新当前视图'));assert.deepEqual(service.snapshot().state.views.find(v=>v.id===weekly.id).filter,original);
  // An unrelated service snapshot must not overwrite unsaved filter changes.
  await click(row('周日截止'));await input(label('自定义标签'),'视图草稿');await key(label('自定义标签'),'Enter');assert.equal(label('筛选截止时间').value,'this-week');
  await click(button('更新当前视图'));assert.equal(service.snapshot().state.views.find(v=>v.id===weekly.id).filter.rules.children.find(c=>c.field==='dueAt').value,'this-week');
  await input(label('筛选截止时间'),'through-week');await click(button('另存为新视图'));await input(label('常用视图名称'),'含逾期');await submit(label('常用视图名称').form);assert.equal(service.snapshot().state.views.find(v=>v.id===weekly.id).filter.rules.children.find(c=>c.field==='dueAt').value,'this-week');
  await click(button('管理当前视图'));await click(button('重命名视图'));await input(label('常用视图名称'),'本周全部待办');await submit(label('常用视图名称').form);assert.ok(service.snapshot().state.views.some(v=>v.name==='本周全部待办'));
  await click(button('清除筛选'));await input(label('常用视图'),service.snapshot().state.views.find(v=>v.name==='本周全部待办').id);assert.equal(label('筛选截止时间').value,'through-week');assert.equal(label('筛选状态').value,'open');
 });
 await t.test('advanced nested OR remains intact in common mode and reloading a saved view; deleting a view keeps tasks',async()=>{
  await click(button('清除筛选'));await click(label('显示已完成'));await click(button('高级条件'));await click(button('添加条件'));await click(button('添加条件组'));
  await input(label('条件 2.1 字段'),'dueAt');await input(label('条件 2.1 判断'),'before');await input(label('条件 2.1 起点日期方式'),'now');
  const nested=query('.condition-group .condition-group');await click(button('添加条件',nested));await input(label('条件 2.2 字段'),'tags');await input(label('条件 2.2 判断'),'any');await click(label('条件 2.2 标签 合并目标'));
  assert.ok(row('上周到期'));assert.ok(row('另一事项'));assert.ok(!document.querySelector('[role=treeitem][aria-label="周日截止"]'));assert.ok(!document.querySelector('[role=treeitem][aria-label="下周一截止"]'));
  await click(button('保存视图'));await input(label('常用视图名称'),'逾期或标签');await submit(label('常用视图名称').form);const saved=service.snapshot().state.views.find(v=>v.name==='逾期或标签'),rules=structuredClone(saved.filter.rules);
  await click(button('常用筛选'));assert.equal(query('.quick-fields').disabled,true);assert.ok(row('上周到期'));await click(button('清除筛选'));await input(label('常用视图'),saved.id);await click(button('高级条件'));assert.equal(label('条件组 2 组合').value,'any');assert.deepEqual(service.snapshot().state.views.find(v=>v.id===saved.id).filter.rules,rules);
  const count=service.snapshot().state.tasks.filter(t=>t.id!=='inbox').length;await click(button('管理当前视图'));await click(button('删除视图'));await click(button('移除视图'));assert.equal(service.snapshot().state.tasks.filter(t=>t.id!=='inbox').length,count);assert.ok(!service.snapshot().state.views.some(v=>v.id===saved.id));
  await click(button('清除筛选'));await click(button('常用筛选'));
 });
 await t.test('custom date ranges retain fixed dates; sorting stays within the hierarchy; invalid ranges show errors',async()=>{
  await input(label('筛选截止时间'),'range');await input(label('截止时间范围起点'),'2026-10-18');await input(label('截止时间范围终点'),'2026-10-25');await input(label('筛选状态'),'open');
  assert.ok(row('上周到期'));assert.ok(row('周日截止'));await input(label('视图排序'),'due');const rows=[...document.querySelectorAll('[role=treeitem]')].map(r=>r.getAttribute('aria-label'));assert.deepEqual(rows,['父事项','上周到期','周日截止']);
  await input(label('截止时间范围终点'),'2026-10-01');await click(button('保存视图'));await input(label('常用视图名称'),'无效范围');await submit(label('常用视图名称').form);assert.match(query('.filter-error').textContent,/条件无效/);assert.ok(!service.snapshot().state.views.some(v=>v.name==='无效范围'));await click(button('取消'));await click(button('清除筛选'));
 });
 await t.test('tag mode can be selected before choosing tags; renaming a saved view preserves unsaved conditions',async()=>{
  await input(label('标签匹配方式'),'any');const chooseTag=name=>[...document.querySelectorAll('.filter-tags .tag-options label')].find(l=>l.textContent===name).querySelector('input');await click(chooseTag('合并目标'));await click(chooseTag('视图草稿'));assert.ok(row('另一事项'));assert.ok(row('周日截止'));
  await click(button('保存视图'));await input(label('常用视图名称'),'任一标签');await submit(label('常用视图名称').form);const id=service.snapshot().state.views.find(v=>v.name==='任一标签').id;assert.equal(service.snapshot().state.views.find(v=>v.id===id).filter.rules.children.find(r=>r.field==='tags').op,'any');
  await input(label('筛选截止时间'),'through-week');await click(button('管理当前视图'));await click(button('重命名视图'));await input(label('常用视图名称'),'标签视图');await submit(label('常用视图名称').form);assert.equal(label('筛选截止时间').value,'through-week');assert.ok(button('更新当前视图'));assert.ok(!service.snapshot().state.views.find(v=>v.id===id).filter.rules.children.some(c=>c.field==='dueAt'));
  await click(button('另存为新视图'));await input(label('常用视图名称'),'标签与日期');await submit(label('常用视图名称').form);assert.ok(service.snapshot().state.views.find(v=>v.name==='标签与日期').filter.rules.children.some(c=>c.field==='dueAt'));
 });
 }finally{await action(()=>root.unmount());service.shutdown();dom.window.close();}
});
