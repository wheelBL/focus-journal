import {test} from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdirSync} from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {appDom} from './app-dom.mjs';

async function loaderModule(){const directory=path.resolve('qa-evidence/module-loading');mkdirSync(directory,{recursive:true});const output=path.join(directory,`deferred-${process.pid}.mjs`);await build({entryPoints:['src/DeferredModule.tsx'],outfile:output,bundle:true,platform:'node',format:'esm',packages:'external',jsx:'automatic',logLevel:'silent'});return import(pathToFileURL(output).href);}

test('optional modules load on demand, cache success and retain local input through parent refreshes',async()=>{
 const h=await appDom();let root;try{
  const {default:React}=await import('react'),{createRoot}=await import('react-dom/client'),{deferredModule}=await loaderModule();let calls=0,resolve;
  const Screen=deferredModule('独立模块',()=>{calls++;return new Promise(done=>{resolve=done;});});assert.equal(calls,0);
  const host=document.createElement('div');document.body.append(host);root=createRoot(host);const render=extra=>React.createElement('div',null,React.createElement('input',{'aria-label':'外围草稿',defaultValue:'保留外围输入'}),React.createElement('span',null,extra),React.createElement(Screen));
  await h.action(()=>root.render(render('初次')));assert.equal(calls,1);const draft=h.label('外围草稿');await h.action(()=>draft.focus());assert.match(host.textContent,/正在打开独立模块/);
  function Content(){const [value,setValue]=React.useState('');return React.createElement('input',{'aria-label':'模块内草稿',value,onChange:event=>setValue(event.target.value)});}
  await h.action(()=>resolve({default:Content}));assert.equal(document.activeElement,draft);await h.input(h.label('模块内草稿'),'尚未保存的模块输入');await h.action(()=>root.render(render('时钟刷新')));assert.equal(h.label('模块内草稿').value,'尚未保存的模块输入');assert.equal(calls,1);
  await h.action(()=>root.render(null));await h.action(()=>root.render(React.createElement(Screen)));assert.ok(h.label('模块内草稿'));assert.equal(calls,1);
 }finally{if(root)await h.action(()=>root.unmount());await h.close();}
});

test('failed or invalid optional imports offer a local retry without resetting the surrounding workspace',async()=>{
 const h=await appDom();let root;try{
  const {default:React}=await import('react'),{createRoot}=await import('react-dom/client'),{deferredModule}=await loaderModule();let calls=0;
  const Screen=deferredModule('可恢复模块',()=>{calls++;if(calls===1)throw Error('同步加载错误');if(calls===2)return Promise.resolve({});return Promise.resolve({default:()=>React.createElement('p',null,'模块恢复成功')});});
  const host=document.createElement('div');document.body.append(host);root=createRoot(host);
  await h.action(()=>root.render(React.createElement('div',null,React.createElement('input',{'aria-label':'仍可编辑',defaultValue:'未保存'}),React.createElement(Screen))));assert.match(host.textContent,/暂时无法打开/);assert.equal(h.label('仍可编辑').value,'未保存');
  await h.click(h.button('重试打开',host));assert.match(host.textContent,/暂时无法打开/);assert.equal(calls,2);
  await h.click(h.button('重试打开',host));assert.match(host.textContent,/模块恢复成功/);assert.equal(h.label('仍可编辑').value,'未保存');assert.equal(calls,3);
 }finally{if(root)await h.action(()=>root.unmount());await h.close();}
});

test('leaving a loading module prevents its late response from replacing the next screen',async()=>{
 const h=await appDom();let root;try{
  const {default:React}=await import('react'),{createRoot}=await import('react-dom/client'),{deferredModule}=await loaderModule();let resolve;
  const Screen=deferredModule('旧模块',()=>new Promise(done=>{resolve=done;}));const host=document.createElement('div');document.body.append(host);root=createRoot(host);
  await h.action(()=>root.render(React.createElement(Screen)));await h.action(()=>root.render(React.createElement('p',null,'用户已进入其他页面')));await h.action(()=>resolve({default:()=>React.createElement('p',null,'旧模块迟到结果')}));
  assert.equal(host.textContent,'用户已进入其他页面');await h.action(()=>root.render(React.createElement(Screen)));assert.equal(host.textContent,'旧模块迟到结果');
 }finally{if(root)await h.action(()=>root.unmount());await h.close();}
});

test('a render error is confined to its module and retry leaves surrounding drafts intact',async()=>{
 const h=await appDom();let root;try{
  const {default:React}=await import('react'),{createRoot}=await import('react-dom/client'),{deferredModule}=await loaderModule();let ready=false;
  const Screen=deferredModule('局部界面',async()=>({default:()=>{if(!ready)throw Error('临时无效状态');return React.createElement('p',null,'已恢复显示');}}));
  const host=document.createElement('div');document.body.append(host);root=createRoot(host,{onCaughtError:()=>{}});
  await h.action(()=>root.render(React.createElement('div',null,React.createElement('input',{'aria-label':'界面外的草稿',defaultValue:'保持原样'}),React.createElement(Screen))));assert.match(host.textContent,/暂时无法打开/);
  ready=true;await h.click(h.button('重试打开',host));assert.match(host.textContent,/已恢复显示/);assert.equal(h.label('界面外的草稿').value,'保持原样');
 }finally{if(root)await h.action(()=>root.unmount());await h.close();}
});

test('Review remains usable without session storage and has a single roving keyboard tab stop',async()=>{
 const h=await appDom(),storage=window.Storage.prototype,get=storage.getItem,set=storage.setItem;
 try{
  h.add('回顾事项');await h.mount();storage.getItem=()=>{throw Error('暂时无法读取偏好');};storage.setItem=()=>{throw Error('暂时无法保存偏好');};await h.click(h.label('回顾'));
  const tabs=()=>[...h.label('回顾方式').querySelectorAll('[role=tab]')];assert.deepEqual(tabs().map(tab=>tab.tabIndex),[0,-1,-1]);await h.action(()=>tabs()[0].focus());await h.key(document.activeElement,'ArrowRight');
  assert.equal(document.activeElement,tabs()[1]);assert.deepEqual(tabs().map(tab=>tab.tabIndex),[-1,0,-1]);assert.ok(h.query('.review-page'));const panel=h.query('.review-module > [role=tabpanel]');assert.equal(panel.getAttribute('aria-labelledby'),tabs()[1].id);const selected=h.query('[aria-current="page"]',h.label('回顾方式侧栏'));assert.equal(selected.textContent,'投入复盘');assert.equal(selected.getAttribute('aria-controls'),panel.id);
  await h.key(document.activeElement,'Home');assert.equal(document.activeElement,tabs()[0]);await h.key(document.activeElement,'End');assert.ok(document.activeElement===tabs()[2]);await h.key(document.activeElement,'ArrowLeft',{isComposing:true});assert.ok(document.activeElement===tabs()[2]);
 }finally{storage.getItem=get;storage.setItem=set;await h.close();}
});

test('focus settings protect submitted values, show a failed save locally and allow retry',async()=>{
 const h=await appDom();try{
  await h.mount();await h.click(h.label('设置'));await h.click(h.button('专注与休息',h.label('设置分区')));const form=h.query('#settings-focus form'),input=h.query('input',form);await h.input(input,'45');let fail,calls=0;const original=window.journal.command;
  window.journal.command=command=>command.type==='settings.save'?(calls++,new Promise((resolve,reject)=>{fail=reject;})):original(command);
  await h.action(()=>form.requestSubmit());assert.equal(input.matches(':disabled'),true);await h.action(()=>form.requestSubmit());assert.equal(calls,1);assert.match(form.textContent,/正在保存/);
  await h.action(()=>fail(Error('无法保存专注设置')));assert.equal(input.value,'45');assert.equal(input.matches(':disabled'),false);assert.match(h.query('[role=alert]',form).textContent,/无法保存专注设置/);
  window.journal.command=original;await h.action(()=>form.requestSubmit());assert.equal(h.service.snapshot().state.settings.targetMinutes,45);assert.equal(form.querySelector('[role=alert]'),null);
 }finally{await h.close();}
});

test('a local saved-view modal blocks global creation and search shortcuts behind it',async()=>{
 const h=await appDom();try{
  h.add('保留焦点');await h.mount();await h.click(h.label('事项'));await h.click(h.button('保存视图'));const dialog=h.query('dialog[open]'),input=h.label('常用视图名称');await h.input(input,'正在编辑的视图');
  await h.key(input,'n',{ctrlKey:true});assert.equal(h.query('dialog[open]'),dialog);assert.equal(document.querySelectorAll('dialog[open]').length,1);
  await h.key(input,'k',{ctrlKey:true});assert.equal(document.activeElement,input);assert.equal(input.value,'正在编辑的视图');assert.equal(document.querySelector('.inline-creator'),null);
 }finally{await h.close();}
});

test('a queued settings section scrolls after its screen mounts and is cleared when navigation changes',async()=>{
 const h=await appDom();try{
  const directory=path.resolve('qa-evidence/module-loading');mkdirSync(directory,{recursive:true});const output=path.join(directory,`settings-nav-${process.pid}.mjs`);await build({entryPoints:['src/settings-navigation.ts'],outfile:output,bundle:true,platform:'node',format:'esm',packages:'external',logLevel:'silent'});const navigation=await import(pathToFileURL(output).href);
  let scrolled=0;navigation.requestSettingsSection('ai');const section=document.createElement('section');section.id='settings-ai';section.scrollIntoView=()=>{scrolled++;};document.body.append(section);navigation.applySettingsSection();assert.equal(scrolled,1);navigation.applySettingsSection();assert.equal(scrolled,1);
  section.remove();navigation.requestSettingsSection('ai');navigation.clearSettingsSection();document.body.append(section);navigation.applySettingsSection();assert.equal(scrolled,1);
 }finally{await h.close();}
});
