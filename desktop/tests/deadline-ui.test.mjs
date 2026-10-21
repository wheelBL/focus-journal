import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';
import {JournalService} from '../core/service.ts';
import {emptyState} from '../core/types.ts';
const dom=new JSDOM('<!doctype html><div id="root"></div>',{url:'http://localhost',pretendToBeVisual:true});
for(const key of ['window','document','HTMLElement','HTMLInputElement','HTMLSelectElement','HTMLTextAreaElement','Event','MouseEvent','KeyboardEvent','CustomEvent'])globalThis[key]=dom.window[key];
globalThis.IS_REACT_ACT_ENVIRONMENT=true;globalThis.requestAnimationFrame=cb=>setTimeout(cb,0);globalThis.cancelAnimationFrame=clearTimeout;
dom.window.HTMLElement.prototype.scrollIntoView=function(){};dom.window.HTMLElement.prototype.scrollBy=function(){};
dom.window.HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','');};dom.window.HTMLDialogElement.prototype.close=function(){this.removeAttribute('open');};
class Store{path='deadline UI tests';state=emptyState();load(){return structuredClone(this.state);}save(s){this.state=structuredClone(s);}close(){}}
class Clock{time=Date.parse('2026-10-19T14:00:00');now(){return this.time;}monotonic(){return 0;}}
const clock=new Clock(),service=new JournalService(new Store(),clock);
window.journal={snapshot:async()=>service.snapshot(),command:async c=>service.execute(c),onChanged:()=>()=>{},exportData:async()=>null,importData:async()=>null,openDataFolder:async()=>{},windowAction:async()=>{}};
const {default:React,act}=await import('react'),{createRoot}=await import('react-dom/client');
const folder=path.resolve('qa-evidence/release-0.8.0/dom');mkdirSync(folder,{recursive:true});const output=path.join(folder,'deadline-app.mjs');
await build({entryPoints:['src/App.tsx'],outfile:output,bundle:true,platform:'node',format:'esm',packages:'external',jsx:'automatic',loader:{'.css':'empty'},logLevel:'silent'});
const {default:App}=await import(pathToFileURL(output).href);
const query=(s,root=document)=>{const e=root.querySelector(s);assert.ok(e,`Missing ${s}`);return e;};
const label=(name,root=document)=>query(`[aria-label="${name}"]`,root);
const button=(name,root=document)=>{const e=[...root.querySelectorAll('button')].find(b=>b.textContent.trim()===name);assert.ok(e,`Missing button ${name}`);return e;};
const action=async fn=>act(async()=>{await fn();await new Promise(r=>setTimeout(r,5));});
const click=e=>action(()=>e.click());
const input=(el,value)=>action(()=>{const proto=el instanceof HTMLSelectElement?HTMLSelectElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,'value').set.call(el,value);el.dispatchEvent(new Event(el instanceof HTMLSelectElement?'change':'input',{bubbles:true}));});
const openDeadline=(prefix)=>click(query(`button[aria-label^="${prefix}："]`));
const get=(id)=>service.snapshot().state.tasks.find(t=>t.id===id);

test('deadline precision works across tree, inspector, Today planning and task creation',async t=>{
 const dateId=service.execute({type:'task.save',payload:{title:'日期任务',dueAt:'2026-10-23',estimateMinutes:25}}).state.tasks.at(-1).id;
 const exactId=service.execute({type:'task.save',payload:{title:'原有精确时间',dueAt:new Date('2026-10-26T00:00:00').toISOString(),estimateMinutes:25}}).state.tasks.at(-1).id;
 const root=createRoot(query('#root'));await action(()=>root.render(React.createElement(App)));
 try{
  await t.test('tree opens date-only editor, switches to exact time and does not save a cancelled draft',async()=>{
   await click(label('事项'));await openDeadline('截止时间 日期任务');let editor=label('截止时间 日期任务编辑');
   assert.equal(label('截止时间 日期任务',editor).type,'date');assert.match(editor.textContent,/不含当天/);assert.equal(label('截止时间 日期任务',editor).value,'2026-10-23');
   await input(label('截止时间 日期任务方式',editor),'datetime-local');await input(label('截止时间 日期任务',editor),'2026-10-23T15:30');await click(button('保存截止',editor));
   assert.equal(get(dateId).dueAt,new Date('2026-10-23T15:30').toISOString());assert.match(query('button[aria-label^="截止时间 日期任务："]').textContent,/15:30/);
   await openDeadline('截止时间 日期任务');editor=label('截止时间 日期任务编辑');await click(button('清除',editor));await action(()=>editor.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true})));assert.equal(document.querySelectorAll('.deadline-popover').length,0);assert.equal(get(dateId).dueAt,new Date('2026-10-23T15:30').toISOString());
  });
  await t.test('inspector converts back to a calendar date, supports clear and organizing undo',async()=>{
   await click(label('日期任务',query('[role=tree]')));await openDeadline('详情截止时间');let editor=label('详情截止时间编辑');await input(label('详情截止时间方式',editor),'date');await input(label('详情截止时间',editor),'2026-10-26');await click(button('保存截止',editor));assert.equal(get(dateId).dueAt,'2026-10-26');
   assert.match(query('.task-inspector').textContent,/2026-10-26 前/);await openDeadline('详情截止时间');editor=label('详情截止时间编辑');await click(button('清除',editor));await click(button('保存截止',editor));assert.equal(get(dateId).dueAt,null);
   await action(()=>label('日期任务',query('[role=tree]')).dispatchEvent(new KeyboardEvent('keydown',{key:'z',ctrlKey:true,bubbles:true,cancelable:true})));assert.equal(get(dateId).dueAt,'2026-10-26');
  });
  await t.test('weekly saved-view filtering includes before Monday and excludes exact Monday',async()=>{
   await click(button('筛选'));await input(label('筛选状态'),'open');await input(label('筛选截止时间'),'through-week');
   assert.ok(label('日期任务',query('[role=tree]')));assert.ok(!document.querySelector('[role=treeitem][aria-label="原有精确时间"]'));
   await click(button('清除筛选'));
  });
  await t.test('Today planning preserves exact timestamps until explicitly switching precision',async()=>{
   await click(label('今日'));await click(button('原有精确时间'));await click(button('2026-10-26 00:00'));const dialog=query('dialog');
   assert.equal(label('截止时间方式',dialog).value,'datetime-local');assert.equal(label('截止时间',dialog).value,'2026-10-26T00:00');
   await input(label('截止时间方式',dialog),'date');await input(label('截止时间',dialog),'2026-10-23');await click(button('保存计划',dialog));assert.equal(get(exactId).dueAt,'2026-10-23');assert.ok(button('2026-10-23 前'));
  });
  await t.test('task creation offers date without forcing a time and saves the chosen date',async()=>{
   await action(()=>window.dispatchEvent(new KeyboardEvent('keydown',{key:'n',ctrlKey:true,bubbles:true,cancelable:true})));const dialog=query('dialog');const title=query('input[maxlength="120"]',dialog);await input(title,'新日期事项');assert.equal(label('截止时间方式',dialog).value,'date');await input(label('截止时间',dialog),'2026-10-24');await click(button('保存事项',dialog));assert.equal(service.snapshot().state.tasks.find(t=>t.title==='新日期事项').dueAt,'2026-10-24');
  });
 }finally{await action(()=>root.unmount());service.shutdown();dom.window.close();}
});
