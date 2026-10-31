import {AiError,type AiCompletion,type AiCompletionRequest,type AiConnection,type AiSettingsInput,type AiToolCall,type AiUsage} from '../core/ai-types';

const MAX_REQUEST_CHARS=100_000,MAX_RESPONSE_BYTES=512_000,MAX_OUTPUT_CHARS=200_000,MAX_TOOL_CALLS=40;
export type AiFetch=(input:string,init:RequestInit)=>Promise<Response>;
export function isLoopback(url:URL):boolean{return url.hostname==='localhost'||url.hostname==='[::1]'||/^127(?:\.\d{1,3}){3}$/.test(url.hostname);}

/** Deliberately accepts a provider base path (e.g. /v1), not arbitrary request URLs. */
export function validateAiSettings(value:unknown):AiSettingsInput {
 const v=value as AiSettingsInput;
 if(!v||typeof v.baseUrl!=='string'||typeof v.model!=='string'||(v.apiKey!==undefined&&typeof v.apiKey!=='string'))throw new AiError('configuration','请填写 AI 服务地址和模型名称。');
 const raw=v.baseUrl.trim();let url:URL;
 try{url=new URL(raw);}catch{throw new AiError('configuration','请输入完整的 AI 服务地址，例如 https://api.deepseek.com。');}
 if(raw.length>2048||/\s|[\x00-\x1f\x7f]/.test(raw)||url.username||url.password||raw.includes('?')||raw.includes('#')||!['http:','https:'].includes(url.protocol)||(url.protocol==='http:'&&!isLoopback(url)))throw new AiError('configuration','服务地址需使用 HTTPS；本机模型可用 localhost、127.0.0.1 或 [::1] 的 HTTP 地址。地址中不要包含密钥、参数或账号。');
 let pathname=url.pathname.replace(/\/+$/,'');
 if(pathname.endsWith('/chat/completions'))pathname=pathname.slice(0,-'/chat/completions'.length);
 const baseUrl=url.origin+pathname;
 const model=v.model.trim(),apiKey=v.apiKey?.trim();
 if(!model||model.length>200||/[\x00-\x1f\x7f]/.test(model))throw new AiError('configuration','请输入有效的模型名称（最多 200 个字符）。');
 if(apiKey!==undefined&&(apiKey.length>4096||/[\s\x00-\x1f\x7f]/.test(apiKey)))throw new AiError('configuration','访问密钥格式无效，请重新粘贴。');
 return {baseUrl,model,...apiKey!==undefined?{apiKey}:{}};
}

function requestBody(connection:AiConnection,request:AiCompletionRequest){
 if(!Array.isArray(request.messages)||!request.messages.length||request.messages.length>100||request.messages.some(m=>!m||!['system','user','assistant'].includes(m.role)||typeof m.content!=='string'))throw new AiError('configuration','AI 请求内容无效，请缩小范围后重试。');
 if(request.tools&&(request.tools.length>10||request.tools.some(t=>t?.type!=='function'||!t.function||!/^[-a-zA-Z0-9_]{1,64}$/.test(t.function.name)||typeof t.function.description!=='string'||!t.function.parameters||typeof t.function.parameters!=='object'||Array.isArray(t.function.parameters))))throw new AiError('configuration','AI 工具定义无效。');
 const maxTokens=request.maxTokens??4096;
 if(!Number.isInteger(maxTokens)||maxTokens<1||maxTokens>16384)throw new AiError('configuration','AI 输出长度设置无效。');
 let body:string;
 const openAiGpt6=new URL(connection.baseUrl).hostname==='api.openai.com'&&/^gpt-6(?:[.-]|$)/i.test(connection.model);
 try{body=JSON.stringify({model:connection.model,messages:request.messages,stream:true,...openAiGpt6?{max_completion_tokens:maxTokens,reasoning_effort:'none'}:{max_tokens:maxTokens},...request.tools?.length?{tools:request.tools,tool_choice:'auto'}:{}});}catch{throw new AiError('configuration','AI 请求内容无法序列化。');}
 if(body.length>MAX_REQUEST_CHARS)throw new AiError('limit','发送内容过多，请缩小事项或日期范围后重试。');
 return body;
}
function statusError(status:number):AiError{
 if(status===401||status===403)return new AiError('authentication','AI 服务拒绝了访问，请检查密钥和模型权限。');
 if(status===429)return new AiError('rate_limit','AI 服务暂时达到请求或额度限制，请稍后重试并检查服务余额。');
 if(status===404)return new AiError('configuration','未找到 AI 接口或模型，请检查服务地址和模型名称。');
 if(status===400||status===422)return new AiError('configuration','AI 服务不接受此请求，请检查模型名称及 Chat Completions 兼容性。');
 if(status>=300&&status<400)return new AiError('connection','AI 地址发生重定向，请直接填写服务的最终 HTTPS 地址。');
 return new AiError('unavailable','AI 服务暂时不可用，请稍后重试。');
}
function usageOf(value:unknown):AiUsage|undefined{
 const v=value as Record<string,unknown>|undefined;if(!v||typeof v!=='object')return undefined;
 const result:AiUsage={};for(const [source,key] of [['prompt_tokens','promptTokens'],['completion_tokens','completionTokens'],['total_tokens','totalTokens']] as const){const n=v[source];if(typeof n==='number'&&Number.isSafeInteger(n)&&n>=0)result[key]=n;}
 return Object.keys(result).length?result:undefined;
}
const protocolError=()=>new AiError('protocol','AI 返回了不完整或无法识别的内容，请重试；工作记录未修改。');

/** Provider output is data only. This transport cannot execute any journal command. */
export async function chatCompletion(connection:AiConnection,request:AiCompletionRequest,fetchImpl:AiFetch=fetch):Promise<AiCompletion>{
 const normalized=validateAiSettings(connection),config={...normalized,apiKey:normalized.apiKey??''};
 if(!config.apiKey&&!isLoopback(new URL(config.baseUrl)))throw new AiError('credentials','请先在 AI 设置中保存访问密钥。');
 const body=requestBody(config,request),timeoutMs=request.timeoutMs??120_000;
 if(!Number.isInteger(timeoutMs)||timeoutMs<1||timeoutMs>300_000)throw new AiError('configuration','AI 超时设置无效。');
 const controller=new AbortController();let timedOut=false,reader:ReadableStreamDefaultReader<Uint8Array>|undefined;
 const cancel=()=>controller.abort();request.signal?.addEventListener('abort',cancel,{once:true});if(request.signal?.aborted)cancel();
 const timer=setTimeout(()=>{timedOut=true;controller.abort();},timeoutMs);
 // The race also cancels an injected/non-compliant stream that ignores fetch's signal.
 let rejectAbort:(error:AiError)=>void=()=>{};
 const abortPromise=new Promise<never>((_,reject)=>{rejectAbort=reject;});
 const aborted=()=>{void reader?.cancel().catch(()=>{});rejectAbort(new AiError(timedOut?'timeout':'cancelled',timedOut?'AI 响应超时，请稍后重试或缩小范围。':'已停止 AI 请求；工作记录未修改。'));};
 controller.signal.addEventListener('abort',aborted,{once:true});if(controller.signal.aborted)aborted();
 try{
  return await Promise.race([abortPromise,(async()=>{
   if(controller.signal.aborted)throw new AiError('cancelled','已停止 AI 请求；工作记录未修改。');
   const response=await fetchImpl(config.baseUrl+'/chat/completions',{method:'POST',headers:{'Content-Type':'application/json',Accept:'text/event-stream, application/json',...config.apiKey?{Authorization:`Bearer ${config.apiKey}`}:{}} ,body,signal:controller.signal,redirect:'error'});
   if(controller.signal.aborted){void response.body?.cancel().catch(()=>{});throw new AiError('cancelled','已停止 AI 请求；工作记录未修改。');}
   if(!response.ok){void response.body?.cancel().catch(()=>{});throw statusError(response.status);}
   if(!response.body)throw protocolError();
   const length=Number(response.headers.get('content-length'));if(Number.isFinite(length)&&length>MAX_RESPONSE_BYTES){void response.body.cancel().catch(()=>{});throw new AiError('limit','AI 返回内容过多，请缩小范围后重试。');}
   const contentType=response.headers.get('content-type')??'';
   const isJson=/application\/(?:[\w.+-]*\+)?json/i.test(contentType),isSse=/text\/event-stream/i.test(contentType);
   if(!isJson&&!isSse){void response.body.cancel().catch(()=>{});throw protocolError();}
   reader=response.body.getReader();const decoder=new TextDecoder('utf-8',{fatal:true});
   let bytes=0,text='',finishReason='',usage:AiUsage|undefined,seenChoice=false,done=false,buffer='',eventData:string[]=[];
   const calls=new Map<number,AiToolCall>();
   const emit=(delta:import('../core/ai-types').AiStreamDelta)=>{if(controller.signal.aborted)throw new AiError('cancelled','已停止 AI 请求；工作记录未修改。');request.onDelta?.(delta);if(controller.signal.aborted)throw new AiError('cancelled','已停止 AI 请求；工作记录未修改。');};
   const limit=()=>{if(text.length+[...calls.values()].reduce((sum,c)=>sum+c.arguments.length+c.name.length+c.id.length,0)>MAX_OUTPUT_CHARS)throw new AiError('limit','AI 返回内容过多，请缩小范围后重试。');};
   const append=(chunk:unknown,whole=false)=>{
    if(!chunk||typeof chunk!=='object'||Array.isArray(chunk))throw protocolError();
    const value=chunk as Record<string,any>;if(value.error)throw new AiError('unavailable','AI 服务未完成响应，请稍后重试。');
    const nextUsage=usageOf(value.usage);if(nextUsage)usage=nextUsage;
    if(!Array.isArray(value.choices))throw protocolError();
    for(const choice of value.choices){
     if(choice?.index!==undefined&&choice.index!==0)continue;
     if(!choice||typeof choice!=='object')throw protocolError();seenChoice=true;
     const delta=whole?choice.message:choice.delta;
     if(delta!==undefined){
      if(!delta||typeof delta!=='object'||Array.isArray(delta))throw protocolError();
      if(delta.content!==undefined&&delta.content!==null){if(typeof delta.content!=='string')throw protocolError();if(delta.content){text+=delta.content;limit();emit({text:delta.content});}}
      if(delta.tool_calls!==undefined){
       if(!Array.isArray(delta.tool_calls))throw protocolError();
       for(const [position,call] of delta.tool_calls.entries()){
        const index=whole?position:call?.index;
        if(!Number.isInteger(index)||index<0||index>=MAX_TOOL_CALLS||!call||typeof call!=='object'||call.type!==undefined&&call.type!=='function')throw protocolError();
        let current=calls.get(index);if(!current){current={id:'',name:'',arguments:''};calls.set(index,current);}
        const fn=call.function;if(fn!==undefined&&(!fn||typeof fn!=='object'||Array.isArray(fn)))throw protocolError();
        for(const part of [call.id,fn?.name,fn?.arguments])if(part!==undefined&&typeof part!=='string')throw protocolError();
        if(call.id){if(current.id&&current.id!==call.id)throw protocolError();current.id=call.id;}
        if(fn?.name)current.name+=fn.name;
        if(fn?.arguments)current.arguments+=fn.arguments;
        limit();emit({toolCall:{index,...call.id?{id:call.id}:{},...fn?.name?{name:fn.name}:{},...fn?.arguments?{arguments:fn.arguments}:{}}});
       }
      }
     }
     if(choice.finish_reason!==undefined&&choice.finish_reason!==null){if(typeof choice.finish_reason!=='string')throw protocolError();finishReason=choice.finish_reason;}
    }
   };
   const dispatch=()=>{
    if(!eventData.length)return;const data=eventData.join('\n');eventData=[];
    if(data.trim()==='[DONE]'){done=true;return;}
    let chunk:unknown;try{chunk=JSON.parse(data);}catch{throw protocolError();}append(chunk);
   };
   const lines=(final=false)=>{
    while(!done){let index=buffer.search(/[\r\n]/);if(index<0)break;if(buffer[index]==='\r'&&index===buffer.length-1&&!final)break;
     const line=buffer.slice(0,index),skip=buffer[index]==='\r'&&buffer[index+1]==='\n'?2:1;buffer=buffer.slice(index+skip);
     if(line==='')dispatch();else if(line.startsWith('data:'))eventData.push(line.slice(5).replace(/^ /,''));
    }
    if(final&&!done){if(buffer.startsWith('data:'))eventData.push(buffer.slice(5).replace(/^ /,''));buffer='';dispatch();}
   };
   while(!done){
    const part=await reader.read();if(controller.signal.aborted)throw new AiError('cancelled','已停止 AI 请求；工作记录未修改。');
    if(part.done){buffer+=decoder.decode();if(isSse)lines(true);break;}
    bytes+=part.value.byteLength;if(bytes>MAX_RESPONSE_BYTES)throw new AiError('limit','AI 返回内容过多，请缩小范围后重试。');
    buffer+=decoder.decode(part.value,{stream:true});if(isSse)lines();
   }
   if(isJson){let result:unknown;try{result=JSON.parse(buffer);}catch{throw protocolError();}append(result,true);}
   if(!seenChoice||!finishReason)throw protocolError();
   if(finishReason==='length')throw new AiError('limit','AI 输出达到长度限制，请缩小范围后重新生成。');
   if(finishReason==='content_filter')throw new AiError('protocol','AI 服务未能完成这次回答，请调整请求后重试。');
   if(!['stop','tool_calls'].includes(finishReason))throw protocolError();
   const toolCalls=[...calls.entries()].sort(([a],[b])=>a-b).map(([,call])=>call);
   if(toolCalls.some(call=>!call.id||!/^[-a-zA-Z0-9_]{1,64}$/.test(call.name)||!call.arguments)||new Set(toolCalls.map(c=>c.id)).size!==toolCalls.length||!text.trim()&&!toolCalls.length)throw protocolError();
   return {text,toolCalls,finishReason,...usage?{usage}:{}};
  })()]);
 }catch(error){
  if(error instanceof AiError)throw error;
  if(controller.signal.aborted)throw new AiError(timedOut?'timeout':'cancelled',timedOut?'AI 响应超时，请稍后重试或缩小范围。':'已停止 AI 请求；工作记录未修改。');
  if(error instanceof SyntaxError||error instanceof TypeError&&/encoded data|encoding/i.test(error.message))throw protocolError();
  throw new AiError('connection','无法连接 AI 服务，请检查地址、网络或代理设置后重试。');
 }finally{
  clearTimeout(timer);request.signal?.removeEventListener('abort',cancel);controller.signal.removeEventListener('abort',aborted);
  void reader?.cancel().catch(()=>{});try{reader?.releaseLock();}catch{/* A cancelled read may still be settling. */}
  controller.abort();
 }
}
