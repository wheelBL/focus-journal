import {test} from 'node:test';
import assert from 'node:assert/strict';
import {appDom} from './app-dom.mjs';

test('rename source survives blur, inspector and row actions, search never records content, and active navigation is a no-op',async()=>{
 const records=[],h=await appDom({usage:{record:async value=>records.push(value)}});h.service.setOperationRecorder((operation,entry,result)=>records.push({operation,entry,result}));
 try{const id=h.add('测试事项',null);records.length=0;await h.mount();await h.click(h.label('任务'));const row=()=>h.query(`[data-outline-id="${id}"]`);await h.click(row());
  await h.key(row(),'F2');await h.input(h.label('名称 测试事项'),'改名完成');await h.action(()=>h.label('搜索任务和笔记').focus());assert.ok(records.some(r=>r.operation==='item.rename'&&r.entry==='items.keyboard.rename'&&r.result==='success'));
  await h.context(row());await h.click(h.button('重命名 F2',h.query('[role=menu]')));await h.input(h.label('名称 改名完成'),'右键改名');await h.key(h.label('名称 改名完成'),'Enter');assert.ok(records.some(r=>r.operation==='item.rename'&&r.entry==='items.context.rename'));
  await h.key(row(),'F2');await h.input(h.label('名称 右键改名'),'取消的私人草稿');await h.key(h.label('名称 右键改名'),'Escape');assert.ok(records.some(r=>r.operation==='item.rename'&&r.entry==='items.keyboard.rename'&&r.result==='cancelled'));assert.equal(h.get(id).title,'右键改名');
  await h.click(h.label('详情截止时间：未设置'));await h.input(h.label('详情截止时间'),'2026-12-20');await h.click(h.button('保存截止',h.label('详情截止时间编辑')));assert.ok(records.some(r=>r.operation==='item.deadline.set'&&r.entry==='items.inspector'));
  const navBefore=records.filter(r=>r.operation==='navigation.projects').length;await h.click(h.label('任务'));assert.equal(records.filter(r=>r.operation==='navigation.projects').length,navBefore);
  const prior=records.filter(r=>r.operation==='search.open').length;await h.key(document.body,'f',{ctrlKey:true,code:'KeyF'});assert.equal(records.filter(r=>r.operation==='search.open').length,prior+1);assert.equal(records.at(-1).entry,'search.current.shortcut');await h.input(h.label('在事项树中搜索'),'私密查询文字');assert.equal(records.filter(r=>r.operation==='search.open').length,prior+1);assert.equal(JSON.stringify(records).includes('私密查询文字'),false);
  await h.input(h.label('在事项树中搜索'),'');await h.click(h.label('开始右键改名'));assert.ok(records.some(r=>r.operation==='focus.start'&&r.entry==='items.row.timer'));
 }finally{await h.close();}
});

test('only committed shortcut changes are counted, including clear and reset',async()=>{
 const records=[],h=await appDom({usage:{record:async value=>records.push(value)}});try{await h.mount();await h.click(h.label('设置'));await h.click(h.button('快捷键',h.label('设置分区')));records.length=0;
  await h.click(h.label('清除查看快捷键快捷键'));assert.equal(records.length,0);await h.click(h.button('保存快捷键设置'));assert.deepEqual(records.map(r=>r.operation),['settings.shortcuts.clear']);
  await h.click(h.button('恢复全部默认'));assert.equal(records.length,1);await h.click(h.button('保存快捷键设置'));assert.deepEqual(records.map(r=>r.operation),['settings.shortcuts.clear','settings.shortcuts.reset']);
 }finally{await h.close();}
});



test('summary displays bounded failure labels and only exact release route information',async()=>{
 const value={enabled:true,error:null,ai:[],operations:[
  {id:'one',at:'2026-10-31T00:00:00Z',operation:'item.rename',entry:'items.keyboard.rename',result:'failed.validation',version:'0.35.0'},
  {id:'two',at:'2026-10-31T00:00:00Z',operation:'item.rename',entry:'workspace',result:'failed',version:'0.34.0'}
 ]};const h=await appDom({usage:{snapshot:async()=>value,record:async()=>{},configure:async()=>value,clear:async()=>value,export:async()=>null}});
 try{await h.mount();await h.click(h.label('回顾'));await h.click(h.button('活动记录',h.query('[aria-label="回顾方式侧栏"]')));await h.input(h.label('记录类型'),'operations');const page=h.query('.activity-page').textContent;assert.match(page,/失败（未分类）/);assert.match(page,/修改名称 · 未分类 · 0\.34\.0/);assert.match(page,/修改名称 · 事项行快捷改名 · 0\.35\.0/);assert.match(page,/失败（校验）/);assert.match(page,/设计最少 2 步/);assert.match(page,/设计路线未知/);assert.match(page,/不是实际点击次数或耗时/);}finally{await h.close();}
});

test('search records pointer or Tab intent once, ignores focus restoration and key repeats',async()=>{
 const records=[],h=await appDom({usage:{record:async value=>records.push(value)}});try{
  h.add('搜索目标');await h.mount();await h.click(h.label('任务'));const global=h.label('搜索任务和笔记'),local=h.label('在事项树中搜索');records.length=0;
  await h.action(()=>global.focus());assert.equal(records.filter(r=>r.operation==='search.open').length,0);
  await h.action(()=>{global.blur();global.dispatchEvent(new MouseEvent('pointerdown',{bubbles:true}));global.focus();});assert.deepEqual(records.filter(r=>r.operation==='search.open').map(r=>r.entry),['search.global.focus']);
  await h.action(()=>{global.dispatchEvent(new KeyboardEvent('keydown',{key:'Tab',bubbles:true}));local.focus();});assert.deepEqual(records.filter(r=>r.operation==='search.open').map(r=>r.entry),['search.global.focus','search.current.focus']);
  await h.key(local,'f',{ctrlKey:true,code:'KeyF'});await h.key(local,'f',{ctrlKey:true,code:'KeyF',repeat:true});assert.deepEqual(records.filter(r=>r.operation==='search.open').map(r=>r.entry),['search.global.focus','search.current.focus','search.current.shortcut']);
  await h.action(()=>{local.blur();global.focus();});assert.equal(records.filter(r=>r.operation==='search.open').length,3);
 }finally{await h.close();}
});

test('only explicit cancellation of nonempty creation drafts is recorded; navigation retains draft',async()=>{
 const records=[],h=await appDom({usage:{record:async value=>records.push(value)}});h.service.setOperationRecorder((operation,entry,result)=>records.push({operation,entry,result}));
 try{const id=h.add('原始事项',null);await h.mount();await h.click(h.label('任务'));const row=h.query(`[data-outline-id="${id}"]`);await h.click(row);
  await h.key(row,'Insert');await h.key(h.label('新事项名称'),'Escape');assert.equal(records.filter(r=>r.operation==='capture.create'&&r.result==='cancelled').length,0);
  await h.key(row,'Insert');await h.input(h.label('新事项名称'),'暂存私人内容');await h.click(h.label('日历'));assert.equal(records.filter(r=>r.operation==='capture.create'&&r.result==='cancelled').length,0);
  await h.click(h.label('任务'));assert.equal(h.label('新事项名称').value,'暂存私人内容');await h.key(h.label('新事项名称'),'Escape');let cancelled=records.filter(r=>r.operation==='capture.create'&&r.result==='cancelled');assert.equal(cancelled.length,1);assert.equal(JSON.stringify(cancelled).includes('私人内容'),false);
  await h.key(h.query(`[data-outline-id="${id}"]`),'Insert');await h.input(h.label('新事项名称'),'保存事项');await h.key(h.label('新事项名称'),'Enter',{ctrlKey:true});assert.equal(records.filter(r=>r.operation==='capture.create'&&r.result==='cancelled').length,1);assert.equal(records.filter(r=>r.operation==='capture.create'&&r.result==='success').length,1);
 }finally{await h.close();}
});

test('deadline only logs changed explicit cancellation, never save or outside dismissal',async()=>{
 const records=[],h=await appDom({usage:{record:async value=>records.push(value)}});h.service.setOperationRecorder((operation,entry,result)=>records.push({operation,entry,result}));
 try{const id=h.add('截止测试',null);await h.mount();await h.click(h.label('任务'));await h.click(h.query(`[data-outline-id="${id}"]`));const open=()=>h.click(h.label('详情截止时间：未设置'));
  await open();await h.click(h.button('取消',h.label('详情截止时间编辑')));assert.equal(records.filter(r=>r.operation.startsWith('item.deadline')&&r.result==='cancelled').length,0);
  await open();await h.input(h.label('详情截止时间'),'2026-12-20');await h.key(h.label('详情截止时间'),'Escape');let cancelled=records.filter(r=>r.operation.startsWith('item.deadline')&&r.result==='cancelled');assert.deepEqual(cancelled.map(r=>[r.operation,r.entry]),[['item.deadline.set','items.inspector']]);
  await open();await h.input(h.label('详情截止时间'),'2026-12-20');await h.action(()=>document.body.dispatchEvent(new MouseEvent('pointerdown',{bubbles:true})));assert.equal(records.filter(r=>r.operation.startsWith('item.deadline')&&r.result==='cancelled').length,1);
  await open();await h.input(h.label('详情截止时间'),'2026-12-20');await h.click(h.button('保存截止',h.label('详情截止时间编辑')));assert.equal(records.filter(r=>r.operation==='item.deadline.set'&&r.result==='success').length,1);assert.equal(records.filter(r=>r.operation.startsWith('item.deadline')&&r.result==='cancelled').length,1);
  await h.click(h.query('.task-inspector .inspector-properties .editable-value[aria-label^="详情截止时间"]'));await h.click(h.button('清除',h.label('详情截止时间编辑')));await h.click(h.button('取消',h.label('详情截止时间编辑')));cancelled=records.filter(r=>r.operation.startsWith('item.deadline')&&r.result==='cancelled');assert.deepEqual(cancelled.map(r=>r.operation),['item.deadline.set','item.deadline.clear']);
 }finally{await h.close();}
});

test('direct navigation and toolbar creation carry their explicit origins without relying on focused element',async()=>{
 const records=[],h=await appDom({usage:{record:async value=>records.push(value)}});h.service.setOperationRecorder((operation,entry,result)=>records.push({operation,entry,result}));
 try{await h.mount();await h.click(h.label('任务'));assert.ok(records.some(r=>r.operation==='navigation.projects'&&r.entry==='navigation.primary'));await h.click(h.button('新增事项',h.query('.tree-page-header')));await h.input(h.label('新事项名称'),'合成事项');await h.key(h.label('新事项名称'),'Enter',{ctrlKey:true});assert.ok(records.some(r=>r.operation==='capture.create'&&r.entry==='items.toolbar'&&r.result==='success'));await h.click(h.label('设置'));assert.ok(records.some(r=>r.operation==='navigation.settings'&&r.entry==='navigation.sidebar'));}finally{await h.close();}
});
