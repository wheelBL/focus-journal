import {AiError,type AiModelListResult} from '../core/ai-types';
import {isLoopback,validateAiModelInput,type AiFetch} from './ai-transport';
const MAX_BYTES=2_000_000,MAX_MODELS=5000;
/** Read only the first bounded provider page. Never follow provider-supplied links. */
export async function fetchAiModels(input:{baseUrl:string;apiKey:string},options:{fetch?:AiFetch;signal?:AbortSignal;timeoutMs?:number}={}):Promise<AiModelListResult>{
 const {baseUrl,apiKey=''}=validateAiModelInput(input);if(!apiKey&&!isLoopback(new URL(baseUrl)))throw new AiError('credentials','请填写该服务的访问密钥。');
 const timeoutMs=options.timeoutMs??15000;if(!Number.isInteger(timeoutMs)||timeoutMs<1||timeoutMs>300000)throw new AiError('configuration','模型查询超时设置无效。');
 const controller=new AbortController();let timedOut=false,reader:ReadableStreamDefaultReader<Uint8Array>|undefined;
 const cancel=()=>controller.abort();options.signal?.addEventListener('abort',cancel,{once:true});if(options.signal?.aborted)cancel();
 const timer=setTimeout(()=>{timedOut=true;controller.abort();},timeoutMs);
 const stopped=()=>new AiError(timedOut?'timeout':'cancelled',timedOut?'模型列表查询超时，请稍后重试。':'已取消模型列表查询。');
 let rejectAbort:(error:AiError)=>void=()=>{};const aborted=new Promise<never>((_,reject)=>{rejectAbort=reject;});
 const onAbort=()=>{void reader?.cancel().catch(()=>{});rejectAbort(stopped());};controller.signal.addEventListener('abort',onAbort,{once:true});if(controller.signal.aborted)onAbort();
 try{return await Promise.race([aborted,(async()=>{
  if(controller.signal.aborted)throw stopped();const response=await (options.fetch??fetch)(baseUrl+'/models',{method:'GET',headers:{Accept:'application/json',...apiKey?{Authorization:`Bearer ${apiKey}`}:{}} ,redirect:'error',signal:controller.signal});
  if(controller.signal.aborted){void response.body?.cancel().catch(()=>{});throw stopped();}
  if(!response.ok){void response.body?.cancel().catch(()=>{});if(response.status===401||response.status===403)throw new AiError('authentication','服务拒绝了模型列表访问，请检查密钥与权限。');if(response.status===429)throw new AiError('rate_limit','模型列表请求达到限制，请稍后重试。');if(response.status===404)throw new AiError('configuration','未找到模型列表接口，请检查服务地址。');throw new AiError('unavailable','无法读取模型列表，请检查服务地址后重试。');}
  if(!/application\/(?:[\w.+-]*\+)?json/i.test(response.headers.get('content-type')??'')||!response.body){void response.body?.cancel().catch(()=>{});throw new AiError('protocol','服务未返回可识别的模型列表。');}
  const length=Number(response.headers.get('content-length'));if(Number.isFinite(length)&&length>MAX_BYTES){void response.body.cancel().catch(()=>{});throw new AiError('limit','模型列表响应过大，请联系服务提供方。');}
  reader=response.body.getReader();let size=0,text='';const decoder=new TextDecoder('utf-8',{fatal:true});
  for(;;){const part=await reader.read();if(controller.signal.aborted)throw stopped();if(part.done){text+=decoder.decode();break;}size+=part.value.byteLength;if(size>MAX_BYTES)throw new AiError('limit','模型列表响应过大，请联系服务提供方。');text+=decoder.decode(part.value,{stream:true});}
  let result:any;try{result=JSON.parse(text);}catch{throw new AiError('protocol','服务未返回可识别的模型列表。');}
  if(!result||typeof result!=='object'||Array.isArray(result)||!Array.isArray(result.data)||result.has_more!==undefined&&typeof result.has_more!=='boolean')throw new AiError('protocol','服务未返回可识别的模型列表。');
  let partial=result.has_more===true||result.data.length>=MAX_MODELS;const models=new Set<string>();
  for(const model of result.data.slice(0,MAX_MODELS)){if(!model||typeof model!=='object'||Array.isArray(model)||typeof model.id!=='string'||!model.id.trim()||model.id!==model.id.trim()||model.id.length>200||/[\x00-\x1f\x7f]/.test(model.id))throw new AiError('protocol','服务返回了无效的模型名称。');if(apiKey&&model.id.includes(apiKey)){partial=true;continue;}models.add(model.id);}
  return {baseUrl,models:[...models].sort((a,b)=>a<b?-1:a>b?1:0),partial};
 })()]);}catch(error){if(error instanceof AiError)throw error;if(controller.signal.aborted)throw stopped();throw new AiError('connection','无法连接模型列表服务，请检查网络和服务地址。');}
 finally{clearTimeout(timer);options.signal?.removeEventListener('abort',cancel);controller.signal.removeEventListener('abort',onAbort);if(reader)void reader.cancel().catch(()=>{});}
}
