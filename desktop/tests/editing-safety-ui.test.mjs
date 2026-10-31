import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';
import {appDom} from './app-dom.mjs';

function holdCommand(type){
 const real=window.journal.command;let calls=0,finish,fail;
 window.journal.command=command=>command.type===type?(calls++,new Promise((resolve,reject)=>{finish=()=>resolve(real(command));fail=reject;})):real(command);
 return {get calls(){return calls;},finish:()=>finish(),fail:message=>fail(Error(message)),restore:()=>{window.journal.command=real;}};
}

test('rapid capture protects the submitted title and corrected preview until a pending save succeeds',async()=>{
 const h=await appDom();try{
  await h.mount();const input=h.label('快速添加事项名称');await h.input(input,'提交的事项 明天截止');await h.click(h.button('修改预览'));
  const savedTitle=h.query('.capture-editor input');await h.input(savedTitle,'修正后的名称');const gate=holdCommand('capture.create');
  await h.key(input,'Enter');assert.equal(input.readOnly,true);assert.equal(h.query('.capture-preview').disabled,true);assert.equal(h.label('快速添加事项').getAttribute('aria-busy'),'true');assert.match(h.query('.capture-toolbar [role=status]').textContent,/正在保存/);
  await h.input(input,'等待时不应接受的新文字');await h.key(input,'Enter');await h.action(()=>input.form.requestSubmit());assert.equal(input.value,'提交的事项 明天截止');assert.equal(gate.calls,1);
  await h.action(gate.finish);assert.equal(h.service.snapshot().state.tasks.at(-1).title,'修正后的名称');assert.equal(input.value,'');assert.equal(input.readOnly,false);assert.equal(document.activeElement,input);
  gate.restore();await h.input(input,'下一条记录');await h.key(input,'Enter');assert.equal(h.service.snapshot().state.tasks.at(-1).title,'下一条记录');
 }finally{await h.close();}
});

test('failed rapid capture keeps text and semantic corrections and permits a single retry',async()=>{
 const h=await appDom();try{
  await h.mount();const input=h.label('快速添加事项名称');await h.input(input,'待保存的资料 %参考');await h.click(h.button('修改预览'));await h.input(h.query('.capture-editor input'),'保留的预览修正');
  const gate=holdCommand('capture.create');await h.key(input,'Enter');await h.action(()=>gate.fail('无法写入，请重试'));
  assert.equal(input.readOnly,false);assert.equal(input.value,'待保存的资料 %参考');assert.equal(h.query('.capture-editor input').value,'保留的预览修正');assert.match(h.query('.semantic-capture [role=alert]').textContent,/无法写入/);assert.equal(document.activeElement,input);
  gate.restore();await h.key(input,'Enter');assert.equal(h.service.snapshot().state.tasks.at(-1).title,'保留的预览修正');assert.equal(h.service.snapshot().state.tasks.length,2);
 }finally{await h.close();}
});

test('unavailable local draft storage never turns a committed capture into a save failure or duplicate',async()=>{
 const h=await appDom();const storage=window.Storage.prototype,remove=storage.removeItem,set=storage.setItem;
 try{
  await h.mount();const input=h.label('快速添加事项名称');await h.input(input,'数据库已经保存的事项');let calls=0;const real=window.journal.command;window.journal.command=command=>{if(command.type==='capture.create')calls++;return real(command);};
  storage.removeItem=()=>{throw Error('草稿缓存不可删除');};storage.setItem=()=>{throw Error('草稿缓存不可写入');};
  await h.key(input,'Enter');assert.equal(calls,1);assert.equal(h.service.snapshot().state.tasks.at(-1).title,'数据库已经保存的事项');assert.equal(input.value,'');assert.equal(input.readOnly,false);assert.equal(document.querySelector('.semantic-capture [role=alert]'),null);assert.match(h.query('.toast').textContent,/记录已保存/);
  await h.key(input,'Enter');assert.equal(calls,1);assert.equal(h.service.snapshot().state.tasks.filter(item=>item.title==='数据库已经保存的事项').length,1);
 }finally{storage.removeItem=remove;storage.setItem=set;await h.close();}
});

test('inline edits block late typing, Escape and duplicate writes; failure leaves an editable draft',async()=>{
 const h=await appDom();try{
  const id=h.add('原始名称');await h.mount();await h.click(h.label('事项'));const row=h.query(`[data-outline-id="${id}"]`);await h.key(row,'F2');const input=h.label('名称 原始名称');await h.input(input,'提交的改名');
  const gate=holdCommand('outline.patch');await h.key(input,'Enter');assert.equal(input.readOnly,true);assert.match(h.query('.inline-editor [role=status]').textContent,/正在保存/);
  await h.input(input,'不应被接受的改名');await h.key(input,'Escape');await h.key(input,'Enter');assert.equal(h.label('名称 原始名称').value,'提交的改名');assert.equal(gate.calls,1);
  await h.action(()=>gate.fail('名称保存失败'));assert.equal(input.readOnly,false);assert.match(h.query('.inline-editor [role=alert]').textContent,/名称保存失败/);assert.equal(document.activeElement,input);assert.equal(h.get(id).title,'原始名称');
  gate.restore();await h.key(input,'Enter');assert.equal(h.get(id).title,'提交的改名');assert.equal(row.querySelector('.inline-editor'),null);
  await h.click(h.label('事项说明：未填写'));assert.match(h.query('.task-inspector .inline-edit-help').textContent,/Ctrl\+Enter 保存/);await h.key(h.label('事项说明'),'Escape');
 }finally{await h.close();}
});

test('outline creation preserves the intended parent while pending and advertised row shortcuts work',async()=>{
 const h=await appDom();try{
  const a=h.add('第一项'),b=h.add('第二项');await h.mount();await h.click(h.label('事项'));const row=id=>h.query(`[data-outline-id="${id}"]`);
  assert.match(h.label('拖动第二项').title,/Tab 缩进、Shift\+Tab/);assert.doesNotMatch(h.label('拖动第二项').title,/Alt/);
  await h.input(h.label('视图排序'),'manual');await h.key(row(b),'Tab');assert.equal(h.get(b).parentId,a);await h.key(row(b),'Tab',{shiftKey:true});assert.equal(h.get(b).parentId,'inbox');
  await h.key(row(b),'Insert',{ctrlKey:true});const input=h.label('新事项名称');await h.input(input,'保留父级的新事项');const gate=holdCommand('capture.create');await h.action(()=>input.form.requestSubmit());
  assert.equal(input.readOnly,true);assert.equal(h.query('.inline-creator').getAttribute('aria-busy'),'true');assert.equal(h.button('取消',h.query('.inline-creator')).disabled,true);
  await h.input(input,'不应替换');await h.key(input,'Escape');await h.key(input,'Tab',{shiftKey:true});await h.key(input,'Enter',{ctrlKey:true});await h.action(()=>window.dispatchEvent(new Event('journal:new-item')));assert.equal(h.label('新事项名称').value,'保留父级的新事项');assert.equal(gate.calls,1);
  await h.action(()=>gate.fail('创建失败'));assert.equal(input.readOnly,false);assert.equal(input.value,'保留父级的新事项');assert.match(h.query('.inline-creator [role=alert]').textContent,/创建失败/);assert.equal(document.activeElement,input);
  gate.restore();await h.key(input,'Enter',{ctrlKey:true});const created=h.service.snapshot().state.tasks.at(-1);assert.equal(created.parentId,b);assert.equal(created.title,'保留父级的新事项');assert.equal(document.querySelector('.inline-creator'),null);
 }finally{await h.close();}
});

test('capture window refresh preserves preview focus and pending save blocks closing without losing failures',async()=>{
 const h=await appDom();let panelRoot;try{
  let changed=()=>{},closes=0;window.journal.onChanged=callback=>{changed=callback;return()=>{changed=()=>{};};};window.journal.capture={close:async()=>{closes++;}};
  const folder=path.resolve('qa-evidence/editing-safety');mkdirSync(folder,{recursive:true});const file=path.join(folder,`capture-panel-${process.pid}.mjs`);
  await build({entryPoints:['src/CapturePanel.tsx'],outfile:file,bundle:true,platform:'node',format:'esm',packages:'external',jsx:'automatic',loader:{'.css':'empty'},logLevel:'silent'});
  const {default:CapturePanel}=await import(pathToFileURL(file).href),{default:React}=await import('react'),{createRoot}=await import('react-dom/client');const host=document.createElement('div');document.body.append(host);panelRoot=createRoot(host);await h.action(()=>panelRoot.render(React.createElement(CapturePanel)));
  const input=h.label('快速添加事项名称');await h.input(input,'保留全局草稿');await h.click(h.button('修改预览'));const title=h.query('.capture-editor input');await h.input(title,'保持正在修改的名称');await h.action(()=>{title.focus();title.setSelectionRange(2,5);});
  await h.action(()=>changed());assert.equal(document.activeElement,title);assert.equal(title.selectionStart,2);assert.equal(title.selectionEnd,5);assert.equal(title.value,'保持正在修改的名称');
  const gate=holdCommand('capture.create');await h.action(()=>input.form.requestSubmit());assert.equal(h.label('关闭快速记录并保留草稿').disabled,true);await h.key(input,'Escape');await h.click(h.label('关闭快速记录并保留草稿'));assert.equal(closes,0);
  await h.action(()=>gate.fail('全局保存失败'));assert.equal(h.label('关闭快速记录并保留草稿').disabled,false);assert.match(h.query('[role=alert]').textContent,/全局保存失败/);assert.equal(input.value,'保留全局草稿');assert.equal(title.value,'保持正在修改的名称');const saved=JSON.parse(window.localStorage.getItem('journal.capture.draft'));assert.equal(saved.raw,'保留全局草稿');assert.equal(saved.overrides.title,'保持正在修改的名称');
  gate.restore();await h.key(input,'Enter');assert.equal(closes,1);assert.equal(h.service.snapshot().state.tasks.at(-1).title,'保持正在修改的名称');assert.equal(input.value,'');
 }finally{if(panelRoot)await h.action(()=>panelRoot.unmount());await h.close();}
});

for(const flow of ['task','review','view'])test(`${flow} dialog locks pending drafts and closing, then preserves a failed write for retry`,async()=>{
 const h=await appDom();try{
  const id=h.add('需要保留记录的事项');await h.mount();let input,command;
  if(flow==='task'){
   await h.key(window,'n',{ctrlKey:true});input=h.query('dialog input[maxlength="120"]');command='capture.create';
  }else{
   await h.click(h.label('事项'));
   if(flow==='review'){await h.click(h.query(`[data-outline-id="${id}"]`));await h.click(h.button('复盘',h.query('.task-inspector')));await h.click(h.button('记录复盘与调整'));input=h.query('dialog textarea');command='review.save';}
   else{await h.click(h.label('视图选项'));assert.equal(h.query('.filter-controls .action-popover-panel').hidden,false);await h.click(h.button('保存视图'));input=h.label('常用视图名称');command='view.save';}
  }
  const draft=`${flow} 等待保存的内容`;await h.input(input,draft);const before=h.service.exportJson(),gate=holdCommand(command),form=input.form;
  await h.action(()=>form.requestSubmit());assert.equal(h.query('dialog').getAttribute('aria-busy'),'true');assert.equal(h.query('dialog fieldset.dialog-fields').disabled,true);assert.equal(input.matches(':disabled'),true);
  await h.action(()=>h.query('dialog').dispatchEvent(new Event('cancel',{cancelable:true})));await h.click(h.label('关闭',h.query('dialog')));await h.action(()=>form.requestSubmit());assert.equal(gate.calls,1);assert.ok(h.query('dialog'));assert.equal(input.value,draft);
  await h.action(()=>gate.fail('存储暂不可用'));assert.match(h.query('dialog [role=alert]').textContent,/存储暂不可用/);assert.equal(h.query('dialog').getAttribute('aria-busy'),'false');assert.equal(input.matches(':disabled'),false);assert.equal(input.value,draft);assert.equal(h.service.exportJson(),before);
  gate.restore();await h.action(()=>form.requestSubmit());assert.equal(document.querySelector('dialog'),null);const state=h.service.snapshot().state;
  if(flow==='task')assert.equal(state.tasks.at(-1).title,draft);
  else if(flow==='review')assert.equal(state.reviews.find(record=>record.taskId===id).outcome,draft);
  else assert.equal(state.views.at(-1).name,draft);
 }finally{await h.close();}
});
