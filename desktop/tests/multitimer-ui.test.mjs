import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';
import {JournalService} from '../core/service.ts';
import {emptyState,localDate} from '../core/types.ts';

const dom=new JSDOM('<!doctype html><div id="root"></div>',{url:'http://localhost',pretendToBeVisual:true});
for(const key of ['window','document','HTMLElement','HTMLInputElement','HTMLSelectElement','HTMLTextAreaElement','Event','MouseEvent','KeyboardEvent','CustomEvent'])globalThis[key]=dom.window[key];
globalThis.IS_REACT_ACT_ENVIRONMENT=true;globalThis.requestAnimationFrame=callback=>setTimeout(callback,0);globalThis.cancelAnimationFrame=clearTimeout;
dom.window.HTMLElement.prototype.scrollIntoView=function(){};dom.window.HTMLElement.prototype.scrollBy=function(){};
dom.window.HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','');};dom.window.HTMLDialogElement.prototype.close=function(){this.removeAttribute('open');};
class Store{path='multi-timer UI tests';state=emptyState();load(){return structuredClone(this.state);}save(s){this.state=structuredClone(s);}close(){}}
class Clock{time=Date.now();mono=0;now(){return this.time;}monotonic(){return this.mono;}advance(ms){this.time+=ms;this.mono+=ms;}}
const clock=new Clock(),service=new JournalService(new Store(),clock);let changed=()=>{};
window.journal={snapshot:async()=>service.snapshot(),command:async c=>service.execute(c),onChanged:fn=>{changed=fn;return()=>{changed=()=>{};};},exportData:async()=>null,importData:async()=>null,openDataFolder:async()=>{},windowAction:async()=>{}};
const {default:React,act}=await import('react'),{createRoot}=await import('react-dom/client');
const folder=path.resolve('qa-evidence/release-0.8.0/dom');mkdirSync(folder,{recursive:true});const output=path.join(folder,'app.mjs');
await build({entryPoints:['src/App.tsx'],outfile:output,bundle:true,platform:'node',format:'esm',packages:'external',jsx:'automatic',loader:{'.css':'empty'},logLevel:'silent'});
const {default:App}=await import(pathToFileURL(output).href);
const query=(selector,root=document)=>{const el=root.querySelector(selector);assert.ok(el,`Missing ${selector}`);return el;};
const label=(name,root=document)=>query(`[aria-label="${name}"]`,root);
const button=(text,root=document)=>{const el=[...root.querySelectorAll('button')].find(b=>b.textContent.trim()===text);assert.ok(el,`Missing button ${text}`);return el;};
const action=async fn=>{await act(async()=>{await fn();await new Promise(r=>setTimeout(r,5));});};
const click=el=>action(()=>el.click());
const card=title=>[...document.querySelectorAll('.task-card')].find(el=>el.querySelector('.task-title')?.textContent===title);

test('full app concurrent timers keep tree, Today, dock and summaries synchronized',async t=>{
 const create=(title,estimateMinutes=25)=>service.execute({type:'task.save',payload:{title,estimateMinutes}}).state.tasks.at(-1).id;
 const a=create('写作'),b=create('阅读'),c=create('练习',null);const root=createRoot(query('#root'));
 await action(()=>root.render(React.createElement(App)));
 try{
  await t.test('tree starts a second timer with a nonblocking reminder and keeps both rows active',async()=>{
   await click(label('事项'));await click(label('开始写作'));clock.advance(10000);await click(label('开始阅读'));
   assert.equal(service.snapshot().timers.length,2);assert.equal(document.querySelectorAll('.outline-row.timing').length,2);
   assert.match(query('.toast[role=status]').textContent,/每次只做一件事情/);assert.equal(label('开始练习').disabled,false);
   await click(label('开始写作'));assert.equal(service.snapshot().timers.length,2);
  });
  await t.test('inspector pause and stop affect its own timer and summary cannot start rest over another running timer',async()=>{
   await click(label('阅读',query('[role=tree]')));await click(button('暂停',query('.task-inspector')));
   const before=service.snapshot().timers.find(t=>t.taskId===b).durationMs;clock.advance(10000);
   assert.equal(service.snapshot().timers.find(t=>t.taskId===b).durationMs,before);assert.equal(service.snapshot().timers.find(t=>t.taskId===a).durationMs,20000);
   await click(label('开始阅读'));assert.match(query('.toast[role=status]').textContent,/每次只做一件事情/);
   clock.advance(5000);await click(button('结束本次',query('.task-inspector')));assert.deepEqual(service.snapshot().timers.map(t=>t.taskId),[a]);
   assert.equal(button('保存并休息 5 分钟',label('结束本次后')).disabled,true);assert.match(label('结束本次后').textContent,/还有 1 个计时器在运行/);await click(button('稍后填写'));
  });
  await t.test('Today preserves the timeline and controls each active card independently',async()=>{
   await click(label('开始阅读'));await click(label('今日'));
   assert.ok(card('写作'));assert.ok(card('阅读'));assert.equal(document.querySelectorAll('.parallel-hint').length,1);
   await click(button('暂停',card('写作')));assert.ok(service.snapshot().timers.find(t=>t.taskId===a).paused);assert.equal(document.querySelectorAll('.parallel-hint').length,0);
   clock.advance(5000);await click(button('结束并完成任务',card('阅读')));assert.equal(service.snapshot().state.tasks.find(t=>t.id===b).status,'done');assert.deepEqual(service.snapshot().timers.map(t=>t.taskId),[a]);
   await click(label('关闭',query('dialog')));assert.ok(card('写作'));assert.ok(document.querySelector('.session-entry'));
   await click(button('恢复专注',card('写作')));
  });
  await t.test('an unestimated item can start another timer; the expandable dock controls its own entries',async()=>{
   // Selecting another pending task while a timer is running exposes the normal estimate flow.
   await click(button('选择重点'));await click(label('加入今日重点 练习',query('.today-focus-picker')));
   await click(label('开始计时 练习',query('.today-focus-list')));assert.equal(service.snapshot().state.tasks.find(t=>t.id===c).estimateMinutes,null);
   assert.equal(service.snapshot().timers.length,2);assert.match(query('.toast[role=status]').textContent,/每次只做一件事情/);
   await click(label('日历'));await click(label('管理所有计时器'));assert.equal(document.querySelectorAll('.dock-timer-row').length,2);
   await click(label('暂停练习计时'));assert.ok(service.snapshot().timers.find(t=>t.taskId===c).paused);assert.ok(!service.snapshot().timers.find(t=>t.taskId===a).paused);
   await click(label('恢复练习计时'));clock.advance(5000);await click(label('结束练习计时'));await click(button('稍后填写'));
   assert.deepEqual(service.snapshot().timers.map(t=>t.taskId),[a]);const guide=query('.calendar-guide details');await click(query('summary',guide));assert.equal(guide.open,true);assert.match(guide.textContent,/仅真实重叠的时段并排显示，并行投入分别累计/);
   await click(label('结束写作计时'));await click(button('稍后填写'));assert.equal(service.snapshot().timers.length,0);assert.equal(document.querySelectorAll('.timer-dock').length,0);
  });
  await t.test('recovered sessions are visible individually and preserving records across page switches',async()=>{
   service.execute({type:'focus.start',payload:{taskId:a}});service.execute({type:'focus.start',payload:{taskId:c}});clock.advance(5000);service.suspend();await action(()=>changed());
   await click(label('今日'));assert.equal(document.querySelectorAll('.recovery-notice').length,2);
   const count=service.snapshot().state.sessions.length;await click(label('事项'));await click(label('今日'));assert.equal(service.snapshot().state.sessions.length,count);
   assert.equal(label('查看日期').value,localDate(clock.now()));
  });
 }finally{await action(()=>root.unmount());service.shutdown();dom.window.close();}
});
