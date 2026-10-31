import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import {AiError,type AiConnection,type AiStreamDelta} from '../core/ai-types';
import {chatCompletion,validateAiSettings,type AiFetch} from '../electron/ai-transport';
import {AiSettings,createElectronAiVault,type AiSettingsPersistence,type AiVault} from '../electron/ai-settings';

const connection:AiConnection={baseUrl:'https://models.example/v1',model:'chosen-model',apiKey:'test-secret-never-log'};
const messages=[{role:'user' as const,content:'测试内容'}];
const chunk=(delta:unknown,finish_reason:unknown=null)=>({choices:[{index:0,delta,finish_reason}]});
const frame=(value:unknown)=>`data: ${JSON.stringify(value)}\n\n`;
const response=(wire:string,headers:Record<string,string>={'Content-Type':'text/event-stream'})=>new Response(wire,{headers});
const complete=(text='你好')=>response(frame(chunk({content:text}))+frame(chunk({},'stop'))+'data: [DONE]\n\n');
const errorCode=(code:string)=>(error:unknown)=>error instanceof AiError&&error.code===code;
function memory(){let value:unknown=null,fail=false;return {persistence:{load:()=>value,save:(next:unknown)=>{if(fail)throw Error('SECRET ENOSPC path');value=structuredClone(next);}} as AiSettingsPersistence,value:()=>value,fail:()=>{fail=true;}};}
const vault:AiVault={encrypt:async secret=>'encrypted:'+Buffer.from(secret).toString('base64'),decrypt:async value=>Buffer.from(value.replace('encrypted:',''),'base64').toString()};

test('OpenAI GPT-6 Luna uses supported token and tool parameters, while other providers keep their existing request',async()=>{
 const luna={baseUrl:'https://api.openai.com/v1',model:'gpt-6-luna',apiKey:'fake-test-key'};
 const tools=[{type:'function' as const,function:{name:'propose_changes',description:'Propose',parameters:{type:'object'}}}];
 for(const useTools of [false,true])await chatCompletion(luna,{messages,maxTokens:32,...useTools?{tools}:{}},async(url,init)=>{
  assert.equal(url,'https://api.openai.com/v1/chat/completions');const body=JSON.parse(init.body as string);
  assert.equal(body.max_completion_tokens,32);assert.equal(body.reasoning_effort,'none');assert.equal('max_tokens' in body,false);assert.equal(!!body.tools,useTools);return complete('OK');
 });
 await chatCompletion({...luna,baseUrl:'https://models.example/v1'},{messages,tools},async(_url,init)=>{const body=JSON.parse(init.body as string);assert.equal(body.max_tokens,4096);assert.equal('reasoning_effort' in body,false);return complete();});
});

test('AI validates provider URL, normalizes completion suffix and retains selected model',()=>{
 assert.deepEqual(validateAiSettings({baseUrl:' https://models.example/v1/chat/completions/ ',model:' selected-model ',apiKey:' secret '}),{baseUrl:'https://models.example/v1',model:'selected-model',apiKey:'secret'});
 for(const baseUrl of ['http://models.example','http://localhost.evil.test','http://127.0.0.1.evil.test','http://0.0.0.0:11434','file:///local','https://user:secret@models.example','https://models.example?key=secret','https://models.example#secret','https://models.example/has space'])assert.throws(()=>validateAiSettings({baseUrl,model:'model'}),errorCode('configuration'),baseUrl);
 for(const baseUrl of ['http://localhost:11434/v1','http://127.0.0.1:1234/v1','http://[::1]:8080/v1'])assert.equal(validateAiSettings({baseUrl,model:'local'}).baseUrl,baseUrl);
 assert.throws(()=>validateAiSettings({baseUrl:connection.baseUrl,model:'model',apiKey:'secret\nkey'}),errorCode('configuration'));
});

test('AI settings persist encrypted key on this device and expose only hasKey',async()=>{
 const directory=mkdtempSync(path.resolve('qa-data/ai-settings-')),file=path.join(directory,'ai-config.json');
 const settings=new AiSettings(file,vault);assert.equal(settings.status().configured,false);
 const status=await settings.configure(connection);assert.equal(status.configured,true);assert.equal(status.hasKey,true);
 assert.equal(JSON.stringify(status).includes(connection.apiKey),false);assert.equal('apiKey' in status,false);
 assert.equal(readFileSync(file,'utf8').includes(connection.apiKey),false);
 assert.deepEqual(await new AiSettings(file,vault).connection(),connection);
 await settings.configure({baseUrl:connection.baseUrl,model:'new-model',apiKey:''});assert.equal((await settings.connection()).apiKey,connection.apiKey);
 const cleared=await settings.clearKey();assert.equal(cleared.hasKey,false);assert.equal(cleared.configured,false);
 await assert.rejects(settings.connection(),errorCode('configuration'));
});

test('AI settings do not send an existing credential to another origin',async()=>{
 const m=memory(),settings=new AiSettings('unused',vault,m.persistence);await settings.configure(connection);
 await assert.rejects(settings.configure({baseUrl:'https://another.example/v1',model:'m'}),errorCode('credentials'));
 assert.deepEqual(await settings.connection(),connection);
 await settings.configure({baseUrl:'https://another.example/v1',model:'m',apiKey:'new-secret'});
 assert.equal((await settings.connection()).apiKey,'new-secret');
});

test('AI bad reads, encryption and persistence failures preserve previous configuration',async()=>{
 const m=memory(),settings=new AiSettings('unused',vault,m.persistence);await settings.configure(connection);const before=m.value();
 m.fail();await assert.rejects(settings.configure({...connection,apiKey:'replacement-secret'}),errorCode('storage'));assert.deepEqual(m.value(),before);assert.deepEqual(await settings.connection(),connection);
 const brokenVault={...vault,encrypt:async()=>{throw Error('key=secret');}},next=new AiSettings('unused',brokenVault,{load:()=>before,save:()=>{throw Error('should not save');}});
 await assert.rejects(next.configure({...connection,apiKey:'new'}),errorCode('credentials'));assert.deepEqual(await next.connection(),connection);
 const corrupt=new AiSettings('unused',vault,{load:()=>({baseUrl:'https://example.test',model:'m',encryptedKey:45}),save:()=>{}});assert.equal(corrupt.status().configured,false);assert.ok(corrupt.status().error);
 const directory=mkdtempSync(path.resolve('qa-data/ai-corrupt-')),file=path.join(directory,'ai-config.json');writeFileSync(file,'malformed');assert.ok(new AiSettings(file,vault).status().error);
});

test('AI rejects concurrent saves and never falls back to plaintext encryption',async()=>{
 const m=memory();let resolve:(value:string)=>void=()=>{};
 const settings=new AiSettings('unused',{...vault,encrypt:()=>new Promise(r=>{resolve=r;})},m.persistence);
 const pending=settings.configure(connection);
 await assert.rejects(settings.configure(connection),errorCode('busy'));await assert.rejects(settings.clearKey(),errorCode('busy'));
 resolve(await vault.encrypt(connection.apiKey));await pending;assert.equal(settings.status().configured,true);
 let encryptionCalled=false;
 const protectedVault=createElectronAiVault({isAsyncEncryptionAvailable:async()=>false,encryptStringAsync:async()=>{encryptionCalled=true;return Buffer.from('plain');},decryptStringAsync:async()=>({result:'plain',shouldReEncrypt:false})});
 await assert.rejects(protectedVault.encrypt('key'),errorCode('credentials'));assert.equal(encryptionCalled,false);
});

test('AI async safeStorage adapter handles encryption and decryption without Electron in renderer',async()=>{
 const v=createElectronAiVault({isAsyncEncryptionAvailable:async()=>true,encryptStringAsync:async value=>Buffer.from('cipher:'+value),decryptStringAsync:async value=>({result:value.toString().slice(7),shouldReEncrypt:false})});
 assert.equal(await v.decrypt(await v.encrypt('test-key')),'test-key');
 const m=memory();const settings=new AiSettings('unused',{...vault,decrypt:async()=>{throw Error('private path key');}},m.persistence);await settings.configure(connection);
 await assert.rejects(settings.connection(),error=>errorCode('credentials')(error)&&!String(error).includes('private path'));
});

test('AI local HTTP model can be configured and requested without Authorization',async()=>{
 const m=memory(),settings=new AiSettings('unused',vault,m.persistence);await settings.configure({baseUrl:'http://localhost:11434/v1',model:'local'});assert.equal(settings.status().configured,true);
 await chatCompletion(await settings.connection(),{messages},async(_url,init)=>{assert.equal(new Headers(init.headers).has('Authorization'),false);return complete();});
 await assert.rejects(chatCompletion({...connection,apiKey:''},{messages},async()=>{throw Error('must not request');}),errorCode('credentials'));
});

test('AI test connection sends only a minimal synthetic prompt and never returns the provider text',async()=>{
 const m=memory(),settings=new AiSettings('unused',vault,m.persistence);await settings.configure(connection);
 const result=await settings.test({fetch:async(url,init)=>{assert.equal(url,connection.baseUrl+'/chat/completions');const body=JSON.parse(init.body as string);assert.deepEqual(body.messages,[{role:'user',content:'Reply with OK.'}]);assert.equal(body.max_tokens,32);return complete('provider-text-and-secret');}});
 assert.match(result.message,/未发送任何工作记录/);assert.equal(JSON.stringify(result).includes('provider-text'),false);assert.ok(result.latencyMs>=0);
});

test('AI SSE handles byte-level UTF-8 splits, CRLF, comments, multiple data lines and usage',async()=>{
 const wire=': keepalive\r\n\r\n'+frame(chunk({content:'中文🙂'})).replaceAll('\n','\r\n')+'data: {"choices": [\r\ndata: {"index":0,"delta":{},"finish_reason":"stop"}]}\r\n\r\n'+frame({choices:[],usage:{prompt_tokens:12,completion_tokens:3,total_tokens:15}})+'data: [DONE]\n\n';
 const bytes=new TextEncoder().encode(wire);let offset=0;
 const stream=new ReadableStream<Uint8Array>({pull(controller){if(offset<bytes.length)controller.enqueue(bytes.slice(offset,++offset));else controller.close();}}),deltas:AiStreamDelta[]=[];
 const result=await chatCompletion(connection,{messages,onDelta:delta=>deltas.push(delta)},async(_url,init)=>{assert.equal(init.redirect,'error');assert.equal(new Headers(init.headers).get('Authorization'),`Bearer ${connection.apiKey}`);return new Response(stream,{headers:{'Content-Type':'text/event-stream; charset=utf-8'}});});
 assert.equal(result.text,'中文🙂');assert.equal(deltas.map(d=>d.text??'').join(''),'中文🙂');assert.deepEqual(result.usage,{promptTokens:12,completionTokens:3,totalTokens:15});
});

test('AI SSE assembles interleaved function arguments but never executes them',async()=>{
 const deltas:AiStreamDelta[]=[];
 const wire=frame(chunk({content:'建议如下。',tool_calls:[{index:1,id:'call-b',type:'function',function:{name:'propose_changes',arguments:'{"x":'}},{index:0,id:'call-a',type:'function',function:{name:'propose_',arguments:'{"actions":'}}]}))+frame(chunk({tool_calls:[{index:0,function:{name:'changes',arguments:'[]}'}},{index:1,function:{arguments:'1}'}}]}))+frame(chunk({},'tool_calls'))+'data: [DONE]\n\n';
 const result=await chatCompletion(connection,{messages,tools:[{type:'function',function:{name:'propose_changes',description:'Only proposes changes',parameters:{type:'object'}}}],onDelta:d=>deltas.push(d)},async(_url,init)=>{assert.equal(JSON.parse(init.body as string).tools[0].function.name,'propose_changes');return response(wire);});
 assert.deepEqual(result.toolCalls,[{id:'call-a',name:'propose_changes',arguments:'{"actions":[]}'},{id:'call-b',name:'propose_changes',arguments:'{"x":1}'}]);assert.equal(result.text,'建议如下。');assert.ok(deltas.some(d=>d.toolCall));
});

test('AI accepts JSON-only compatible servers and terminal finish without DONE',async()=>{
 const result=await chatCompletion(connection,{messages},async()=>response(JSON.stringify({choices:[{message:{content:'回答',tool_calls:[{id:'call',type:'function',function:{name:'propose_changes',arguments:'{}'}}]},finish_reason:'tool_calls'}],usage:{total_tokens:10}}),{'Content-Type':'application/json'}));
 assert.equal(result.text,'回答');assert.equal(result.toolCalls.length,1);assert.equal(result.usage?.totalTokens,10);
 assert.equal((await chatCompletion(connection,{messages},async()=>response(frame(chunk({content:'complete'},'stop'))))).text,'complete');
});

test('AI rejects truncated, malformed, empty, filtered and invalid tool responses',async()=>{
 const cases:[string,string][]=[
  [frame(chunk({content:'half'})),'protocol'],[frame(chunk({content:'half'}))+'data: [DONE]\n\n','protocol'],['data: invalid-json\n\n','protocol'],[frame(chunk({content:'cut'},'length')),'limit'],[frame(chunk({},'stop')),'protocol'],[frame(chunk({content:'x'},'content_filter')),'protocol'],[frame(chunk({tool_calls:[{index:0,function:{name:'unsafe-name!',arguments:'{}'}}]},'tool_calls')),'protocol'],[frame(chunk({tool_calls:[{index:50,id:'x',function:{name:'f',arguments:'{}'}}]},'tool_calls')),'protocol'],[frame({error:{message:connection.apiKey}}),'unavailable'],
 ];
 for(const [wire,code] of cases)await assert.rejects(chatCompletion(connection,{messages},async()=>response(wire)),error=>errorCode(code)(error)&&!String(error).includes(connection.apiKey));
 await assert.rejects(chatCompletion(connection,{messages},async()=>response('secret html',{'Content-Type':'text/html'})),errorCode('protocol'));
});

test('AI limits request, content-length and streamed response size',async()=>{
 await assert.rejects(chatCompletion(connection,{messages:[{role:'user',content:'x'.repeat(100001)}]},async()=>{throw Error('must not send');}),errorCode('limit'));
 await assert.rejects(chatCompletion(connection,{messages},async()=>response('ignored',{'Content-Type':'text/event-stream','Content-Length':'999999'})),errorCode('limit'));
 await assert.rejects(chatCompletion(connection,{messages},async()=>response(frame(chunk({content:'x'.repeat(200001)},'stop')))),errorCode('limit'));
 await assert.rejects(chatCompletion(connection,{messages},async()=>response(':'+ 'x'.repeat(512001))),errorCode('limit'));
});

test('AI HTTP, network and callback errors never expose secret provider details',async()=>{
 for(const [status,code] of [[401,'authentication'],[403,'authentication'],[429,'rate_limit'],[400,'configuration'],[404,'configuration'],[500,'unavailable'],[302,'connection']] as const){await assert.rejects(chatCompletion(connection,{messages},async()=>new Response(connection.apiKey,{status})),error=>errorCode(code)(error)&&!String(error).includes(connection.apiKey));}
 await assert.rejects(chatCompletion(connection,{messages},async()=>{throw Error(connection.apiKey);}),error=>errorCode('connection')(error)&&!String(error).includes(connection.apiKey));
 await assert.rejects(chatCompletion(connection,{messages,onDelta:()=>{throw Error(connection.apiKey);}},async()=>complete()),error=>errorCode('connection')(error)&&!String(error).includes(connection.apiKey));
});

test('AI cancellation and timeout finish even when the underlying transport never settles',async()=>{
 const controller=new AbortController();let observed:AbortSignal|undefined;
 const pending=chatCompletion(connection,{messages,signal:controller.signal},async(_url,init)=>{observed=init.signal as AbortSignal;return new Promise<Response>(()=>{});});
 controller.abort();await assert.rejects(pending,errorCode('cancelled'));assert.equal(observed?.aborted,true);
 await assert.rejects(chatCompletion(connection,{messages,timeoutMs:15},async()=>new Promise<Response>(()=>{})),errorCode('timeout'));
 let called=false;await assert.rejects(chatCompletion(connection,{messages,signal:AbortSignal.abort()},async()=>{called=true;return complete();}),errorCode('cancelled'));assert.equal(called,false);
});

test('AI cancellation closes a stalled SSE body and does not emit later deltas',async()=>{
 let cancelled=false;const controller=new AbortController(),deltas:AiStreamDelta[]=[];
 const stream=new ReadableStream<Uint8Array>({start(c){c.enqueue(new TextEncoder().encode(frame(chunk({content:'部分'}))));},cancel(){cancelled=true;}});
 const pending=chatCompletion(connection,{messages,signal:controller.signal,onDelta:delta=>{deltas.push(delta);controller.abort();}},async()=>new Response(stream,{headers:{'Content-Type':'text/event-stream'}}));
 await assert.rejects(pending,errorCode('cancelled'));assert.equal(cancelled,true);assert.equal(deltas.length,1);
});

test('AI cancellation suppresses subsequent callbacks within one frame and closes a late response',async()=>{
 const controller=new AbortController(),deltas:AiStreamDelta[]=[];
 await assert.rejects(chatCompletion(connection,{messages,signal:controller.signal,onDelta:d=>{deltas.push(d);controller.abort();}},async()=>response(frame(chunk({content:'first',tool_calls:[{index:0,id:'call',function:{name:'propose_changes',arguments:'{}'}}]},'tool_calls')))),errorCode('cancelled'));
 assert.equal(deltas.length,1);
 let deliver:(response:Response)=>void=()=>{},cancelled=false;
 const lateAbort=new AbortController(),pending=chatCompletion(connection,{messages,signal:lateAbort.signal},()=>new Promise(r=>{deliver=r;}));
 lateAbort.abort();await assert.rejects(pending,errorCode('cancelled'));
 deliver(new Response(new ReadableStream({cancel(){cancelled=true;}}),{headers:{'Content-Type':'text/event-stream'}}));
 await new Promise(resolve=>setTimeout(resolve,0));assert.equal(cancelled,true);
});
