import {test} from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {build} from 'esbuild';
import {mkdirSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
const dom=new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>',{url:'http://localhost/?panel=floating-timer'});
for(const name of ['window','document','HTMLElement','Event','MouseEvent','KeyboardEvent'])globalThis[name]=dom.window[name];globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const {default:React,act}=await import('react'),{createRoot}=await import('react-dom/client');
const folder=path.resolve('qa-evidence/release-0.21.0/dom');mkdirSync(folder,{recursive:true});const output=path.join(folder,'FloatingTimerPanel.mjs');
await build({entryPoints:['src/FloatingTimerPanel.tsx'],outfile:output,bundle:true,platform:'node',format:'esm',packages:'external',jsx:'automatic',loader:{'.css':'empty'},logLevel:'silent'});
const {default:Panel}=await import(pathToFileURL(output));
const action=fn=>act(async()=>{await fn();await new Promise(r=>setImmediate(r));});
const query=s=>{const e=document.querySelector(s);assert.ok(e,`Missing ${s}`);return e;};
const button=text=>{const e=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===text);assert.ok(e,`Missing ${text}`);return e;};
async function mount(value){let data=value,listener=()=>{},fail=false;const actions=[];window.floatingTimer={snapshot:async()=>data,onChanged:fn=>{listener=fn;return()=>{listener=()=>{};};},action:async(kind,id)=>{actions.push([kind,id]);if(fail)throw Error('状态已经变化，请重试。');if(kind==='expand'||kind==='collapse'){data={...data,expanded:kind==='expand'};listener(data);}if(kind==='select'){data={...data,selectedId:id};listener(data);}}};
 const root=createRoot(query('#root'));await action(()=>root.render(React.createElement(Panel)));return {root,actions,update:async value=>action(()=>{data=value;listener(value);}),fail:()=>{fail=true;},close:()=>action(()=>root.unmount())};
}
const initial=()=>({timers:[{sessionId:'a',taskId:'ta',title:'梳理接口与验证方案',durationMs:1062000,targetMinutes:25,paused:false,recovered:false}],rest:null,breakMinutes:5,selectedId:'a',expanded:false});
test('collapsed strip is a single accessible operation; explicit expansion exposes scoped controls and Escape collapses',async()=>{
 const c=await mount(initial());try{assert.equal(document.querySelectorAll('button').length,1);assert.match(query('.floating-toggle').getAttribute('aria-label'),/剩余 07:18/);assert.equal(document.querySelector('.floating-controls'),null);
 await action(()=>query('.floating-toggle').click());await action(()=>button('暂停').click());await action(()=>button('结束并休息 5 分钟').click());assert.deepEqual(c.actions.slice(-2),[['pause','a'],['stop-rest','a']]);
 await action(()=>query('.floating-timer').dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true})));assert.equal(document.querySelector('.floating-controls'),null);assert.equal(document.activeElement,query('.floating-toggle'));
 }finally{await c.close();}assert.equal(document.body.classList.contains('floating-timer-body'),false);
});
test('multiple timer selection only changes displayed identity and rest is disabled while another runs',async()=>{
 const value=initial();value.expanded=true;value.timers.push({...value.timers[0],sessionId:'b',title:'第二件事'});const c=await mount(value);
 try{assert.equal(button('结束并休息 5 分钟').disabled,true);assert.match(query('.floating-switcher').textContent,/一次专注一件事/);await action(()=>query('.floating-switcher button:nth-child(2)').click());assert.deepEqual(c.actions,[['select','b']]);assert.match(query('.floating-controls h1').textContent,/第二件事/);
 await action(()=>button('隐藏计时签').click());assert.equal(c.actions.at(-1)[0],'hide');assert.equal(c.actions.some(a=>a[0]==='stop'),false);
 }finally{await c.close();}
});
test('pause, overtime, rest and welcome retain honest labels and never start automatically',async()=>{
 const v=initial(),c=await mount(v);try{v.timers[0].durationMs=1620000;await c.update({...v});assert.match(query('.floating-toggle').getAttribute('aria-label'),/超时 02:00/);
 v.timers[0].paused=true;await c.update({...v});assert.match(query('.floating-toggle').getAttribute('aria-label'),/暂停/);
 const rest={id:'r',phase:'running',sessionId:'a',minutes:5,remainingMs:180000,title:'上一事项',notify:false};const next={...v,timers:[],rest,selectedId:'rest:r',expanded:true};await c.update(next);assert.equal(query('time').textContent,'03:00');assert.match(query('.floating-toggle').getAttribute('aria-label'),/休息/);
 await c.update({...next,rest:{...rest,phase:'ready'}});assert.equal(c.actions.length,0);assert.match(query('h1').textContent,/欢迎回来/);await action(()=>button('继续专注').click());assert.deepEqual(c.actions,[['rest-continue','rest:r']]);
 }finally{await c.close();}
});
test('failed operation stays visible in the expanded panel and remains retryable',async()=>{
 const v=initial();v.expanded=true;const c=await mount(v);try{c.fail();await action(()=>button('暂停').click());assert.match(query('[role=alert]').textContent,/请重试/);assert.equal(button('暂停').disabled,false);assert.equal(query('time').textContent,'07:18');}finally{await c.close();}
});
