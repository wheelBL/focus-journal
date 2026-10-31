import {test} from 'node:test';
import assert from 'node:assert/strict';
import {appDom} from './app-dom.mjs';

test('API settings explicitly enable permissions and show/copy/rotate a key without storing it in workspace state',async()=>{
 const h=await appDom();let state={enabled:false,port:17642,access:'read',running:false,baseUrl:null,hasToken:false,error:null},key='test-key-first',copied='',configured=[];
 window.journal.localApi={status:async()=>state,configure:async value=>{configured.push(value);state={...value,running:value.enabled,hasToken:true,baseUrl:value.enabled?`http://127.0.0.1:${value.port}/v1`:null,error:null};return state;},token:async()=>key,rotateToken:async()=>key='test-key-rotated'};
 Object.defineProperty(window.navigator,'clipboard',{configurable:true,value:{writeText:async value=>{copied=value;}}});
 try{
  await h.mount();await h.click(h.label('设置'));await h.click(h.button('本机控制 API',h.label('设置分区')));const section=h.query('#settings-api');
  assert.equal(h.label('启用本机 API').checked,false);assert.equal(h.label('API 访问权限').value,'read');assert.equal(section.textContent.includes('test-key'),false);
  await h.click(h.label('启用本机 API'));await h.input(h.label('API 端口'),'17643');await h.input(h.label('API 访问权限'),'write');await h.click(h.button('保存 API 设置'));
  assert.deepEqual(configured[0],{enabled:true,port:17643,access:'write'});assert.equal(h.label('API 连接地址').value,'http://127.0.0.1:17643/v1');assert.equal(document.querySelector('[aria-label="API 访问密钥"]'),null);
  await h.click(h.button('显示访问密钥'));assert.equal(h.label('API 访问密钥').value,key);await h.click(h.button('复制访问密钥'));assert.equal(copied,key);
  await h.click(h.button('重新生成密钥'));assert.equal(h.label('API 访问密钥').value,'test-key-rotated');assert.match(section.textContent,/旧密钥立即失效/);
  assert.equal(JSON.stringify(window.localStorage).includes('test-key'),false);
  await h.click(h.button('隐藏访问密钥'));assert.equal(document.querySelector('[aria-label="API 访问密钥"]'),null);
  await h.click(h.label('启用本机 API'));await h.click(h.button('保存 API 设置'));assert.equal(state.running,false);assert.equal(document.querySelector('[aria-label="API 连接地址"]'),null);
 }finally{await h.close();}
});

test('API bind errors preserve the draft and existing connection; preview explains desktop availability',async()=>{
 const h=await appDom();
 window.journal.localApi={status:async()=>({enabled:true,port:17642,access:'read',running:true,baseUrl:'http://127.0.0.1:17642/v1',hasToken:true,error:null}),configure:async()=>{throw Error('端口不可用，原连接保留。');},token:async()=>'isolated-key',rotateToken:async()=>'isolated-key'};
 try{await h.mount();await h.click(h.label('设置'));await h.click(h.button('本机控制 API',h.label('设置分区')));await h.input(h.label('API 端口'),'17643');await h.click(h.button('保存 API 设置'));assert.match(h.query('#settings-api [role="alert"]').textContent,/端口不可用/);assert.equal(h.label('API 端口').value,'17643');assert.equal(h.label('API 连接地址').value,'http://127.0.0.1:17642/v1');}finally{await h.close();}
 const p=await appDom();try{await p.mount();await p.click(p.label('设置'));await p.click(p.button('本机控制 API',p.label('设置分区')));assert.match(p.query('#settings-api').textContent,/Windows 桌面版/);assert.equal(document.querySelector('[aria-label="启用本机 API"]'),null);}finally{await p.close();}
});
