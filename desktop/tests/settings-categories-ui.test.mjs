import {test} from 'node:test';
import assert from 'node:assert/strict';
import {appDom} from './app-dom.mjs';

const category=(h,name)=>h.click(h.button(name,h.label('设置分区')));
const visible=()=>[...document.querySelectorAll('.settings-category')].filter(el=>!el.hidden);

test('settings show one category, share ordered navigation and mount device forms only when visited',async()=>{
 const h=await appDom();let captures=0,apis=0;try{
  window.journal.capture={preferences:async()=>{captures++;return {shortcut:'Ctrl+Alt+Space',registered:true};},configure:async()=>{},open:async()=>{}};
  window.journal.localApi={status:async()=>{apis++;return {enabled:false,port:17642,access:'read',running:false,baseUrl:null,hasToken:false,error:null};}};
  await h.mount();await h.click(h.label('设置'));assert.equal(visible().length,1);assert.equal(visible()[0].id,'settings-category-appearance');assert.equal(captures,0);assert.equal(apis,0);assert.equal(document.querySelector('.settings-page .eyebrow'),null);
  const expected=['外观与动效','专注与休息','到时提醒','快速记录','AI 助手','本机控制 API','同步','数据与备份','使用习惯'];assert.deepEqual([...h.label('设置分区').querySelectorAll('button')].map(el=>el.textContent),expected);assert.deepEqual([...h.label('设置类别').options].map(el=>el.textContent),expected);
  await category(h,'快速记录');assert.equal(captures,1);assert.equal(apis,0);assert.equal(visible()[0].id,'settings-category-capture');assert.equal(h.query('#settings-nav-capture').getAttribute('aria-current'),'page');
  await category(h,'外观与动效');await category(h,'快速记录');assert.equal(captures,1,'visited forms are hidden, not remounted');
  await h.input(h.label('设置类别'),'api');assert.equal(apis,1);assert.equal(visible()[0].id,'settings-category-api');assert.equal(h.query('#settings-nav-api').getAttribute('aria-current'),'page');assert.equal(h.query('#settings-nav-capture').hasAttribute('aria-current'),false);assert.equal(document.querySelector('.sidebar-content .context-help'),null);
 }finally{await h.close();}
});

test('switching settings categories preserves drafts and pending completions cannot select another category',async()=>{
 const h=await appDom();let finish;try{
  await h.mount();await h.click(h.label('设置'));await category(h,'专注与休息');const focus=h.query('#settings-focus input');await h.input(focus,'45');
  await category(h,'到时提醒');const volume=h.label('提醒音量');await h.input(volume,'65');
  await category(h,'专注与休息');assert.equal(h.query('#settings-focus input'),focus);assert.equal(focus.value,'45');await category(h,'到时提醒');assert.equal(h.label('提醒音量'),volume);assert.equal(volume.value,'65');
  const original=window.journal.command;window.journal.command=command=>command.type==='reminder.settings'?new Promise(resolve=>{finish=()=>resolve(original(command));}):original(command);
  await h.click(h.button('保存提醒设置'));await category(h,'专注与休息');assert.equal(volume.matches(':disabled'),true);await h.action(()=>finish());
  assert.equal(visible()[0].id,'settings-category-focus');assert.equal(focus.value,'45');assert.equal(h.service.snapshot().state.settings.reminders.volume,65);assert.equal(h.service.snapshot().state.settings.targetMinutes,25);
  await category(h,'到时提醒');assert.equal(h.label('提醒音量'),volume);assert.equal(volume.value,'65');assert.equal(volume.matches(':disabled'),false);
 }finally{await h.close();}
});

test('external AI and unconfigured sync entries open their category on the first lazy settings visit',async()=>{
 const h=await appDom();try{
  const status={baseUrl:'',model:'',configured:false,hasKey:false,error:null};window.journalAI={status:async()=>status,get:async()=>({id:'',phase:'idle',text:'',error:null,context:null,suggestions:[]}),context:async()=>({label:'今日',itemCount:0,recordCount:0,items:[],truncated:false}),onChanged:()=>()=>{}};
  window.journal.sync={status:async()=>({phase:'idle',config:null,lastSuccess:null,message:'尚未配置'}),onChanged:()=>()=>{}};
  await h.mount();assert.doesNotMatch(h.query('.sync-shortcut').textContent,/连接 GitCode，在多台电脑间继续/);await h.click(h.label('AI 助手'));await h.click(h.button('打开 AI 设置'));
  assert.equal(visible()[0].id,'settings-category-ai');assert.equal(h.query('#settings-nav-ai').getAttribute('aria-current'),'page');assert.ok(h.label('AI 服务地址'));
  await h.click(h.label('今日'));await h.click(h.label('一键同步'));assert.equal(visible()[0].id,'settings-category-sync');assert.equal(h.query('#settings-nav-sync').getAttribute('aria-current'),'page');assert.ok(h.label('GitCode 仓库地址'));assert.equal(document.querySelector('[aria-label="日志日期"]'),null);
 }finally{await h.close();}
});
