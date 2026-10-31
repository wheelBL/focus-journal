import {app,BrowserWindow} from 'electron';
import {createServer,type ServerResponse} from 'node:http';
import {existsSync,readFileSync,writeFileSync,unlinkSync} from 'node:fs';
import path from 'node:path';
import type {Socket} from 'node:net';
import type {Snapshot} from '../core/types';

/** Real preload/controller/UI, one loopback model fixture, and an isolated journal only. */
export async function checkAiUi({win,js,click,button,key,input,capture,check,settle,until,service}:any){
 const start:Snapshot=service.snapshot();
 check(start.demo===true,'AI 原生验证仅使用独立示例工作区');
 const target=start.state.tasks.find(t=>t.id!=='inbox'&&t.status==='open'&&!t.deletedAt&&!t.archived&&t.itemType!=='note'&&t.itemType!=='event'&&!t.isProject);
 if(!target)throw Error('AI QA fixture needs an open actionable item.');
 const priorDescription=target.description??'',nextDescription=`${priorDescription.slice(0,1800)}\nAI 原生验证：确认后更新说明。`.trim();
 const configFile=path.join(app.getPath('userData'),'ai-config.json'),previousConfig=existsSync(configFile)?readFileSync(configFile):null;
 const fakeKey='qa-ai-loopback-key-not-a-real-provider-key',model='qa-ui-model';
 const sockets=new Set<Socket>(),held=new Set<ServerResponse>(),requests:{kind:'test'|'generate'|'cancel';body:any;authorized:boolean}[]=[],serverErrors:string[]=[];
 let releaseSuggestion:(()=>void)|null=null,cancelMode=false,cancelObserved=false,settingsWritten=false;
 const delay=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
 const waitFor=async(predicate:()=>boolean,label:string)=>{for(let i=0;i<100;i++){if(predicate())return;await delay(40);}throw Error(label);};
 const send=(response:ServerResponse,delta:unknown,finish:string|null=null)=>response.write(`data: ${JSON.stringify({choices:[{index:0,delta,finish_reason:finish}]})}\n\n`);
 const finish=(response:ServerResponse,reason='stop')=>{send(response,{},reason);response.end('data: [DONE]\n\n');held.delete(response);};
 const server=createServer((request,response)=>{
  let body='';request.setEncoding('utf8');request.on('data',chunk=>{body+=chunk;if(body.length>120_000)request.destroy();});request.on('error',()=>{});
  request.on('end',()=>{try{
   if(request.method!=='POST'||request.url!=='/v1/chat/completions')throw Error('Unexpected mock AI route.');
   const parsed=JSON.parse(body),kind=!parsed.tools?'test':cancelMode?'cancel':'generate';
   requests.push({kind,body:parsed,authorized:request.headers.authorization===`Bearer ${fakeKey}`});
   response.writeHead(200,{'Content-Type':'text/event-stream; charset=utf-8','Cache-Control':'no-cache'});response.flushHeaders();held.add(response);
   response.on('close',()=>{held.delete(response);if(kind==='cancel'&&!response.writableEnded)cancelObserved=true;});
   if(kind==='test'){send(response,{content:'OK'});finish(response);return;}
   if(kind==='cancel'){send(response,{content:'这是一段用于停止验证的部分建议，尚未修改任何事项。'});return;}
   send(response,{content:'已阅读所选范围。先预览一条说明调整，由你决定是否应用。\n<img src=x onerror=alert(1)> 是纯文本示例。'});
   releaseSuggestion=()=>{
    if(response.destroyed||response.writableEnded)return;
    const plan={summary:'将本次验证说明附在现有事项上，保持层级、日期和投入不变。',changes:[{reason:'验证确认前保持记录原样，确认后只修改这一项说明。',command:{type:'outline.patch',payload:{id:target.id,field:'description',value:nextDescription}}}]};
    const args=JSON.stringify(plan),middle=Math.floor(args.length/2);
    send(response,{tool_calls:[{index:0,id:'qa-proposal-1',type:'function',function:{name:'propose_changes',arguments:args.slice(0,middle)}}]});
    send(response,{tool_calls:[{index:0,function:{arguments:args.slice(middle)}}]});finish(response,'tool_calls');
   };
  }catch(error){serverErrors.push(error instanceof Error?error.message:'Mock AI request failed.');response.statusCode=400;response.end();}});
 });
 server.on('connection',socket=>{sockets.add(socket);socket.on('close',()=>sockets.delete(socket));});
 const journalContent=(snapshot:Snapshot)=>JSON.stringify({revision:snapshot.revision,tasks:snapshot.state.tasks,projects:snapshot.state.projects,notes:snapshot.state.notes,estimates:snapshot.state.estimates,reviews:snapshot.state.reviews,tags:snapshot.state.tags,views:snapshot.state.views,deletedSessions:snapshot.state.deletedSessions,sessions:snapshot.state.sessions.map(record=>record.status==='ended'?record:{id:record.id,taskId:record.taskId,start:record.start,status:record.status,targetMinutes:record.targetMinutes,targetOffsetMs:record.targetOffsetMs,manual:record.manual,summary:record.summary}),settings:snapshot.state.settings});
 let priorAppearance:any=null;
 try{
  await new Promise<void>((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',()=>{server.off('error',reject);resolve();});});
  const address=server.address();if(!address||typeof address==='string')throw Error('Loopback model did not get a port.');
  const baseUrl=`http://127.0.0.1:${address.port}/v1`;
  const secondary=new BrowserWindow({show:false,width:640,height:480,webPreferences:{preload:path.resolve('dist-electron/preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true,offscreen:true}});
  try{
   await secondary.loadURL(win.webContents.getURL());
   const access=await secondary.webContents.executeJavaScript(`(async()=>{try{if(!window.journalAI)return {allowed:false,message:'AI preload missing'};await window.journalAI.status();return {allowed:true};}catch(error){return {allowed:false,message:error.message};}})()`);
   if(access.allowed||!access.message?.includes('无效的 AI 请求'))throw Error('AI secondary-window permission check: '+JSON.stringify(access));
   check(!access.allowed&&access.message.includes('无效的 AI 请求'),'AI 同源非主窗口不能读取主窗口专属设置接口');
  }finally{secondary.destroy();}
  priorAppearance=await js('window.journalAppearance.get()');
  await click('[aria-label="设置"]');await until(`!!document.querySelector('#settings-nav-ai')`);await click('#settings-nav-ai');await until(`!!document.querySelector('#settings-ai [aria-label="AI 服务地址"]')&&!document.querySelector('#settings-ai fieldset').disabled`);
  const baseline=journalContent(service.snapshot());
  await input('[aria-label="AI 服务地址"]',baseUrl);await input('[aria-label="AI 模型"]',model);await input('[aria-label="AI API 密钥"]',fakeKey);settingsWritten=true;await button('保存 AI 设置','#settings-ai');
  await until(`document.querySelector('#settings-ai .ai-success')?.textContent.includes('设置已保存')`);
  check(await js(`document.querySelector('[aria-label="AI API 密钥"]').value===''`),'AI 真实设置保存后不回填密钥');
  const disk=readFileSync(configFile,'utf8'),saved=JSON.parse(disk);
  check(saved.baseUrl===baseUrl&&saved.model===model&&typeof saved.encryptedKey==='string'&&saved.encryptedKey.length>0&&!disk.includes(fakeKey),'AI 独立配置仅保存加密密钥，无明文');
  await button('测试已保存连接','#settings-ai');await until(`document.querySelector('#settings-ai .ai-success')?.textContent.includes('连接成功')`);
  const probe=requests.find(request=>request.kind==='test');
  check(!!probe&&probe.authorized&&probe.body.model===model&&JSON.stringify(probe.body.messages)===JSON.stringify([{role:'user',content:'Reply with OK.'}])&&!probe.body.tools,'AI 连接测试只发送 OK 探针，不发送工作记录');
  check(journalContent(service.snapshot())===baseline,'AI 连接配置与测试不改变事项或投入');
  await js(`window.journalAppearance.set({theme:'light',motion:'reduce'})`);await settle();await capture('20-ai-settings-light');
  await click('.top-navigation [aria-label="事项"]');await button('全部事项','.context-nav');await input('[aria-label="在事项树中搜索"]',target.title);
  const selector=`[data-outline-id="${target.id}"]`;await until(`!!document.querySelector(${JSON.stringify(selector)})`);await click(selector+' .tree-title>.editable-value');
  if(!await js(`!!document.querySelector('.task-inspector')`))await button('详情','.outline-tools');
  await click('.inspector-more-actions > button');await button('AI 帮我梳理','.task-inspector');await until(`document.querySelector('[aria-label="AI 分析范围"]')?.value==='item'&&!!document.querySelector('.ai-context')`);
  await click('[aria-label="AI 分析范围"]');await key('End');await key('Up');await key('Enter');await until(`document.querySelector('.ai-context summary')?.textContent.includes('最近 7 天')`);
  await click('[aria-label="AI 分析范围"]');await key('Home');await key('Enter');await until(`document.querySelector('[aria-label="AI 分析范围"]').value==='item'&&document.querySelector('.ai-context')?.textContent.includes(${JSON.stringify(target.title)})`);
  await click('.ai-context summary');check(await js(`document.querySelector('.ai-context').open&&document.querySelector('.ai-context li')?.textContent.includes(${JSON.stringify(target.title)})`),'AI 原生范围选择与发送清单可展开核对');
  await input('[aria-label="给 AI 的问题"]','请整理所选事项，提出一条说明修改供我确认。');
  const beforeGenerate=journalContent(service.snapshot());await button('生成建议','.ai-assistant');
  await until(`document.querySelector('.ai-response-text')?.textContent.includes('先预览一条说明调整')`);
  check(await js(`document.querySelector('.ai-response-text').textContent.includes('<img src=x')&&!document.querySelector('.ai-response img')&&document.querySelector('[aria-label="给 AI 的问题"]').readOnly`),'AI 真实 SSE 逐步呈现纯文本，生成时保护问题输入');
  check(journalContent(service.snapshot())===beforeGenerate,'AI 流式生成期间不修改工作记录');
  await waitFor(()=>!!releaseSuggestion,'Mock model did not receive the generation request.');(releaseSuggestion as (()=>void)|null)?.();
  await until(`!!document.querySelector('[aria-label="确认应用 修改说明"]')&&!document.querySelector('[aria-label="确认应用 修改说明"]').disabled`);
  const generated=requests.find(request=>request.kind==='generate');
  check(!!generated&&generated.authorized&&generated.body.tools?.[0]?.function?.name==='propose_changes'&&generated.body.messages[1].content.includes(target.id),'AI 范围与建议工具经真实预加载桥接发送至本机兼容服务');
  check(journalContent(service.snapshot())===beforeGenerate&&await js(`document.querySelector('.ai-change').textContent.includes('修改前')&&document.querySelector('.ai-change').textContent.includes('修改后')&&!!document.querySelector('.ai-suggestion-reason')`),'AI 建议先展示目标、修改前后与理由，记录仍未改变');
  await capture('21-ai-proposal-light');await js(`window.journalAppearance.set({theme:'dark',motion:'reduce'})`);await settle();await capture('22-ai-proposal-dark');
  const proposal=await js('window.journalAI.get()');await click('[aria-label="确认应用 修改说明"]');await until(`!!document.querySelector('.ai-applied')`);
  check(service.snapshot().state.tasks.find((task:any)=>task.id===target.id)?.description===nextDescription,'AI 逐条确认后才通过原业务命令更新事项');
  const afterApply=journalContent(service.snapshot());await js(`window.journalAI.apply(${JSON.stringify({runId:proposal.id,suggestionId:proposal.suggestions[0].id})})`);
  check(journalContent(service.snapshot())===afterApply&&await js(`!document.querySelector('[aria-label="确认应用 修改说明"]')`),'AI 已应用建议不再呈现确认入口，重复确认不会重复写入');await capture('23-ai-applied-dark');
  cancelMode=true;await input('[aria-label="给 AI 的问题"]','验证停止生成，保留已经收到的文本。');await button('生成建议','.ai-assistant');await until(`document.querySelector('.ai-response-text')?.textContent.includes('用于停止验证')`);
  const beforeCancel=journalContent(service.snapshot());await button('停止生成','.ai-assistant');await until(`document.querySelector('.ai-response header')?.textContent.includes('已停止')`);await waitFor(()=>cancelObserved,'Cancelling did not close the pending loopback stream.');
  check(cancelObserved&&journalContent(service.snapshot())===beforeCancel&&await js(`document.querySelector('.ai-response-text').textContent.includes('用于停止验证')`),'AI 停止操作中断实际网络流，保留文本且不修改记录');await capture('24-ai-cancelled-dark');
  await click('dialog[aria-label="AI 助手"] [aria-label="关闭"]');await until(`!document.querySelector('dialog[aria-label="AI 助手"]')`);await click('.sidebar-bottom [aria-label="AI 助手"]');await until(`document.querySelector('.ai-response-text')?.textContent.includes('用于停止验证')`);
  check(await js(`document.querySelector('.ai-response header').textContent.includes('已停止')`),'AI 关闭重开从控制器恢复停止后的结果');await click('dialog[aria-label="AI 助手"] [aria-label="关闭"]');
  check(serverErrors.length===0&&requests.filter(request=>request.kind==='test').length===1&&requests.filter(request=>request.kind==='generate').length===1&&requests.filter(request=>request.kind==='cancel').length===1,'AI 原生流程只访问预期的三次本机模型请求');
 }finally{
  // The helper owns only this loopback fixture and its temporary QA connection.
  try{await js('window.journalAI.cancel()');}catch{}
  try{if(await js(`!!document.querySelector('dialog[aria-label="AI 助手"]')`))await click('dialog[aria-label="AI 助手"] [aria-label="关闭"]');}catch{}
  try{if(settingsWritten)await js('window.journalAI.clearKey()');}catch{}
  for(const response of held)response.destroy();for(const socket of sockets)socket.destroy();
  if(server.listening)await new Promise<void>(resolve=>server.close(()=>resolve()));
  if(settingsWritten){if(previousConfig)writeFileSync(configFile,previousConfig);else if(existsSync(configFile))unlinkSync(configFile);}
  const current=service.snapshot().state.tasks.find((task:any)=>task.id===target.id);if(current?.description===nextDescription){service.execute({type:'outline.patch',payload:{id:target.id,field:'description',value:priorDescription}});if(!win.isDestroyed())win.webContents.send('journal:changed');}
  try{if(priorAppearance)await js(`window.journalAppearance.set(${JSON.stringify(priorAppearance)})`);}catch{}
  try{if(await js(`!!document.querySelector('[aria-label="清除搜索"]')`))await click('[aria-label="清除搜索"]');}catch{}
 }
}
