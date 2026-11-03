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

test('AI assistant previews a bounded scope, streams plain text and applies nothing before explicit confirmation',async()=>{
 const mock=mockBridge(),h=await aiDom(mock.bridge);let finish;try{
  mock.bridge.generate=input=>{mock.calls.generate.push(input);return new Promise(resolve=>{finish=resolve;});};
  await h.render('AiAssistant',{itemId:'one',onClose(){},onSettings(){}});assert.equal(h.label('AI 分析范围').value,'item');assert.match(h.query('.ai-context').textContent,/2 个事项.*3 条投入记录/);assert.match(h.query('.ai-limit').textContent,/限量/);assert.match(h.query('.ai-context').textContent,/核对版本/);
  await h.click(h.button('拆解下一步'));assert.match(h.label('给 AI 的问题').value,/第一步/);await h.click(h.button('生成建议'));await h.key(h.label('给 AI 的问题'),'Enter',{ctrlKey:true});assert.equal(mock.calls.generate.length,1);assert.equal(h.label('给 AI 的问题').readOnly,true);
  const partial={id:'run-1',phase:'running',text:'第一条建议\n<img src=x onerror=alert(1)>',error:null,context:preview,suggestions:[suggestion]};await h.action(()=>mock.emit(partial));assert.match(h.query('.ai-response-text').textContent,/<img src=x/);assert.equal(h.query('.ai-response').querySelector('img'),null);assert.equal(h.label('确认应用 明确事项名称').disabled,true);assert.equal(mock.calls.apply.length,0);
  const done={...partial,phase:'done',text:`${partial.text}\n再核对发布说明。`};await h.action(()=>{mock.emit(done);finish(done);});assert.equal(h.label('确认应用 明确事项名称').disabled,false);assert.match(h.query('.ai-change').textContent,/修改前.*整理发布记录.*修改后.*整理本次/s);assert.match(h.query('.ai-suggestion-reason').textContent,/减少查找/);assert.equal(mock.calls.apply.length,0);
  let reject,calls=0;const real=mock.bridge.apply;mock.bridge.apply=()=>{calls++;return new Promise((_,r)=>{reject=r;});};await h.click(h.label('确认应用 明确事项名称'));await h.click(h.label('确认应用 明确事项名称'));assert.equal(calls,1);assert.equal(h.query('dialog').getAttribute('aria-busy'),'true');assert.match(h.query('.ai-suggestion header').textContent,/正在应用/);
  await h.action(()=>reject(Error('事项已变化，请重新生成')));assert.match(h.query('.ai-suggestion [role=alert]').textContent,/事项已变化/);assert.equal(h.label('确认应用 明确事项名称').disabled,false);
  mock.bridge.apply=real;await h.click(h.label('确认应用 明确事项名称'));assert.deepEqual(mock.calls.apply,[{runId:'run-1',suggestionId:'suggestion-1'}]);assert.match(h.query('.ai-applied').textContent,/已应用/);assert.equal(document.querySelector('[aria-label="确认应用 明确事项名称"]'),null);
 }finally{await h.close();}
});

test('AI generation errors keep the prompt, cancellation keeps partial output and reopening reads controller results',async()=>{
 const mock=mockBridge(),h=await aiDom(mock.bridge);let closed=0;const props={onClose:()=>{closed++;},onSettings(){}};try{
  await h.render('AiAssistant',props);await h.input(h.label('AI 分析范围'),'recent');assert.equal(mock.calls.context.at(-1).kind,'recent');await h.input(h.label('给 AI 的问题'),'帮我总结本周推进');
  mock.bridge.generate=async()=>{throw Error('服务暂不可用');};await h.click(h.button('生成建议'));assert.match(h.query('.ai-error').textContent,/服务暂不可用/);assert.equal(h.label('给 AI 的问题').value,'帮我总结本周推进');assert.ok(h.button('重试生成'));
  mock.bridge.generate=async()=>{const next={id:'run-2',phase:'running',text:'已经完成了版本验证',error:null,context:preview,suggestions:[]};mock.emit(next);return next;};await h.click(h.button('重试生成'));await h.click(h.button('停止生成'));assert.equal(mock.calls.cancel,1);assert.match(h.query('.ai-response-text').textContent,/版本验证/);assert.match(h.query('.ai-response header').textContent,/已停止/);
  await h.click(h.button('重试生成'));await h.click(h.label('关闭'));assert.equal(closed,1);assert.equal(mock.calls.cancel,2);await h.render(null);await h.render('AiAssistant',props);assert.match(h.query('.ai-response-text').textContent,/版本验证/);assert.match(h.query('.ai-response header').textContent,/已停止/);
 }finally{await h.close();}
});

test('AI assistant offers configuration and handles a failed scope preview without sending records',async()=>{
 const mock=mockBridge();mock.setStatus({hasKey:false,configured:false});const h=await aiDom(mock.bridge);let settings=0;try{
  mock.bridge.context=async()=>{throw Error('事项范围暂不可用');};await h.render('AiAssistant',{onClose(){},onSettings:()=>{settings++;}});assert.ok(h.button('打开 AI 设置'));assert.equal(h.button('生成建议').disabled,true);assert.match(h.query('.ai-error').textContent,/事项范围/);assert.ok(h.button('重新读取范围'));await h.click(h.button('打开 AI 设置'));assert.equal(settings,1);assert.equal(mock.calls.generate.length,0);
 }finally{await h.close();}
});

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

test('AI surfaces explain desktop availability when the scoped bridge is absent',async()=>{
 const h=await aiDom(undefined);try{
  await h.render('AiAssistant',{onClose(){},onSettings(){}});assert.match(h.query('.ai-unavailable').textContent,/正式桌面版/);assert.equal(document.querySelector('[aria-label="给 AI 的问题"]'),null);await h.render('AiSettings');assert.match(h.query('.ai-unavailable').textContent,/正式桌面版/);assert.equal(document.querySelector('input[type=password]'),null);
 }finally{await h.close();}
});

test('AI questions and scope survive closing and suggestions append without discarding authored text',async()=>{
 const mock=mockBridge(),h=await aiDom(mock.bridge),props={onClose(){},onSettings(){}};try{
  await h.render('AiAssistant',props);await h.input(h.label('给 AI 的问题'),'我自己的问题：先分析依赖');await h.input(h.label('AI 分析范围'),'recent');await h.click(h.button('拆解下一步'));
  const prompt=h.label('给 AI 的问题').value;assert.match(prompt,/^我自己的问题：先分析依赖\n\n/);assert.match(prompt,/第一步/);assert.equal(mock.calls.generate.length,0);
  await h.click(h.label('关闭'));await h.render(null);await h.render('AiAssistant',props);assert.equal(h.label('给 AI 的问题').value,prompt);assert.equal(h.label('AI 分析范围').value,'recent');
  await h.render(null);await h.render('AiAssistant',{...props,itemId:'different-item'});assert.equal(h.label('给 AI 的问题').value,'');assert.equal(h.label('AI 分析范围').value,'item');
  const saved=JSON.parse(window.localStorage.getItem('journal.ai-question-drafts.v1'));assert.ok(saved.some(([,draft])=>draft.prompt===prompt&&draft.scope.kind==='recent'));assert.ok(saved.length<=24);assert.ok(saved.every(([,draft])=>Object.keys(draft).sort().join(',')==='prompt,scope'));
 }finally{await h.close();}
});

test('AI suggestions never truncate a question that is already at the input limit',async()=>{
 const mock=mockBridge(),h=await aiDom(mock.bridge);try{
  await h.render('AiAssistant',{onClose(){},onSettings(){}});const text='记'.repeat(4000);await h.input(h.label('给 AI 的问题'),text);await h.click(h.button('整理事项'));
  assert.equal(h.label('给 AI 的问题').value,text);assert.match(h.query('.ai-error').textContent,/4000.*已有内容已保留/);assert.equal(mock.calls.generate.length,0);
 }finally{await h.close();}
});

test('all items are sent only after explicitly choosing that scope',async()=>{
 const mock=mockBridge(),h=await aiDom(mock.bridge);try{
  await h.render('AiAssistant',{onClose(){},onSettings(){}});assert.equal(h.label('AI 分析范围').value,'today');
  await h.input(h.label('AI 分析范围'),'all');assert.equal(mock.calls.context.at(-1).kind,'all');await h.input(h.label('给 AI 的问题'),'整理所有事项');await h.click(h.button('生成建议'));
  assert.equal(mock.calls.generate.at(-1).scope.kind,'all');
 }finally{await h.close();}
});

function conversationBridge(initial){
 const mock=mockBridge();let sequence=0;
 if(initial)mock.emit(initial);
 mock.bridge.generate=async input=>{mock.calls.generate.push(input);const old=mock.state(),same=old.scope?.kind===input.scope.kind&&old.scope?.itemId===input.scope.itemId,turns=same?(old.turns??[]).map(turn=>({...turn,suggestions:turn.suggestions.map(s=>s.state==='pending'?{...s,state:'historical'}:s)})):[],id=`turn-${++sequence}`,suggestions=sequence===1?[{...suggestion},{...suggestion,id:'old-pending',label:'此前未确认'}]:[{...suggestion,id:`new-${sequence}`,label:'安排事项审视'}],turn={id,scope:input.scope,prompt:input.prompt,phase:'done',text:`回答：${input.prompt}`,error:null,context:preview,suggestions};
  mock.emit({...turn,conversationId:same?old.conversationId:`conversation-${sequence}`,turns:[...turns,turn]});return mock.state();};
 mock.bridge.apply=async input=>{mock.calls.apply.push(input);const old=mock.state(),suggestions=old.suggestions.map(s=>s.id===input.suggestionId?{...s,state:'applied'}:s);mock.emit({...old,suggestions,turns:old.turns.map(turn=>turn.id===old.id?{...turn,suggestions}:turn)});return mock.state();};
 mock.bridge.cancel=async()=>{mock.calls.cancel++;const old=mock.state();mock.emit({...old,phase:'cancelled',turns:(old.turns??[]).map(turn=>turn.id===old.id?{...turn,phase:'cancelled'}:turn)});return mock.state();};
 mock.bridge.reset=async()=>{mock.calls.reset=(mock.calls.reset??0)+1;mock.emit({...empty,conversationId:'new-conversation',scope:null,turns:[]});return mock.state();};
 return mock;
}

test('follow-up keeps ordered requests and answers, clears sent text, and makes superseded pending proposals read-only',async()=>{
 const mock=conversationBridge(),h=await aiDom(mock.bridge);try{
  await h.render('AiAssistant',{onClose(){},onSettings(){}});await h.input(h.label('给 AI 的问题'),'先分析逾期事项');await h.click(h.button('生成建议'));assert.equal(h.label('给 AI 的问题').value,'');assert.match(h.query('.ai-user-message').textContent,/先分析逾期事项/);await h.click(h.label('确认应用 明确事项名称'));
  await h.input(h.label('给 AI 的问题'),'保留原事项，改为安排审视');await h.click(h.button('继续对话'));assert.equal(mock.calls.generate.length,2);assert.deepEqual(mock.calls.generate[1],{scope:{kind:'today'},prompt:'保留原事项，改为安排审视'});assert.equal(document.querySelectorAll('.ai-turn').length,2);assert.match([...document.querySelectorAll('.ai-user-message')].map(el=>el.textContent).join('|'),/先分析逾期事项.*保留原事项，改为安排审视/);assert.match(h.query('.ai-applied').textContent,/已应用/);assert.match(h.query('.ai-historical').textContent,/历史建议/);assert.equal(document.querySelector('[aria-label="确认应用 此前未确认"]'),null);assert.ok(h.label('确认应用 安排事项审视'));assert.equal(h.label('给 AI 的问题').value,'');assert.match(h.label('给 AI 的问题').placeholder,/继续补充/);
 }finally{await h.close();}
});

test('scope changes explain the new conversation and prevent applying a prior scope proposal',async()=>{
 const mock=conversationBridge(),h=await aiDom(mock.bridge);try{
  await h.render('AiAssistant',{onClose(){},onSettings(){}});await h.input(h.label('给 AI 的问题'),'今日事项');await h.click(h.button('生成建议'));assert.ok(h.label('确认应用 明确事项名称'));await h.input(h.label('AI 分析范围'),'recent');assert.match(h.query('.ai-scope-change').textContent,/开始新对话.*不发送上一范围/);assert.equal(document.querySelector('[aria-label="确认应用 明确事项名称"]'),null);assert.equal(mock.calls.apply.length,0);
  await h.click(h.button('安排审视'));assert.match(h.label('给 AI 的问题').value,/item-review.configure.*item-review.defer/);assert.match(h.label('给 AI 的问题').value,/不要创建.*收件箱任务/);await h.click(h.button('生成建议'));assert.equal(mock.calls.generate.at(-1).scope.kind,'recent');assert.equal(document.querySelectorAll('.ai-turn').length,1);assert.doesNotMatch(h.query('.ai-transcript').textContent,/回答：今日事项/);assert.match(h.query('.ai-conversation-notice').textContent,/上一范围的对话不会发送/);
 }finally{await h.close();}
});

test('reopening with a new bridge restores backend conversation and bounded authored draft without executable historical plans',async()=>{
 const mock=conversationBridge(),h=await aiDom(mock.bridge),props={onClose(){},onSettings(){}};try{
  await h.render('AiAssistant',props);await h.input(h.label('给 AI 的问题'),'分析当前记录');await h.click(h.button('生成建议'));await h.input(h.label('给 AI 的问题'),'尚未发送的补充');const saved=mock.state();await h.render(null);
  const restarted={...saved,suggestions:saved.suggestions.map(s=>({...s,state:'historical'})),turns:saved.turns.map(turn=>({...turn,suggestions:turn.suggestions.map(s=>({...s,state:'historical'}))})),historyError:'历史文件暂时不可写，本轮仅保留在内存'};const replacement=conversationBridge(restarted);window.journalAI=replacement.bridge;await h.render('AiAssistant',props);assert.equal(h.label('给 AI 的问题').value,'尚未发送的补充');assert.match(h.query('.ai-transcript').textContent,/分析当前记录/);assert.equal(document.querySelector('[aria-label^="确认应用"]'),null);assert.match(h.query('.ai-error').textContent,/仅保留在内存/);assert.ok(h.button('继续对话'));
 }finally{await h.close();}
});

test('reset failures retain the draft, and a stopped old response cannot overwrite a new conversation',async()=>{
 const mock=conversationBridge(),h=await aiDom(mock.bridge);let finish;try{
  await h.render('AiAssistant',{onClose(){},onSettings(){}});await h.input(h.label('给 AI 的问题'),'不能丢失的问题');const reset=mock.bridge.reset;mock.bridge.reset=async()=>{throw Error('无法开始新对话');};await h.click(h.button('新对话'));assert.equal(h.label('给 AI 的问题').value,'不能丢失的问题');assert.match(h.query('.ai-error').textContent,/无法开始新对话/);mock.bridge.reset=reset;
  const old={id:'slow',conversationId:'slow-chat',scope:{kind:'today'},phase:'running',text:'部分内容',error:null,context:preview,suggestions:[],turns:[{id:'slow',scope:{kind:'today'},prompt:'不能丢失的问题',phase:'running',text:'部分内容',error:null,context:preview,suggestions:[]}]};mock.bridge.generate=input=>{mock.calls.generate.push(input);mock.emit(old);return new Promise(resolve=>{finish=resolve;});};
  await h.click(h.button('生成建议'));assert.equal(h.button('新对话').disabled,true);await h.click(h.button('停止生成'));assert.match(h.query('.ai-transcript').textContent,/部分内容/);await h.click(h.button('新对话'));assert.equal(document.querySelectorAll('.ai-turn').length,0);assert.equal(h.label('给 AI 的问题').value,'');await h.input(h.label('给 AI 的问题'),'新对话草稿');await h.action(()=>finish({...old,phase:'done',text:'迟到的回答'}));assert.equal(document.querySelectorAll('.ai-turn').length,0);assert.equal(h.label('给 AI 的问题').value,'新对话草稿');
 }finally{await h.close();}
});

test('the assistant links to the existing item-review workspace without creating a task',async()=>{
 const mock=conversationBridge(),h=await appDom();try{
  window.journalAI=mock.bridge;await h.mount();await h.click(h.label('AI 助手'));await h.click(h.button('打开事项审视'));assert.equal(document.querySelector('dialog[open]'),null);assert.equal(window.sessionStorage.getItem('review-tab'),'items');assert.equal(h.query('[data-review-tab="items"]').getAttribute('aria-selected'),'true');assert.equal(h.service.snapshot().state.tasks.length,1);assert.equal(mock.calls.generate.length,0);
 }finally{await h.close();}
});

test('closing waits for stop and retains the conversation and question if cancellation fails',async()=>{
 const running={id:'closing',conversationId:'closing-chat',scope:{kind:'today'},phase:'running',text:'已收到的部分内容',error:null,context:preview,suggestions:[],turns:[{id:'closing',scope:{kind:'today'},prompt:'需要保留的问题',phase:'running',text:'已收到的部分内容',error:null,context:preview,suggestions:[]}]},mock=conversationBridge(running),h=await aiDom(mock.bridge);let closed=0,reject;try{
  await h.render('AiAssistant',{onClose(){closed++;},onSettings(){}});const cancel=mock.bridge.cancel;mock.bridge.cancel=()=>new Promise((_,no)=>{reject=no;});await h.click(h.label('关闭'));assert.equal(closed,0);await h.action(()=>reject(Error('停止请求暂未完成')));assert.equal(closed,0);assert.match(h.query('.ai-error').textContent,/停止请求暂未完成/);assert.match(h.query('.ai-transcript').textContent,/需要保留的问题.*已收到的部分内容/s);
  mock.bridge.cancel=cancel;await h.click(h.label('关闭'));assert.equal(closed,1);assert.equal(mock.state().phase,'cancelled');
 }finally{await h.close();}
});

test('conversation history and context are separate from the always-reachable composer, preserving authored focus during updates',async()=>{
 const mock=conversationBridge(),h=await aiDom(mock.bridge);try{
  await h.render('AiAssistant',{onClose(){},onSettings(){}});await h.input(h.label('给 AI 的问题'),'第一问');await h.click(h.button('生成建议'));await h.input(h.label('给 AI 的问题'),'第二问');await h.click(h.button('继续对话'));
  const pane=h.label('AI 对话记录'),composer=h.query('.ai-compose'),question=h.label('给 AI 的问题'),options=h.query('.ai-compose-context');
  assert.equal(pane.parentElement,composer.parentElement);assert.equal(pane.contains(question),false);assert.equal(pane.tabIndex,0);assert.equal(options.contains(question),false);assert.equal(options.contains(h.query('.ai-compose-actions')),false);assert.equal(composer.contains(question),true);assert.equal(composer.contains(h.query('.ai-compose-actions')),true);
  await h.input(question,'仍在输入的追问');await h.action(()=>{question.focus();question.setSelectionRange(2,5);});const next=mock.state();next.turns.at(-1).text+='\n补充说明';next.text=next.turns.at(-1).text;await h.action(()=>mock.emit(next));assert.equal(document.activeElement,question);assert.equal(question.value,'仍在输入的追问');assert.equal(question.selectionStart,2);assert.equal(question.selectionEnd,5);
 }finally{await h.close();}
});
