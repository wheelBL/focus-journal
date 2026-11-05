import {test} from 'node:test';
import assert from 'node:assert/strict';
import {appDom} from './app-dom.mjs';

// Only synthetic journal entries and an in-memory bridge; no provider or device settings.
function syntheticAi(h){
 let sequence=1,run=0,state={id:'',conversationId:'chat-1',phase:'idle',text:'',error:null,context:null,suggestions:[],scope:null,purpose:'general',turns:[]},finish;
 const saved=new Map(),listeners=new Set(),calls={generate:[],cancel:0,subscriptions:0,unsubscriptions:0};
 const capture=()=>saved.set(state.conversationId,structuredClone(state));
 const get=()=>({...structuredClone(state),conversations:[...saved.values()].map(c=>({id:c.conversationId,scope:c.scope,title:c.turns[0]?.prompt??'新对话',updatedAt:''}))});
 const emit=next=>{state=structuredClone(next);capture();for(const listener of listeners)listener(get());return get();};
 const context=async scope=>{const tasks=h.service.snapshot().state.tasks.filter(t=>t.id!=='inbox'&&(scope.kind!=='item'||t.id===scope.itemId)&&(scope.kind!=='unfinished'||t.status==='open'&&(t.itemType??'task')==='task'));return {label:scope.kind==='item'?'指定事项及子项':scope.kind==='all'?'全部事项':scope.kind==='unfinished'?'全部未完成任务':'今日',itemCount:tasks.length,recordCount:0,truncated:false,items:tasks.map(t=>({id:t.id,title:t.title,path:t.title}))};};
 capture();
 const bridge={status:async()=>({configured:true,hasKey:true,baseUrl:'https://synthetic.invalid/v1',model:'synthetic',error:null}),context,get:async()=>get(),
  onChanged:listener=>{calls.subscriptions++;listeners.add(listener);return()=>{calls.unsubscriptions++;listeners.delete(listener);};},
  generate:async input=>{calls.generate.push(structuredClone(input));const preview=await context(input.scope),id=`run-${++run}`,turn={id,scope:input.scope,purpose:'general',prompt:input.prompt,phase:'running',text:'仅合成事项的回答',error:null,context:preview,suggestions:[]};emit({...state,...turn,turns:[...state.turns,turn]});return new Promise(resolve=>{finish=()=>{const next={...state,phase:'done',turns:state.turns.map(t=>t.id===id?{...t,phase:'done'}:t)};resolve(emit(next));};});},
  cancel:async()=>{calls.cancel++;return emit({...state,phase:'cancelled'});},
  reset:async()=>emit({id:'',conversationId:`chat-${++sequence}`,phase:'idle',text:'',error:null,context:null,suggestions:[],scope:null,purpose:'general',turns:[]}),
  selectConversation:async id=>{capture();assert.ok(saved.has(id),'Selected conversation exists');return emit(saved.get(id));},
 };
 return {bridge,calls,finish:()=>finish(),state:()=>get()};
}
const visiblePanel=h=>h.query('aside.ai-assistant-panel:not([hidden])');
const open=async h=>{await h.click(h.query('.sidebar-bottom [aria-label="AI 助手"]'));return visiblePanel(h);};

test('the app opens a persistent AI side panel, protects IME and shortcuts, and submits each request once',async()=>{
 const h=await appDom(),mock=syntheticAi(h);window.journalAI=mock.bridge;
 try{
  h.add('合成任务：交付准备',null);const before=h.service.snapshot().state;await h.mount();const panel=await open(h),composer=h.label('给 AI 的问题',panel);
  assert.equal(document.querySelector('dialog[aria-label="AI 助手"]'),null);assert.equal(document.querySelector('[aria-label="AI 对话模式"]'),null);
  await h.input(composer,'先理清目标');composer.focus();await h.key(composer,'f',{ctrlKey:true,code:'KeyF'});assert.equal(document.activeElement,composer);assert.equal(document.querySelector('.search-results'),null);
  await h.action(()=>composer.dispatchEvent(new window.CompositionEvent('compositionstart',{bubbles:true})));await h.key(composer,'Enter',{ctrlKey:true,isComposing:true});await h.key(composer,'Enter',{ctrlKey:true,keyCode:229});assert.equal(mock.calls.generate.length,0);
  await h.action(()=>composer.dispatchEvent(new window.CompositionEvent('compositionend',{bubbles:true})));await h.key(composer,'Enter',{ctrlKey:true});await h.key(composer,'Enter',{ctrlKey:true});assert.equal(mock.calls.generate.length,1);assert.equal(mock.calls.generate[0].prompt,'先理清目标');
  await h.input(composer,'生成时写下一句');await h.click(h.label('关闭 AI 助手',panel));assert.equal(panel.hidden,true);assert.equal(mock.calls.cancel,0);assert.equal(mock.calls.unsubscriptions,0);
  await open(h);assert.equal(visiblePanel(h),panel);assert.equal(h.label('给 AI 的问题'),composer);assert.equal(composer.value,'生成时写下一句');assert.equal(mock.calls.subscriptions,1);
  await h.click(h.label('展开助手'));assert.equal(visiblePanel(h),panel);assert.ok(h.query('.application.ai-is-expanded'));await h.click(h.label('收起展开布局'));assert.equal(h.label('给 AI 的问题'),composer);
  await h.action(mock.finish);assert.equal(composer.value,'生成时写下一句');assert.equal(mock.calls.generate.length,1);assert.match(h.query('.ai-user-message').textContent,/先理清目标/);assert.deepEqual(h.service.snapshot().state.tasks,before.tasks);assert.deepEqual(h.service.snapshot().state.sessions,before.sessions);
 }finally{delete window.journalAI;await h.close();}
});

test('visiting a reference keeps the original task editor, AI draft and explicit scope intact',async()=>{
 const h=await appDom(),mock=syntheticAi(h);window.journalAI=mock.bridge;
 try{
  const original=h.add('合成任务：原工作区',null),reference=h.add('合成任务：关联参考',null);await h.mount();await h.click(h.label('任务'));await h.click(h.query(`[data-outline-id="${original}"]`));
  const inspector=h.query('.workspace-origin .task-inspector');await h.click(h.label('事项说明：未填写',inspector));const editor=h.label('事项说明',inspector);await h.input(editor,'原任务尚未保存的编辑');
  const panel=await open(h),composer=h.label('给 AI 的问题',panel);await h.action(()=>composer.focus());assert.equal(h.get(original).description,'原任务尚未保存的编辑'); // Existing inline editing saves on blur.
  await h.input(composer,'先分析依赖，暂不改范围');await h.click(h.label('查看参考范围',panel));await h.input(h.label('AI 分析范围',panel),'all');
  await h.click(h.button('合成任务：关联参考',h.query('.ai-context')));assert.equal(h.query('.workspace-origin').hidden,true);assert.ok(h.query('.ai-related-pane:not([hidden]) [aria-label="关联内容详情"]'));
  await h.click(h.label('返回 AI 对话',h.query('.ai-related-pane')));assert.equal(h.query('.workspace-origin').hidden,false);assert.equal(h.query('.workspace-origin .task-inspector'),inspector);assert.ok(h.label('事项说明：原任务尚未保存的编辑',inspector));assert.equal(h.label('给 AI 的问题'),composer);assert.equal(composer.value,'先分析依赖，暂不改范围');
  // Merely inspecting another item never replaces the selected reference scope.
  await h.click(h.label('查看参考范围',panel));assert.equal(h.label('AI 分析范围',panel).value,'all');assert.equal(mock.calls.generate.length,0);assert.equal(h.get(reference).title,'合成任务：关联参考');assert.equal(h.get(original).description,'原任务尚未保存的编辑');
 }finally{delete window.journalAI;await h.close();}
});

test('new conversation and history selection restore each conversation draft without mounting a second assistant',async()=>{
 const h=await appDom(),mock=syntheticAi(h);window.journalAI=mock.bridge;
 try{
  h.add('合成任务：历史验证',null);await h.mount();const panel=await open(h),composer=h.label('给 AI 的问题',panel);await h.input(composer,'第一段对话的问题');await h.key(composer,'Enter',{ctrlKey:true});await h.action(mock.finish);
  const first=mock.state().conversationId;await h.input(composer,'第一段对话尚未发送的草稿');await h.click(h.label('新对话',panel));const second=mock.state().conversationId;assert.notEqual(second,first);assert.equal(composer.value,'');assert.equal(document.querySelectorAll('.ai-turn').length,0);
  await h.input(composer,'第二段对话尚未发送的草稿');await h.click(h.label('历史对话',panel));await h.click(h.query(`[data-conversation-id="${first}"]`));assert.equal(composer.value,'第一段对话尚未发送的草稿');assert.match(h.query('.ai-transcript').textContent,/第一段对话的问题/);
  await h.click(h.label('历史对话',panel));await h.click(h.query(`[data-conversation-id="${second}"]`));assert.equal(composer.value,'第二段对话尚未发送的草稿');assert.equal(document.querySelectorAll('.ai-turn').length,0);assert.equal(mock.calls.generate.length,1);assert.equal(mock.calls.subscriptions,1);assert.equal(mock.calls.unsubscriptions,0);
 }finally{delete window.journalAI;await h.close();}
});
