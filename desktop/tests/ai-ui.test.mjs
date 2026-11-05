import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';
import {appDom} from './app-dom.mjs';

const empty={id:'',phase:'idle',text:'',error:null,context:null,suggestions:[]};
const preview={label:'当前事项',itemCount:2,recordCount:3,truncated:true,items:[{id:'one',title:'整理发布记录',path:'产品 / 整理发布记录'},{id:'two',title:'核对版本',path:'产品 / 整理发布记录 / 核对版本'}]};
const suggestion={id:'suggestion-1',label:'明确事项名称',target:'整理发布记录',before:'整理发布记录',after:'整理本次 Windows 发布记录',reason:'明确对应版本，减少查找时的歧义。',state:'pending'};
function mockBridge(){
 let state=structuredClone(empty),status={baseUrl:'https://model.example/v1',model:'example-chat',hasKey:true,configured:true,error:null};const listeners=new Set();
 const calls={generate:[],apply:[],context:[],configure:[],test:0,cancel:0,remove:0};
 const emit=next=>{state=structuredClone(next);for(const listener of listeners)listener(structuredClone(state));};
 const bridge={
  status:async()=>structuredClone(status),configure:async input=>{calls.configure.push(input);status={...status,baseUrl:input.baseUrl,model:input.model,hasKey:status.hasKey||!!input.apiKey,configured:true};return structuredClone(status);},clearKey:async()=>{calls.remove++;status={...status,hasKey:false,configured:false};return structuredClone(status);},test:async()=>{calls.test++;return {message:'连接成功',latencyMs:121};},
  context:async scope=>{calls.context.push(scope);return {...structuredClone(preview),label:scope.kind==='item'?'当前事项':scope.kind==='today'?'今日':'最近 7 天'};},get:async()=>structuredClone(state),
  generate:async input=>{calls.generate.push(input);emit({id:'run-1',phase:'done',text:'建议保留事项的原始记录。',error:null,context:preview,suggestions:[suggestion]});return structuredClone(state);},
  cancel:async()=>{calls.cancel++;emit({...state,phase:'cancelled'});return structuredClone(state);},
  apply:async input=>{calls.apply.push(input);emit({...state,suggestions:state.suggestions.map(item=>item.id===input.suggestionId?{...item,state:'applied'}:item)});return structuredClone(state);},
  onChanged:listener=>{listeners.add(listener);return()=>listeners.delete(listener);},
 };
 return {bridge,calls,emit,setStatus:next=>{status={...status,...next};},state:()=>structuredClone(state)};
}

async function aiDom(bridge){
 const h=await appDom();window.journalAI=bridge;
 const folder=path.resolve('qa-evidence/ai-ui');mkdirSync(folder,{recursive:true});const file=path.join(folder,`ai-${process.pid}-${Date.now()}.mjs`);
 await build({stdin:{contents:"export {AiAssistant} from './src/AiAssistant';export {AiSettings} from './src/AiSettings';",resolveDir:process.cwd(),loader:'tsx'},outfile:file,bundle:true,platform:'node',format:'esm',packages:'external',jsx:'automatic',loader:{'.css':'empty'},logLevel:'silent'});
 const components=await import(pathToFileURL(file).href),{default:React}=await import('react'),{createRoot}=await import('react-dom/client');const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
 return {...h,render:(name,props={})=>h.action(()=>root.render(name?React.createElement(components[name],props):null)),close:async()=>{await h.action(()=>root.unmount());delete window.journalAI;await h.close();}};
}

function sidebarBridge(){
 const mock=mockBridge();let sequence=0;const chats=new Map();const summaries=()=>[...chats.values()].map(chat=>({id:chat.conversationId,scope:chat.scope,title:chat.turns[0]?.prompt??'新对话',updatedAt:'2026-11-05T08:00:00Z'}));
 const emit=next=>{chats.set(next.conversationId,structuredClone(next));mock.emit({...next,conversations:summaries()});};
 const initial={...empty,conversationId:'chat-1',scope:{kind:'today'},purpose:'general',turns:[]};emit(initial);
 mock.bridge.reset=async()=>{const next={...initial,conversationId:`chat-${chats.size+1}`};emit(next);return mock.state();};
 mock.bridge.selectConversation=async id=>{emit(chats.get(id));return mock.state();};
 mock.bridge.generate=async input=>{mock.calls.generate.push(input);const old=mock.state(),id=`run-${++sequence}`,suggestions=[{...suggestion,id:`proposal-${sequence}`,runId:id,targetId:'one',editable:{value:'新的事项名称'},editableLabels:{value:'名称'}}],turn={id,purpose:'general',scope:input.scope,prompt:input.prompt,phase:'done',text:'**保留记录**\n\n1. 核对依赖\n2. 再确认安排\n\n<img src=x onerror=alert(1)>',error:null,context:preview,suggestions};emit({...old,...turn,turns:[...old.turns,turn]});return mock.state();};
 mock.bridge.apply=async input=>{mock.calls.apply.push(input);const old=mock.state();emit({...old,turns:old.turns.map(turn=>turn.id===input.runId?{...turn,suggestions:turn.suggestions.map(s=>s.id===input.suggestionId?{...s,state:'applied',canUndo:true}:s)}:turn)});return mock.state();};
 mock.calls.edit=[];mock.bridge.editSuggestion=async input=>{mock.calls.edit.push(input);const old=mock.state();emit({...old,turns:old.turns.map(turn=>turn.id===input.runId?{...turn,suggestions:turn.suggestions.map(s=>s.id===input.suggestionId?{...s,editable:input.values,after:input.values.value}:s)}:turn)});return mock.state();};
 mock.calls.undo=[];mock.bridge.undoSuggestion=async input=>{mock.calls.undo.push(input);const old=mock.state();emit({...old,turns:old.turns.map(turn=>turn.id===input.runId?{...turn,suggestions:turn.suggestions.map(s=>s.id===input.suggestionId?{...s,state:'historical',canUndo:false,error:'已撤销'}:s)}:turn)});return mock.state();};
 return {...mock,emit,summary:summaries};
}
const props={onClose(){},onSettings(){}};
async function scopeMenu(h,kind){if(!document.querySelector('[aria-label="AI 分析范围"]'))await h.click(h.label('查看参考范围'));if(kind)await h.input(h.label('AI 分析范围'),kind);}
const proposals=h=>h.click(h.query('#ai-proposals-tab'));

test('sidebar separates proposals, renders safe basic Markdown and applies only explicit confirmation',async()=>{
 const mock=sidebarBridge(),h=await aiDom(mock.bridge);try{
 await h.render('AiAssistant',{...props,itemId:'one'});assert.equal(document.querySelector('[aria-label="AI 对话模式"]'),null);await scopeMenu(h);assert.equal(h.label('AI 分析范围').value,'item');assert.match(h.query('.ai-context').textContent,/2 个事项.*3 条投入记录/);await h.click(h.label('关闭参考范围'));
 await h.click(h.button('拆解下一步'));await h.click(h.button('生成建议'));assert.equal(h.label('给 AI 的问题').value,'');assert.equal(h.query('.ai-response-text strong').textContent,'保留记录');assert.equal(document.querySelectorAll('.ai-response-text ol li').length,2);assert.equal(document.querySelector('.ai-response-text img'),null);assert.match(h.query('.ai-response-text').textContent,/<img src=x/);assert.equal(mock.calls.apply.length,0);assert.equal(h.query('#ai-proposals-panel').hidden,true);
 await proposals(h);assert.match(h.query('.ai-change').textContent,/修改前.*修改后/s);await h.click(h.label('确认应用 明确事项名称'));assert.deepEqual(mock.calls.apply,[{runId:'run-1',suggestionId:'proposal-1',scope:{kind:'item',itemId:'one'}}]);assert.match(h.query('.ai-applied-summary').textContent,/已更新/);assert.equal(h.query('.ai-suggestion').querySelector('.ai-change'),null);await h.click(h.label('撤销 明确事项名称'));assert.equal(mock.calls.undo.length,1);assert.match(h.query('.ai-suggestion').textContent,/已撤销/);
 }finally{await h.close();}
});

test('generating allows next draft and closing or expanding never cancels the request',async()=>{
 const mock=sidebarBridge(),h=await aiDom(mock.bridge);let finish,closed=0,expanded=false;const options={...props,onClose:()=>closed++,onExpandChange:value=>expanded=value};try{
 mock.bridge.generate=input=>{mock.calls.generate.push(input);return new Promise(resolve=>finish=resolve);};await h.render('AiAssistant',options);await h.input(h.label('给 AI 的问题'),'先分析');await h.click(h.button('生成建议'));assert.equal(h.label('给 AI 的问题').value,'');assert.equal(h.label('给 AI 的问题').readOnly,false);await h.input(h.label('给 AI 的问题'),'下一句尚未发送');await h.click(h.label('展开助手'));assert.equal(expanded,true);await h.click(h.label('关闭 AI 助手'));assert.equal(closed,1);assert.equal(mock.calls.cancel,0);await h.render('AiAssistant',{...options,open:false});assert.equal(h.query('.ai-assistant-panel').hidden,true);
 const old=mock.state(),turn={id:'run-late',purpose:'general',scope:{kind:'today'},prompt:'先分析',phase:'done',text:'后台生成完成',error:null,context:preview,suggestions:[]};await h.action(()=>{const next={...old,...turn,turns:[turn]};mock.emit(next);finish(next);});await h.render('AiAssistant',options);assert.match(h.query('.ai-response-text').textContent,/后台生成完成/);assert.equal(h.label('给 AI 的问题').value,'下一句尚未发送');
 }finally{await h.close();}
});

test('scope remains explicit while browsing and old scope proposals cannot be applied',async()=>{
 const mock=sidebarBridge(),h=await aiDom(mock.bridge);let opened;try{
 await h.render('AiAssistant',{...props,onOpenItem:id=>opened=id});await h.input(h.label('给 AI 的问题'),'今日事项');await h.click(h.button('生成建议'));await scopeMenu(h);await h.click(h.button('整理发布记录',h.query('.ai-context')));assert.equal(opened,'one');assert.equal(document.querySelector('[aria-label="AI 分析范围"]'),null);assert.equal(mock.calls.context.at(-1).kind,'today');await scopeMenu(h,'recent');await h.click(h.label('关闭参考范围'));await proposals(h);assert.equal(h.label('确认应用 明确事项名称').disabled,true);await h.click(h.label('确认应用 明确事项名称'));assert.equal(mock.calls.apply.length,0);await scopeMenu(h,'today');await h.click(h.label('关闭参考范围'));assert.equal(h.label('确认应用 明确事项名称').disabled,false);
 }finally{await h.close();}
});

test('pending proposals survive follow-ups and edits are validated before explicit apply',async()=>{
 const mock=sidebarBridge(),h=await aiDom(mock.bridge);try{
 await h.render('AiAssistant',props);await h.input(h.label('给 AI 的问题'),'先整理');await h.click(h.button('生成建议'));await h.input(h.label('给 AI 的问题'),'再拆解');await h.click(h.button('继续对话'));assert.equal(document.querySelectorAll('.ai-turn').length,2);await proposals(h);assert.equal(document.querySelectorAll('[aria-label="确认应用 明确事项名称"]').length,2);const card=h.query('[data-suggestion-id="proposal-1"]');await h.click(h.button('编辑建议',card));await h.input(h.label('编辑 明确事项名称 名称',card),'自行修改的名称');assert.equal(h.label('确认应用 明确事项名称',card).disabled,true);await h.click(h.button('保存建议',card));assert.deepEqual(mock.calls.edit,[{runId:'run-1',suggestionId:'proposal-1',values:{value:'自行修改的名称'},scope:{kind:'today'}}]);assert.equal(mock.calls.apply.length,0);assert.match(h.query('.ai-change',card).textContent,/自行修改的名称/);await h.click(h.label('确认应用 明确事项名称',card));assert.equal(mock.calls.apply[0].runId,'run-1');
 }finally{await h.close();}
});

test('history switching restores each conversation draft atomically even when change events arrive before the promise',async()=>{
 const mock=sidebarBridge(),h=await aiDom(mock.bridge);let resolve;try{
 await h.render('AiAssistant',props);await h.input(h.label('给 AI 的问题'),'对话一');await h.click(h.button('生成建议'));await h.input(h.label('给 AI 的问题'),'一的未发送草稿');await h.click(h.label('新对话'));await h.input(h.label('给 AI 的问题'),'对话二');await h.click(h.button('生成建议'));await h.input(h.label('给 AI 的问题'),'二的未发送草稿');const select=mock.bridge.selectConversation;mock.bridge.selectConversation=async id=>{const result=await select(id);return new Promise(r=>resolve=()=>r(result));};await h.click(h.label('历史对话'));await h.click(h.query('[data-conversation-id="chat-1"]'));assert.equal(h.label('给 AI 的问题').value,'二的未发送草稿');await h.action(()=>resolve());assert.equal(h.label('给 AI 的问题').value,'一的未发送草稿');mock.bridge.selectConversation=select;await h.click(h.label('历史对话'));await h.click(h.query('[data-conversation-id="chat-2"]'));assert.equal(h.label('给 AI 的问题').value,'二的未发送草稿');
 }finally{await h.close();}
});

test('IME shortcuts are contained and Escape closes one assistant layer at a time',async()=>{
 const mock=sidebarBridge(),h=await aiDom(mock.bridge);let closed=0,escaped=0;const listener=()=>escaped++;try{
 window.addEventListener('keydown',listener);await h.render('AiAssistant',{...props,onClose:()=>closed++});const input=h.label('给 AI 的问题');await h.input(input,'输入中');await h.key(input,'Enter',{ctrlKey:true,isComposing:true});await h.key(input,'Enter',{ctrlKey:true,keyCode:229});assert.equal(mock.calls.generate.length,0);await h.click(h.label('查看参考范围'));await h.key(input,'Escape');assert.equal(document.querySelector('.ai-context'),null);assert.equal(closed,0);await proposals(h);await h.key(input,'Escape');assert.equal(h.query('#ai-chat-tab').getAttribute('aria-selected'),'true');assert.equal(closed,0);await h.key(input,'Escape',{isComposing:true});assert.equal(closed,0);await h.key(input,'Escape');assert.equal(closed,1);assert.equal(escaped,0);await h.key(input,'Enter',{ctrlKey:true});assert.equal(mock.calls.generate.length,1);
 }finally{window.removeEventListener('keydown',listener);await h.close();}
});

test('contextual entry changes scope explicitly, ordinary reopening preserves it and refreshes saved connection status',async()=>{
 const mock=sidebarBridge(),h=await aiDom(mock.bridge);try{
 mock.setStatus({configured:false});await h.render('AiAssistant',{...props,requestSequence:1});assert.ok(h.button('打开 AI 设置'));mock.setStatus({configured:true});await h.render('AiAssistant',{...props,open:false,requestSequence:1});await h.render('AiAssistant',{...props,open:true,itemId:'two',requestSequence:2});await scopeMenu(h);assert.equal(h.label('AI 分析范围').value,'item');assert.deepEqual(mock.calls.context.at(-1),{kind:'item',itemId:'two'});await h.click(h.label('关闭参考范围'));await h.render('AiAssistant',{...props,requestSequence:3});assert.deepEqual(mock.calls.context.at(-1),{kind:'item',itemId:'two'});await h.input(h.label('给 AI 的问题'),'已经连接');assert.equal(h.button('生成建议').disabled,false);await h.render('AiAssistant',{...props,initialPurpose:'priorities',requestSequence:4});await scopeMenu(h);assert.equal(h.label('AI 分析范围').value,'unfinished');assert.equal(document.querySelector('[aria-label="AI 对话模式"]'),null);
 }finally{await h.close();}
});

test('repair conflicts and cancellation keep responses and restore the original request only when no newer draft exists',async()=>{
 const mock=sidebarBridge(),h=await aiDom(mock.bridge);try{
 mock.bridge.generate=async input=>{mock.calls.generate.push(input);const old=mock.state(),turn={id:'repair',purpose:'general',scope:input.scope,prompt:input.prompt,phase:'error',text:'',error:'截止不能早于前置事项',repair:{attempt:2,maxAttempts:2,message:'正在调整'},context:preview,suggestions:[suggestion]},result={...old,...turn,turns:[turn]};mock.emit(result);return result;};await h.render('AiAssistant',props);await h.input(h.label('给 AI 的问题'),'调整日期');await h.click(h.button('生成建议'));assert.equal(h.label('给 AI 的问题').value,'调整日期');assert.match(h.query('.ai-response .ai-error').textContent,/前置事项/);assert.equal(document.querySelector('[aria-label^="确认应用"]'),null);assert.ok(h.button('继续对话'));
 }finally{await h.close();}
});

function modelsBridge(){const mock=mockBridge();mock.calls.models=[];mock.calls.cancelModels=0;mock.bridge.listModels=async input=>{mock.calls.models.push(input);return {baseUrl:input.baseUrl,models:['alpha-chat','beta-tools','gamma'],partial:false};};mock.bridge.cancelModels=async()=>{mock.calls.cancelModels++;};return mock;}
test('AI settings never refill or cache keys, preserve failed inputs and test only the saved connection',async()=>{
 const mock=mockBridge(),h=await aiDom(mock.bridge);try{
  await h.render('AiSettings');const key=h.label('AI API 密钥');assert.equal(key.type,'password');assert.equal(key.value,'');assert.match(document.body.textContent,/已保存密钥/);
  await h.input(key,'test-secret-do-not-send');await h.input(h.label('AI 模型'),'replacement-model');assert.equal(h.button('测试已保存连接').disabled,true);assert.match(h.query('.ai-settings-hint').textContent,/先保存/);
  let reject,calls=0;const real=mock.bridge.configure;mock.bridge.configure=()=>{calls++;return new Promise((_,r)=>{reject=r;});};await h.action(()=>key.form.requestSubmit());await h.action(()=>key.form.requestSubmit());assert.equal(calls,1);assert.equal(key.matches(':disabled'),true);
  await h.action(()=>reject(Error('test-secret-do-not-send 保存失败')));assert.equal(key.value,'test-secret-do-not-send');assert.equal(h.label('AI 模型').value,'replacement-model');assert.match(h.query('.ai-error').textContent,/保存失败/);assert.doesNotMatch(h.query('.ai-error').textContent,/test-secret-do-not-send/);assert.equal(window.localStorage.length,0);
  mock.bridge.configure=real;await h.click(h.button('保存 AI 设置'));assert.deepEqual(mock.calls.configure,[{baseUrl:'https://model.example/v1',model:'replacement-model',apiKey:'test-secret-do-not-send'}]);assert.equal(key.value,'');assert.equal(h.button('测试已保存连接').disabled,false);await h.click(h.button('测试已保存连接'));assert.equal(mock.calls.test,1);assert.equal(mock.calls.context.length,0);assert.equal(mock.calls.generate.length,0);assert.match(h.query('.ai-success').textContent,/连接成功.*121/);
  await h.click(h.button('移除密钥'));assert.equal(mock.calls.remove,1);assert.match(h.query('.ai-key-state').textContent,/尚未保存/);assert.equal(key.value,'');assert.equal(window.localStorage.length,0);
 }finally{await h.close();}
});

test('model discovery works before model setup and selection stays a draft until save',async()=>{
 const mock=modelsBridge();mock.setStatus({model:'',hasKey:false,configured:false});const h=await aiDom(mock.bridge);try{
 await h.render('AiSettings');assert.equal(mock.calls.models.length,0);assert.equal(h.label('AI 模型').value,'');await h.input(h.label('AI 服务地址'),'https://model.example/v1');await h.input(h.label('AI API 密钥'),'synthetic-new-key');await h.click(h.button('获取模型列表'));assert.deepEqual(mock.calls.models,[{baseUrl:'https://model.example/v1',apiKey:'synthetic-new-key'}]);assert.equal(h.label('AI 模型').value,'');assert.equal(mock.calls.configure.length,0);assert.equal(h.label('选择 AI 模型').options.length,4);
 await h.input(h.label('搜索 AI 模型'),'BETA');assert.match(h.query('.ai-model-discovery').textContent,/显示 1 \/ 3/);await h.input(h.label('选择 AI 模型'),'beta-tools');assert.equal(h.label('AI 模型').value,'beta-tools');assert.equal(mock.calls.configure.length,0);await h.click(h.button('保存 AI 设置'));assert.equal(mock.calls.configure[0].model,'beta-tools');assert.equal(h.label('AI API 密钥').value,'');await h.click(h.button('测试已保存连接'));assert.equal(mock.calls.test,1);
 }finally{await h.close();}
});

test('model discovery preserves custom models, empty and partial lists and failures without changing configuration',async()=>{
 const mock=modelsBridge(),h=await aiDom(mock.bridge);try{
 await h.render('AiSettings');await h.input(h.label('AI 模型'),'custom-preserved');await h.click(h.button('获取模型列表'));assert.match(h.label('选择 AI 模型').selectedOptions[0].textContent,/当前 \/ 自定义/);assert.equal(h.label('AI 模型').value,'custom-preserved');await h.input(h.label('搜索 AI 模型'),'no-match');assert.match(h.query('.ai-model-discovery').textContent,/显示 0 \/ 3.*没有符合搜索/s);assert.equal(h.label('选择 AI 模型').value,'custom-preserved');
 mock.bridge.listModels=async()=>({baseUrl:'https://model.example/v1',models:[],partial:true});await h.click(h.button('刷新模型列表'));assert.match(h.query('.ai-model-discovery').textContent,/已截断.*未返回模型/s);assert.equal(h.label('AI 模型').value,'custom-preserved');mock.bridge.listModels=async()=>{throw Error('服务暂不支持模型列表');};await h.click(h.button('刷新模型列表'));assert.match(h.query('.ai-model-discovery [role=alert]').textContent,/可继续手动填写/);assert.equal(h.label('AI 模型').value,'custom-preserved');assert.equal(mock.calls.configure.length,0);assert.equal(window.localStorage.length,0);
 }finally{await h.close();}
});

test('editing credentials invalidates model results and cancellation prevents late responses from replacing newer drafts',async()=>{
 const mock=modelsBridge(),h=await aiDom(mock.bridge);let finishOld,finishNew;try{
 await h.render('AiSettings');mock.bridge.listModels=input=>{mock.calls.models.push(input);return new Promise(resolve=>{if(!finishOld)finishOld=resolve;else finishNew=resolve;});};await h.click(h.button('获取模型列表'));await h.click(h.button('正在获取模型…'));assert.equal(mock.calls.models.length,1);assert.equal(h.button('保存 AI 设置').disabled,true);await h.input(h.label('AI 服务地址'),'https://other.example/v1');assert.equal(mock.calls.cancelModels,1);assert.equal(document.querySelector('[aria-label="选择 AI 模型"]'),null);await h.input(h.label('AI API 密钥'),'synthetic-replacement');await h.click(h.button('获取模型列表'));await h.action(()=>finishNew({baseUrl:'https://other.example/v1',models:['new-only'],partial:false}));await h.action(()=>finishOld({baseUrl:'https://model.example/v1',models:['old-stale'],partial:false}));assert.match(h.label('选择 AI 模型').textContent,/new-only/);assert.equal(h.label('选择 AI 模型').textContent.includes('old-stale'),false);assert.equal(h.label('AI 模型').value,'example-chat');assert.equal(h.label('AI API 密钥').value,'synthetic-replacement');
 await h.click(h.button('刷新模型列表'));await h.click(h.button('取消获取'));assert.equal(mock.calls.cancelModels,2);await h.render(null);assert.equal(mock.calls.configure.length,0);
 }finally{await h.close();}
});

test('model discovery remains disabled until connection settings load and unmount cancels a pending request',async()=>{
 const mock=modelsBridge(),h=await aiDom(mock.bridge);let finishStatus,finishList;try{
 mock.bridge.status=()=>new Promise(resolve=>{finishStatus=resolve;});await h.render('AiSettings');assert.equal(h.button('获取模型列表').matches(':disabled'),true);assert.equal(mock.calls.models.length,0);await h.action(()=>finishStatus({baseUrl:'https://model.example/v1',model:'custom',hasKey:true,configured:true,error:null}));mock.bridge.listModels=()=>new Promise(resolve=>{finishList=resolve;});await h.click(h.button('获取模型列表'));await h.render(null);assert.equal(mock.calls.cancelModels,1);await h.action(()=>finishList({baseUrl:'https://model.example/v1',models:['late'],partial:false}));assert.equal(document.querySelector('[aria-label="选择 AI 模型"]'),null);assert.equal(mock.calls.configure.length,0);
 }finally{await h.close();}
});


test('date editors preserve local precision, submit only changed fields and retain the atomic review safeguard',async()=>{
 const mock=sidebarBridge(),h=await aiDom(mock.bridge);try{
 const base=mock.state(),proposal={...suggestion,runId:'date-run',editable:{date:'2026-11-06',dueAt:'2026-11-09','review.nextDate':'2026-11-10',at:'2026-11-08T09:20:35.000Z'},editableLabels:{date:'计划开始',dueAt:'截止时间','review.nextDate':'下次审视日期',at:'提醒时间'}},turn={id:'date-run',purpose:'general',scope:{kind:'today'},prompt:'修改安排',phase:'done',text:'请检查日期',error:null,context:preview,suggestions:[proposal]};mock.emit({...base,...turn,turns:[turn]});await h.render('AiAssistant',props);await proposals(h);await h.click(h.button('编辑建议'));assert.equal(h.label('编辑 明确事项名称 计划开始').type,'date');assert.equal(h.label('编辑 明确事项名称 下次审视日期').type,'date');assert.equal(h.label('编辑 明确事项名称 提醒时间').type,'datetime-local');assert.equal(h.label('编辑 明确事项名称 截止时间').type,'date');assert.match(h.query('.ai-proposal-editor').textContent,/该日零点前/);await h.input(h.label('编辑 明确事项名称 下次审视日期'),'2026-11-12');await h.input(h.label('编辑 明确事项名称 截止时间'),'');await h.click(h.button('保存建议'));assert.deepEqual(mock.calls.edit[0].values,{dueAt:null,'review.nextDate':'2026-11-12'});assert.equal(mock.calls.apply.length,0);
 }finally{await h.close();}
});

test('reading position survives task navigation, collapsed panel, tab changes and conversation history',async()=>{
 const mock=sidebarBridge(),h=await aiDom(mock.bridge);try{
 await h.render('AiAssistant',props);await h.input(h.label('给 AI 的问题'),'对话一');await h.click(h.button('生成建议'));const pane=h.query('.ai-transcript');Object.defineProperty(pane,'scrollHeight',{configurable:true,value:1000});Object.defineProperty(pane,'clientHeight',{configurable:true,value:200});pane.scrollTop=130;await h.action(()=>pane.dispatchEvent(new Event('scroll',{bubbles:true})));await proposals(h);await h.click(h.query('#ai-chat-tab'));assert.equal(pane.scrollTop,130);await h.render('AiAssistant',{...props,open:false});await h.render('AiAssistant',props);assert.equal(pane.scrollTop,130);await h.click(h.label('新对话'));await h.input(h.label('给 AI 的问题'),'对话二');await h.click(h.button('生成建议'));pane.scrollTop=310;await h.action(()=>pane.dispatchEvent(new Event('scroll',{bubbles:true})));await h.click(h.label('历史对话'));await h.click(h.query('[data-conversation-id="chat-1"]'));assert.equal(pane.scrollTop,130);await h.click(h.button('回到最新'));assert.equal(pane.scrollTop,1000);
 }finally{await h.close();}
});

test('stopping a running correction keeps partial output without replacing a newly written draft',async()=>{
 const mock=sidebarBridge(),h=await aiDom(mock.bridge);let finish;try{
 mock.bridge.generate=input=>{mock.calls.generate.push(input);const old=mock.state(),turn={id:'repair-live',purpose:'general',scope:input.scope,prompt:input.prompt,phase:'running',text:'已经收到的说明',error:'中间校验错误不应显示',repair:{attempt:1,maxAttempts:2,message:'发现安排冲突，正在调整建议。'},context:preview,suggestions:[suggestion]};mock.emit({...old,...turn,turns:[turn]});return new Promise(resolve=>finish=resolve);};mock.bridge.cancel=async()=>{mock.calls.cancel++;const old=mock.state(),next={...old,phase:'cancelled',turns:old.turns.map(turn=>({...turn,phase:'cancelled',error:null}))};mock.emit(next);return next;};await h.render('AiAssistant',props);await h.input(h.label('给 AI 的问题'),'检查安排');await h.click(h.button('生成建议'));assert.match(h.query('.ai-repair-state').textContent,/发现安排冲突/);assert.equal(document.querySelector('.ai-response .ai-error'),null);assert.equal(document.querySelector('[aria-label^="确认应用"]'),null);await h.input(h.label('给 AI 的问题'),'下一轮先保留截止');await h.click(h.button('停止生成'));assert.equal(mock.calls.cancel,1);assert.equal(h.label('给 AI 的问题').value,'下一轮先保留截止');assert.match(h.query('.ai-response').textContent,/建议调整已停止.*已经收到/s);await h.action(()=>finish({...mock.state(),phase:'done'}));assert.match(h.query('.ai-response header').textContent,/已停止/);
 }finally{await h.close();}
});
