import {test} from 'node:test';
import assert from 'node:assert/strict';
import {appDom} from './app-dom.mjs';
import {emptyFilter} from '../core/filters.ts';

const row=(h,id)=>h.query(`[data-outline-id="${id}"]`);
const creationKey=()=>Object.keys(window.localStorage).find(key=>key.startsWith('journal.creation.'));
async function viewAction(h,name){await h.click(h.label('视图选项'));const panel=h.query('.filter-controls .action-popover-panel');assert.equal(panel.hidden,false);await h.click(h.button(name,panel));}
function gateCommand(type){const original=window.journal.command;let resolve,reject,calls=0;window.journal.command=command=>command.type===type?(calls++,new Promise((yes,no)=>{resolve=()=>yes(original(command));reject=message=>no(Error(message));})):original(command);return {get calls(){return calls;},resolve:()=>resolve(),reject:message=>reject(message),restore:()=>{window.journal.command=original;}};}

test('outline draft retains destination, corrected preview and date anchor across repeated creation and page changes',async()=>{
 const h=await appDom();try{
  const parent=h.add('原归属'),other=h.add('另一归属');await h.mount();await h.click(h.label('事项'));await h.key(row(h,parent),'Insert',{ctrlKey:true});
  await h.input(h.label('新事项名称'),'需要保留 明天截止 %资料');await h.click(h.button('修改预览'));await h.input(h.query('.inline-creator .capture-editor input'),'修正的保存名称');
  const before=JSON.parse(window.localStorage.getItem(creationKey()));assert.equal(before.creator.parentId,parent);
  await h.click(row(h,other));await h.click(h.button('新增事项'));assert.equal(h.label('新事项名称').value,'需要保留 明天截止 %资料');assert.equal(JSON.parse(window.localStorage.getItem(creationKey())).creator.parentId,parent);
  await h.click(h.label('今日'));h.clock.advance(86400000);await h.click(h.label('事项'));assert.equal(h.label('新事项名称').value,'需要保留 明天截止 %资料');await h.click(h.button('修改预览'));assert.equal(h.query('.inline-creator .capture-editor input').value,'修正的保存名称');
  await h.click(h.button('保存并结束'));const created=h.service.snapshot().state.tasks.at(-1);assert.equal(created.parentId,parent);assert.equal(created.title,'修正的保存名称');assert.equal(created.dueAt,'2026-10-20');assert.equal(document.querySelector('.inline-creator'),null);
  await h.click(h.label('今日'));await h.click(h.label('事项'));assert.equal(document.querySelector('.inline-creator'),null);assert.equal(JSON.parse(window.localStorage.getItem(creationKey())),null);
 }finally{await h.close();}
});

test('save-and-continue keeps sibling placement while Cancel explicitly discards the remaining draft',async()=>{
 const h=await appDom();try{
  const parent=h.add('要连续添加的分支');await h.mount();await h.click(h.label('事项'));await h.key(row(h,parent),'Insert',{ctrlKey:true});await h.input(h.label('新事项名称'),'第一条');await h.click(h.button('保存并继续'));
  const first=h.service.snapshot().state.tasks.at(-1);assert.equal(first.parentId,parent);assert.equal(h.label('新事项名称').value,'');assert.ok(document.activeElement===h.label('新事项名称'),'focus should stay in the inline creator');
  await h.input(h.label('新事项名称'),'第二条');await h.key(h.label('新事项名称'),'Enter',{ctrlKey:true});assert.equal(h.service.snapshot().state.tasks.at(-1).parentId,parent);assert.equal(document.querySelector('.inline-creator'),null);
  await h.click(h.button('新增事项'));await h.input(h.label('新事项名称'),'明确放弃');await h.click(h.button('取消',h.query('.inline-creator')));await h.click(h.label('今日'));await h.click(h.label('事项'));assert.equal(document.querySelector('.inline-creator'),null);assert.ok(!h.service.snapshot().state.tasks.some(t=>t.title==='明确放弃'));
  await h.click(h.button('新增事项'));await h.click(h.button('关闭',h.query('.inline-creator')));assert.equal(document.querySelector('.inline-creator'),null);
 }finally{await h.close();}
});

test('a late successful creation consumes only its submitted draft after leaving and returning',async()=>{
 const h=await appDom();try{
  await h.mount();await h.click(h.label('事项'));await h.click(h.button('新增事项'));await h.input(h.label('新事项名称'),'等待中的记录');const gate=gateCommand('capture.create');await h.click(h.button('保存并结束'));assert.equal(gate.calls,1);
  await h.click(h.label('今日'));await h.click(h.label('事项'));assert.equal(h.label('新事项名称').value,'等待中的记录');const search=h.label('在事项树中搜索');await h.action(()=>search.focus());await h.action(gate.resolve);
  assert.ok(document.activeElement===search,'late save must preserve search focus');assert.equal(document.querySelector('.inline-creator'),null);assert.equal(h.service.snapshot().state.tasks.filter(t=>t.title==='等待中的记录').length,1);
  gate.restore();await h.click(h.button('新增事项'));await h.input(h.label('新事项名称'),'第二次提交');const next=gateCommand('capture.create');await h.click(h.button('保存并结束'));await h.click(h.label('今日'));await h.click(h.label('事项'));await h.input(h.label('新事项名称'),'更晚的新草稿');await h.action(next.resolve);
  assert.equal(h.label('新事项名称').value,'更晚的新草稿');assert.equal(JSON.parse(JSON.parse(window.localStorage.getItem(creationKey())).capture).raw,'更晚的新草稿');next.restore();
 }finally{await h.close();}
});

test('stale draft destination falls back without losing text, and unavailable cache does not fail a committed save',async()=>{
 const h=await appDom();const storage=window.Storage.prototype,set=storage.setItem;try{
  const parent=h.add('将被删除的归属');await h.mount();await h.click(h.label('事项'));await h.key(row(h,parent),'Insert',{ctrlKey:true});await h.input(h.label('新事项名称'),'保留的草稿');await h.click(h.label('今日'));
  await h.command({type:'item.change',payload:{id:parent,action:'delete',confirmBranch:true}});await h.click(h.label('事项'));assert.equal(h.label('新事项名称').value,'保留的草稿');assert.notEqual(JSON.parse(window.localStorage.getItem(creationKey())).creator.parentId,parent);
  storage.setItem=()=>{throw Error('缓存不可写');};await h.click(h.button('保存并结束'));assert.equal(document.querySelector('.inline-creator'),null);assert.equal(h.service.snapshot().state.tasks.filter(t=>t.title==='保留的草稿').length,1);
 }finally{storage.setItem=set;await h.close();}
});

test('multi-selection Delete and Space open the requested action without silently mutating items',async()=>{
 const h=await appDom();try{
  const a=h.add('批量一'),b=h.add('批量二');await h.mount();await h.click(h.label('事项'));await h.click(row(h,a));await h.key(row(h,b),' ',{ctrlKey:true});const before=h.service.exportJson();
  await h.key(row(h,b),'Delete');assert.equal(h.label('批量操作').value,'delete');assert.equal(h.service.exportJson(),before);await h.click(h.button('返回',h.query('dialog')));
  await h.key(row(h,b),' ');assert.equal(h.label('批量操作').value,'done');await h.click(h.button('确认完成'));assert.equal(h.get(a).status,'done');assert.equal(h.get(b).status,'done');
  await h.click(h.button('已完成',h.query('[aria-label="事项视图"]')));await h.click(row(h,a));await h.key(row(h,b),' ',{ctrlKey:true});await h.key(row(h,b),' ');assert.equal(h.label('批量操作').value,'open');await h.click(h.button('返回',h.query('dialog')));assert.equal(h.get(a).status,'done');
 }finally{await h.close();}
});

test('context action returns row focus for keyboard continuation and never steals a newer focus after saving',async()=>{
 const h=await appDom();try{
  const a=h.add('菜单第一项'),b=h.add('菜单第二项');await h.mount();await h.click(h.label('事项'));await h.context(row(h,a));await h.click(h.button('标记为项目'));assert.equal(document.activeElement,row(h,a));await h.key(document.activeElement,'ArrowDown');assert.equal(document.activeElement,row(h,b));
  await h.context(row(h,a));const gate=gateCommand('outline.patch');await h.click(h.button('取消项目标记'));const search=h.label('在事项树中搜索');await h.action(()=>search.focus());await h.action(gate.resolve);assert.equal(document.activeElement,search);gate.restore();
  await h.context(row(h,a));await h.click(h.button('完成事项',h.query('[role=menu]')));assert.equal(document.querySelector(`[data-outline-id="${a}"]`),null);assert.ok(document.activeElement.matches('[data-outline-id]'));await h.key(document.activeElement,'ArrowDown');assert.ok(document.activeElement.matches('[data-outline-id]'));
 }finally{await h.close();}
});

test('view options expose named display and view actions directly; failed removal stays local and retry preserves items',async()=>{
 const h=await appDom();try{
  h.add('删除视图不删除事项');await h.mount();await h.command({type:'view.save',payload:{name:'我的视图',filter:emptyFilter()}});await h.click(h.label('事项'));await h.click(h.button('我的视图',h.query('[aria-label="事项视图"]')));await h.click(h.label('视图选项'));
  const panel=h.query('.filter-controls .action-popover-panel');assert.equal(panel.hidden,false);for(const name of ['展开全部','折叠全部','重命名视图','复制视图','删除视图'])assert.ok(h.button(name,panel));assert.ok(!panel.textContent.includes('管理当前视图'));
  await h.click(h.button('复制视图',panel));assert.equal(h.label('常用视图名称').value,'我的视图 副本');await h.click(h.button('取消',h.query('dialog')));
  await viewAction(h,'删除视图');const before=h.service.snapshot().state.tasks;const gate=gateCommand('view.delete');await h.click(h.button('移除视图'));assert.equal(h.query('dialog').getAttribute('aria-busy'),'true');await h.click(h.label('关闭',h.query('dialog')));assert.equal(gate.calls,1);await h.action(()=>gate.reject('删除暂不可用'));assert.match(h.query('dialog [role=alert]').textContent,/删除暂不可用/);assert.equal(h.service.snapshot().state.views.length,1);gate.restore();await h.click(h.button('移除视图'));assert.equal(document.querySelector('dialog'),null);assert.equal(h.service.snapshot().state.views.length,0);assert.deepEqual(h.service.snapshot().state.tasks,before);
 }finally{await h.close();}
});

test('hidden outline ignores global creation requests and retains its existing draft',async()=>{
 const h=await appDom();try{
  await h.mount();await h.click(h.label('事项'));const page=h.query('.tree-page');await h.action(()=>{page.hidden=true;page.setAttribute('inert','');window.dispatchEvent(new Event('journal:new-item'));});assert.equal(document.querySelector('.inline-creator'),null);
  await h.action(()=>{page.hidden=false;page.removeAttribute('inert');});await h.click(h.button('新增事项'));await h.input(h.label('新事项名称'),'搜索前草稿');await h.action(()=>{page.hidden=true;page.setAttribute('inert','');window.dispatchEvent(new Event('journal:new-item'));});assert.equal(h.label('新事项名称').value,'搜索前草稿');
 }finally{await h.close();}
});
