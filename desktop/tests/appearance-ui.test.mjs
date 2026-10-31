import {test} from 'node:test';
import assert from 'node:assert/strict';
import {appDom} from './app-dom.mjs';

test('appearance changes preserve active timing, selected tree and unsaved capture; preferences save outside journal',async()=>{
 const h=await appDom();const preferences=[];
 try{
  window.journalAppearance={set:async value=>{preferences.push(value);return value;}};
  const id=h.add('夜间继续工作');await h.mount();await h.command({type:'focus.start',payload:{taskId:id}});
  await h.input(h.label('快速添加事项名称'),'还没有保存的想法');const before=h.service.exportJson();
  await h.input(h.label('切换外观'),'dark');assert.equal(document.documentElement.dataset.theme,'dark');assert.equal(h.label('快速添加事项名称').value,'还没有保存的想法');assert.equal(h.service.exportJson(),before);
  await h.click(h.label('事项'));await h.click(h.query(`[data-outline-id="${id}"]`));await h.input(h.label('切换外观'),'light');
  assert.equal(document.documentElement.dataset.theme,'light');assert.equal(h.query('.outline-row.selected').dataset.outlineId,id);assert.equal(h.service.exportJson(),before);assert.equal(preferences.length,2);
  await h.click(h.label('设置'));await h.input(h.label('动效偏好'),'reduce');assert.equal(document.documentElement.dataset.motion,'reduce');assert.equal(preferences.at(-1).motion,'reduce');assert.equal(h.service.exportJson(),before);
 }finally{await h.close();}
});

test('pending appearance save blocks repeats and failure leaves old preference and visible error',async()=>{
 const h=await appDom();let reject,calls=0;
 try{
  window.journalAppearance={set:()=>{calls++;return new Promise((_,r)=>reject=r);}};
  await h.mount();await h.input(h.label('切换外观'),'dark');assert.equal(h.label('切换外观').disabled,true);assert.equal(calls,1);
  await h.action(()=>reject(Error('外观设置未保存，请重试。')));assert.equal(h.label('切换外观').value,'system');assert.match(h.query('.appearance-quick [role=alert]').textContent,/未保存/);assert.equal(h.label('切换外观').disabled,false);
  window.journalAppearance.set=async value=>value;await h.input(h.label('切换外观'),'dark');assert.equal(h.label('切换外观').value,'dark');assert.equal(document.documentElement.dataset.theme,'dark');
 }finally{await h.close();}
});
