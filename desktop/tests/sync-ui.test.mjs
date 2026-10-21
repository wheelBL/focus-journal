import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';
import {JournalService} from '../core/service.ts';
import {emptyState} from '../core/types.ts';
import {SyncController} from '../electron/sync-controller.ts';
import {blankSync} from '../electron/sync-storage.ts';

const dom=new JSDOM('<!doctype html><div id="root"></div>',{url:'http://localhost',pretendToBeVisual:true});
for(const key of ['window','document','HTMLElement','HTMLInputElement','HTMLSelectElement','HTMLTextAreaElement','Event','MouseEvent','KeyboardEvent','CustomEvent'])globalThis[key]=dom.window[key];
globalThis.IS_REACT_ACT_ENVIRONMENT=true;globalThis.requestAnimationFrame=cb=>setTimeout(cb,0);globalThis.cancelAnimationFrame=clearTimeout;
dom.window.HTMLElement.prototype.scrollIntoView=function(){};dom.window.HTMLElement.prototype.scrollBy=function(){};
class Store{path='sync UI';state=emptyState();load(){return structuredClone(this.state);}save(s){this.state=structuredClone(s);}close(){}}
const service=new JournalService(new Store()),remoteService=new JournalService(new Store());
const remote={head:null,content:null,writes:0,testCount:0,async test(){this.testCount++;},async read(){return {head:this.head,content:this.content};},async write(h,c){assert.equal(h,this.head);this.head=String(++this.writes);this.content=c;return this.head;}};
const listeners=new Set(),journalListeners=new Set(),backups=[];let saved=blankSync();
const sync=new SyncController({journal:service,persistence:{load:()=>saved,save:s=>saved=s},vault:{encrypt:()=> 'cipher',decrypt:()=> 'fake-token'},remote:()=>remote,backup:s=>backups.push(s),changed:s=>listeners.forEach(cb=>cb(s)),journalChanged:()=>journalListeners.forEach(cb=>cb())});
const other=new SyncController({journal:remoteService,persistence:{load:()=>blankSync(),save:()=>{}},vault:{encrypt:()=> 'cipher',decrypt:()=> 'fake-token'},remote:()=>remote,backup:()=>{},changed:()=>{},journalChanged:()=>{}});
window.journal={snapshot:async()=>service.snapshot(),command:async c=>service.execute(c),onChanged:cb=>{journalListeners.add(cb);return()=>journalListeners.delete(cb);},exportData:async()=>null,importData:async()=>null,openDataFolder:async()=>{},windowAction:async()=>{},sync:{status:async()=>sync.status(),configure:async v=>sync.configure(v),disconnect:async()=>sync.disconnect(),test:()=>sync.test(),run:()=>sync.run(),resolve:(id,v)=>sync.resolve(id,v),onChanged:cb=>{listeners.add(cb);return()=>listeners.delete(cb);}}};
const {default:React,act}=await import('react'),{createRoot}=await import('react-dom/client');
const folder=path.resolve('qa-evidence/release-0.8.0/dom');mkdirSync(folder,{recursive:true});const output=path.join(folder,'sync-app.mjs');
await build({entryPoints:['src/App.tsx'],outfile:output,bundle:true,platform:'node',format:'esm',packages:'external',jsx:'automatic',loader:{'.css':'empty'},logLevel:'silent'});const {default:App}=await import(pathToFileURL(output).href);
const query=(s,root=document)=>{const e=root.querySelector(s);assert.ok(e,`Missing ${s}`);return e;};
const label=(name)=>query(`[aria-label="${name}"]`);
const button=(name)=>{const e=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===name);assert.ok(e,`Missing button ${name}`);return e;};
const action=async fn=>act(async()=>{await fn();await new Promise(r=>setTimeout(r,12));});
const click=e=>action(()=>e.click());
const input=(el,value)=>action(()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,value);el.dispatchEvent(new Event('input',{bubbles:true}));});
const config={repository:'https://gitcode.com/test/journal.git',username:'tester',branch:'focus-journal',token:'fake-token'};

test('settings and sidebar cover configuration, one-click sync, conflict confirmation, dirty drafts and disconnect',async t=>{
 const taskId=service.execute({type:'task.save',payload:{title:'本机事项',estimateMinutes:25}}).state.tasks.at(-1).id;
 const root=createRoot(query('#root'));await action(()=>root.render(React.createElement(App)));
 try{
  await t.test('unconfigured one-click entry opens settings; save and test keeps token hidden and out of export',async()=>{
   await click(label('一键同步'));assert.equal(query('h1').textContent,'设置');assert.equal(label('GitCode 访问令牌').type,'password');assert.equal(button('立即同步').disabled,true);
   await input(label('GitCode 仓库地址'),config.repository);await input(label('GitCode 用户名'),config.username);await input(label('GitCode 访问令牌'),config.token);await click(button('保存并测试连接'));
   assert.equal(remote.testCount,1);assert.equal(label('GitCode 访问令牌').value,'');assert.equal(button('立即同步').disabled,false);assert.doesNotMatch(service.exportJson(),/fake-token/);assert.match(query('.sync-status').textContent,/未上传日志/);
  });
  await t.test('sync from the sidebar uploads, keeps Today available and shows last successful time',async()=>{
   await click(label('今日'));assert.equal(query('h1').textContent.includes('设置'),false);await click(label('一键同步'));assert.equal(remote.writes,1);assert.match(query('.sync-shortcut').textContent,/上次/);
   await click(label('设置'));assert.match(query('.sync-status').textContent,/已将本机日志上传/);
  });
  await t.test('unsaved configuration draft is preserved by status updates and cannot start sync',async()=>{
   await input(label('GitCode 仓库地址'),'https://gitcode.com/test/draft.git');assert.equal(button('立即同步').disabled,true);await action(()=>sync.test());assert.equal(label('GitCode 仓库地址').value,'https://gitcode.com/test/draft.git');await input(label('GitCode 仓库地址'),config.repository);
  });
  await t.test('divergent edits show counts; remote overwrite needs an explicit second confirmation and backs up local',async()=>{
   other.configure(config);await other.run();remoteService.execute({type:'outline.patch',payload:{id:taskId,field:'title',value:'另一台电脑修改'}});await other.run();service.execute({type:'outline.patch',payload:{id:taskId,field:'title',value:'本机尚未同步的修改'}});
   await click(button('立即同步'));assert.ok(query('.sync-conflict'));assert.match(query('.sync-comparison').textContent,/2 个事项/);
   await click(button('使用远端内容…'));assert.equal(service.snapshot().state.tasks.filter(t=>t.id!=='inbox')[0].title,'本机尚未同步的修改');await click(button('取消'));assert.equal(document.querySelector('[aria-label="确认同步选择"]'),null);
   await click(button('使用远端内容…'));await click(button('确认载入远端'));assert.equal(service.snapshot().state.tasks.filter(t=>t.id!=='inbox')[0].title,'另一台电脑修改');assert.equal(JSON.parse(backups.at(-1)).state.tasks.filter(t=>t.id!=='inbox')[0].title,'本机尚未同步的修改');assert.equal(document.querySelector('.sync-conflict'),null);
  });
  await t.test('disconnect requires confirmation, removes saved credentials and preserves the journal',async()=>{
   await click(button('断开连接'));assert.ok(saved.config);await click(button('确认断开连接'));assert.equal(saved.config,null);assert.equal(label('GitCode 仓库地址').value,'');assert.equal(service.snapshot().state.tasks.filter(t=>t.id!=='inbox')[0].title,'另一台电脑修改');
  });
 }finally{await action(()=>root.unmount());sync.dispose();other.dispose();service.shutdown();remoteService.shutdown();dom.window.close();}
});
