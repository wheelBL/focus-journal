import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {mkdirSync,readFileSync} from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';
import {JournalService} from '../core/service.ts';
import {emptyState} from '../core/types.ts';

export async function appDom(){
 const dom=new JSDOM('<!doctype html><div id="root"></div>',{url:'http://localhost',pretendToBeVisual:true});
 for(const key of ['window','document','HTMLElement','HTMLInputElement','HTMLSelectElement','HTMLTextAreaElement','Event','MouseEvent','KeyboardEvent','CustomEvent'])globalThis[key]=dom.window[key];
 globalThis.IS_REACT_ACT_ENVIRONMENT=true;globalThis.requestAnimationFrame=cb=>setTimeout(cb,0);globalThis.cancelAnimationFrame=clearTimeout;
 dom.window.HTMLElement.prototype.scrollIntoView=function(){};dom.window.HTMLElement.prototype.scrollBy=function(){};
 dom.window.HTMLElement.prototype.setPointerCapture=function(){};dom.window.HTMLElement.prototype.hasPointerCapture=function(){return false;};
 dom.window.HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','');};dom.window.HTMLDialogElement.prototype.close=function(){this.removeAttribute('open');};
 class Store{path='full app scenario tests';state=emptyState();load(){return structuredClone(this.state);}save(s){this.state=structuredClone(s);}close(){}}
 const clock={time:Date.parse('2026-10-19T14:00:00'),mono:0,now(){return this.time;},monotonic(){return this.mono;},advance(ms){this.time+=ms;this.mono+=ms;}};
 const service=new JournalService(new Store(),clock);let onChanged=()=>{};
 window.journal={snapshot:async()=>service.snapshot(),command:async c=>service.execute(c),onChanged:cb=>{onChanged=cb;return()=>{onChanged=()=>{};};},exportData:async()=>null,importData:async()=>null,openDataFolder:async()=>{},windowAction:async()=>{}};
 const {default:React,act}=await import('react'),{createRoot}=await import('react-dom/client');
 const folder=path.resolve(`qa-evidence/release-${JSON.parse(readFileSync('package.json','utf8')).version}/dom`);mkdirSync(folder,{recursive:true});const output=path.join(folder,`app-${process.pid}-${randomUUID()}.mjs`);
 await build({entryPoints:['src/App.tsx'],outfile:output,bundle:true,platform:'node',format:'esm',packages:'external',jsx:'automatic',loader:{'.css':'empty'},logLevel:'silent'});
 const {default:App}=await import(pathToFileURL(output).href);
 const query=(s,root=document)=>{const e=root.querySelector(s);assert.ok(e,`Missing ${s}`);return e;};
 const label=(name,root=document)=>query(`[aria-label="${name}"]`,root);
 const button=(name,root=document)=>{const e=[...root.querySelectorAll('button')].find(b=>b.textContent.trim()===name);assert.ok(e,`Missing button ${name}`);return e;};
 const action=async fn=>act(async()=>{await fn();await new Promise(r=>setTimeout(r,8));});
 const click=e=>action(()=>e.click());
 const input=(el,value)=>action(()=>{const proto=el instanceof HTMLSelectElement?HTMLSelectElement.prototype:el instanceof HTMLTextAreaElement?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,'value').set.call(el,value);el.dispatchEvent(new Event(el instanceof HTMLSelectElement?'change':'input',{bubbles:true}));});
 const command=async c=>action(()=>{service.execute(c);onChanged();});
 const add=(title,parentId='inbox',extra={})=>service.execute({type:'task.save',payload:{title,parentId,...extra}}).state.tasks.at(-1).id;
 const get=id=>service.snapshot().state.tasks.find(t=>t.id===id);
 const key=(el,key,extra={})=>action(()=>el.dispatchEvent(new KeyboardEvent('keydown',{key,bubbles:true,cancelable:true,...extra})));
 const context=el=>action(()=>el.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true,clientX:240,clientY:220})));
 const root=createRoot(query('#root'));
 return {service,clock,query,label,button,action,click,input,command,add,get,key,context,mount:()=>action(()=>root.render(React.createElement(App))),close:async()=>{await action(()=>root.unmount());service.shutdown();dom.window.close();}};
}
