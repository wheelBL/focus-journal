import {test} from 'node:test';
import assert from 'node:assert/strict';
import {appDom} from './app-dom.mjs';

function gate(){let resolve,reject,calls=0;return {run:()=>{calls++;return new Promise((ok,no)=>{resolve=ok;reject=no;});},get calls(){return calls;},resolve:v=>resolve(v),reject:message=>reject(Error(message))};}
const disabled=input=>assert.equal(input.matches(':disabled'),true);

test('reminder preferences lock submitted fields, reject duplicates, and retain a failed draft for retry',async()=>{
 const h=await appDom();try{
  const hold=gate(),real=window.journal.command;window.journal.command=c=>c.type==='reminder.settings'?hold.run().then(()=>real(c)):real(c);
  await h.mount();await h.click(h.label('设置'));await h.click(h.button('到时提醒',h.label('设置分区')));await h.input(h.label('提醒音量'),'65');await h.input(h.label('重复提醒间隔'),'60');
  await h.click(h.button('保存提醒设置'));disabled(h.label('提醒音量'));disabled(h.label('重复提醒间隔'));await h.action(()=>h.label('提醒音量').form.requestSubmit());assert.equal(hold.calls,1);
  await h.action(()=>hold.reject('提醒配置未保存'));assert.match(h.query('#settings-reminders [role=alert]').textContent,/提醒配置未保存/);assert.equal(h.label('提醒音量').value,'65');assert.equal(h.label('提醒音量').matches(':disabled'),false);
  await h.click(h.button('保存提醒设置'));await h.action(()=>hold.resolve());assert.equal(h.service.snapshot().state.settings.reminders.volume,65);assert.equal(h.service.snapshot().state.settings.reminders.repeatSeconds,60);
 }finally{await h.close();}
});

test('global capture preferences cannot change during save and registration conflict is not reported as disabled',async()=>{
 const h=await appDom(),hold=gate();window.journal.capture={preferences:async()=>({shortcut:'Ctrl+Alt+Space',registered:true}),configure:()=>hold.run(),open:async()=>{},hide:async()=>{}};
 try{
  await h.mount();await h.click(h.label('设置'));await h.click(h.button('快速记录',h.label('设置分区')));await h.input(h.label('全局快速记录快捷键'),'Ctrl+Alt+N');await h.click(h.button('保存快捷键'));disabled(h.label('全局快速记录快捷键'));await h.action(()=>h.label('全局快速记录快捷键').form.requestSubmit());assert.equal(hold.calls,1);
  await h.action(()=>hold.resolve({shortcut:'Ctrl+Alt+N',registered:false,error:'该组合已被其他程序占用。'}));const section=h.query('#settings-capture');assert.match(section.textContent,/快捷键未生效/);assert.doesNotMatch(section.textContent,/快捷键已关闭/);assert.equal(h.label('全局快速记录快捷键').value,'Ctrl+Alt+N');
  await h.input(h.label('全局快速记录快捷键'),'');await h.click(h.button('保存快捷键'));await h.action(()=>hold.resolve({shortcut:'',registered:false}));assert.match(section.textContent,/快捷键已关闭/);
 }finally{await h.close();}
});

test('API settings load can retry and pending writes protect actual permissions and port',async()=>{
 const h=await appDom(),hold=gate();let fail=true;const initial={enabled:false,port:17642,access:'read',running:false,baseUrl:null,hasToken:false,error:null};
 window.journal.localApi={status:async()=>{if(fail)throw Error('状态读取失败');return initial;},configure:()=>hold.run()};
 try{
  await h.mount();await h.click(h.label('设置'));await h.click(h.button('本机控制 API',h.label('设置分区')));assert.match(h.query('#settings-api [role=alert]').textContent,/状态读取失败/);fail=false;await h.click(h.button('重试读取 API 状态'));
  await h.click(h.label('启用本机 API'));await h.input(h.label('API 端口'),'17644');await h.input(h.label('API 访问权限'),'write');await h.click(h.button('保存 API 设置'));
  for(const name of ['启用本机 API','API 端口','API 访问权限'])disabled(h.label(name));await h.action(()=>h.label('API 端口').form.requestSubmit());assert.equal(hold.calls,1);
  await h.action(()=>hold.reject('端口被占用'));assert.equal(h.label('API 端口').value,'17644');assert.equal(h.label('API 访问权限').value,'write');assert.match(h.query('#settings-api [role=alert]').textContent,/端口被占用/);
  await h.click(h.button('保存 API 设置'));await h.action(()=>hold.resolve({...initial,enabled:true,running:true,port:17644,access:'write',baseUrl:'http://127.0.0.1:17644/v1'}));assert.equal(h.label('API 连接地址').value,'http://127.0.0.1:17644/v1');
 }finally{await h.close();}
});

test('a late device settings save cannot reset a new settings screen draft',async()=>{
 const h=await appDom(),hold=gate();const initial={shortcut:'Ctrl+Alt+Space',registered:true};window.journal.capture={preferences:async()=>initial,configure:()=>hold.run(),open:async()=>{}};
 try{
  await h.mount();await h.click(h.label('设置'));await h.click(h.button('快速记录',h.label('设置分区')));await h.input(h.label('全局快速记录快捷键'),'Ctrl+Alt+N');await h.click(h.button('保存快捷键'));await h.click(h.label('今日'));await h.click(h.label('设置'));await h.click(h.button('快速记录',h.label('设置分区')));await h.input(h.label('全局快速记录快捷键'),'Ctrl+Shift+Space');
  await h.action(()=>hold.resolve({shortcut:'Ctrl+Alt+N',registered:true}));assert.equal(h.label('全局快速记录快捷键').value,'Ctrl+Shift+Space');assert.doesNotMatch(h.query('#settings-capture').textContent,/快捷键已生效/);
 }finally{await h.close();}
});
