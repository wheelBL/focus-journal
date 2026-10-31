import {test} from 'node:test';
import assert from 'node:assert/strict';
import {appDom} from './app-dom.mjs';

function holdPatch(){
 const real=window.journal.command;let finish,fail,calls=0;
 window.journal.command=command=>command.type==='outline.patch'?(calls++,new Promise((resolve,reject)=>{finish=()=>resolve(real(command));fail=reject;})):real(command);
 return {get calls(){return calls;},finish:()=>finish(),fail:()=>fail(Error('暂时无法保存')),restore:()=>{window.journal.command=real;}};
}

test('inline rename returns keyboard focus to the tree for the next action after save, cancel and unchanged Enter',async()=>{
 const h=await appDom();try{
  const first=h.add('第一项'),second=h.add('第二项');await h.mount();await h.click(h.label('事项'));await h.input(h.label('视图排序'),'manual');
  const row=id=>h.query(`[data-outline-id="${id}"]`);
  await h.click(row(first));await h.action(()=>row(first).focus());await h.key(document.activeElement,'F2');await h.input(document.activeElement,'第一项已改名');await h.key(document.activeElement,'Enter');
  assert.equal(document.activeElement,row(first));assert.equal(h.get(first).title,'第一项已改名');
  await h.key(document.activeElement,'ArrowDown');assert.equal(document.activeElement,row(second));assert.equal(row(second).getAttribute('aria-selected'),'true');
  await h.key(document.activeElement,'F2');await h.input(document.activeElement,'不保存的名称');await h.key(document.activeElement,'Escape');
  assert.equal(document.activeElement,row(second));assert.equal(h.get(second).title,'第二项');
  await h.key(document.activeElement,'F2');await h.key(document.activeElement,'Enter');assert.equal(document.activeElement,row(second));
  await h.key(document.activeElement,'ArrowUp');assert.equal(document.activeElement,row(first));
 }finally{await h.close();}
});

test('inspector inline fields return to their own trigger and preserve multiline and IME input',async()=>{
 const h=await appDom();try{
  const id=h.add('说明事项');await h.mount();await h.click(h.label('事项'));await h.click(h.query(`[data-outline-id="${id}"]`));
  await h.click(h.label('事项说明：未填写'));await h.input(document.activeElement,'第一行\n第二行');
  await h.key(document.activeElement,'Enter',{ctrlKey:true,isComposing:true});assert.ok(document.activeElement.matches('textarea'));assert.equal(h.get(id).description,'');
  await h.key(document.activeElement,'Enter',{ctrlKey:true});assert.equal(document.activeElement.getAttribute('aria-label'),'事项说明：第一行\n第二行');assert.equal(h.get(id).description,'第一行\n第二行');
  await h.click(document.activeElement);await h.input(document.activeElement,'取消说明');await h.key(document.activeElement,'Escape');assert.equal(document.activeElement.getAttribute('aria-label'),'事项说明：第一行\n第二行');assert.equal(h.get(id).description,'第一行\n第二行');
 }finally{await h.close();}
});

for(const outcome of ['success','failure'])test(`delayed inline ${outcome} preserves focus moved to another field`,async()=>{
 const h=await appDom();let gate;try{
  const id=h.add('保存中的事项');await h.mount();await h.click(h.label('事项'));const row=h.query(`[data-outline-id="${id}"]`);
  await h.click(row);await h.action(()=>row.focus());await h.key(document.activeElement,'F2');await h.input(document.activeElement,'提交名称');gate=holdPatch();
  await h.key(document.activeElement,'Enter');const search=h.label('在事项树中搜索');await h.action(()=>search.focus());assert.equal(gate.calls,1);
  await h.action(outcome==='success'?gate.finish:gate.fail);assert.equal(document.activeElement,search);
  if(outcome==='failure'){assert.equal(h.label('名称 保存中的事项').value,'提交名称');assert.match(h.query('.inline-editor [role=alert]').textContent,/暂时无法保存/);}else assert.equal(h.get(id).title,'提交名称');
 }finally{gate?.restore();await h.close();}
});

test('blur saves an inline draft without moving focus back into the edited row',async()=>{
 const h=await appDom();let gate;try{
  const id=h.add('自动保存事项');await h.mount();await h.click(h.label('事项'));const row=h.query(`[data-outline-id="${id}"]`);
  await h.click(row);await h.action(()=>row.focus());await h.key(document.activeElement,'F2');await h.input(document.activeElement,'离开后保存');gate=holdPatch();
  const search=h.label('在事项树中搜索');await h.action(()=>search.focus());assert.equal(gate.calls,1);await h.action(gate.finish);
  assert.equal(h.get(id).title,'离开后保存');assert.equal(document.activeElement,search);
 }finally{gate?.restore();await h.close();}
});

test('inspector tabs use one tab stop and arrow navigation while preserving selection across items',async()=>{
 const h=await appDom();try{
  const first=h.add('第一项详情'),second=h.add('第二项详情');await h.mount();await h.click(h.label('事项'));await h.click(h.query(`[data-outline-id="${first}"]`));
  const tabs=()=>[...h.label('详情内容').querySelectorAll('[role=tab]')],active=()=>tabs().find(tab=>tab.getAttribute('aria-selected')==='true');
  assert.deepEqual(tabs().map(tab=>tab.tabIndex),[0,-1,-1]);await h.action(()=>active().focus());
  for(const [key,title] of [['ArrowRight','投入 0'],['ArrowRight','复盘'],['ArrowRight','内容'],['ArrowLeft','复盘'],['Home','内容'],['End','复盘']]){
   await h.key(document.activeElement,key);assert.equal(document.activeElement.textContent,title);assert.equal(document.activeElement,active());
   assert.equal(tabs().filter(tab=>tab.tabIndex===0).length,1);const panel=h.query('[role=tabpanel]');assert.equal(active().getAttribute('aria-controls'),panel.id);assert.equal(panel.getAttribute('aria-labelledby'),active().id);
  }
  await h.key(document.activeElement,'ArrowLeft',{ctrlKey:true});assert.equal(active().textContent,'复盘');
  await h.key(document.activeElement,'Home',{isComposing:true});assert.equal(active().textContent,'复盘');
  await h.click(h.query(`[data-outline-id="${second}"]`));assert.equal(active().textContent,'复盘');assert.equal(active().tabIndex,0);
  await h.action(()=>active().focus());await h.key(document.activeElement,'Home');await h.click(h.label('事项说明：未填写'));const editor=document.activeElement;
  await h.input(editor,'编辑说明时保留方向键');await h.key(document.activeElement,'ArrowRight');assert.equal(document.activeElement,editor);assert.equal(active().textContent,'内容');
  await h.key(document.activeElement,'Escape');assert.equal(document.activeElement.getAttribute('aria-label'),'事项说明：未填写');
 }finally{await h.close();}
});
