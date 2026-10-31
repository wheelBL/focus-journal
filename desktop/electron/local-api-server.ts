import {createServer,type IncomingMessage,type ServerResponse} from 'node:http';
import {createHash,randomUUID,timingSafeEqual} from 'node:crypto';
import {controlCommand,controlCommands,controlOpenApi,ControlInputError} from '../core/control-api';
import {emptyFilter,filterOutline,validateFilter} from '../core/filters';
import {condition,group,withRules} from '../core/filter-rules';
import {outlineIndex,outlinePath} from '../core/outline';
import {itemSorter} from '../core/item-order';
import {blockedReason,estimateProgress} from '../core/item-state';
import {day} from '../core/validation';
import {localDate,sessionMsOnDate,type Task,type Snapshot} from '../core/types';
import type {JournalService} from '../core/service';
import type {LocalApiAccess} from '../core/local-api-types';
import {ApiSyncJobs,ApiSyncError,type ApiSyncTarget} from './local-api-sync';

export class HttpError extends Error {constructor(public status:number,public code:string,message:string){super(message);}}
interface Options {service:JournalService;port:number;token:()=>string;access:()=>LocalApiAccess;changed:()=>void;version:string;sync?:ApiSyncTarget;audit?:(entry:Record<string,unknown>)=>void}
export interface RunningLocalApi {port:number;close():void}
const fail=(status:number,code:string,message:string):never=>{throw new HttpError(status,code,message);};
const object=(value:unknown):Record<string,unknown>=>{if(!value||typeof value!=='object'||Array.isArray(value))return fail(400,'invalid_request','请求应为 JSON 对象。');return value as Record<string,unknown>;};
const integer=(value:unknown,fallback:number,max:number)=>{if(value===undefined||value===null)return fallback;const n=Number(value);if(!Number.isInteger(n)||n<0||n>max)return fail(400,'invalid_pagination','分页参数无效。');return n;};
const hash=(value:string)=>createHash('sha256').update(value).digest();
const fingerprint=(value:unknown):string=>JSON.stringify(value&&typeof value==='object'&&!Array.isArray(value)?Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>[k,JSON.parse(fingerprint(v))])):Array.isArray(value)?value.map(v=>JSON.parse(fingerprint(v))):value);
async function readBody(req:IncomingMessage){
 if(req.headers['content-type']?.split(';')[0].trim()!=='application/json')return fail(415,'json_required','请使用 application/json。');
 return new Promise<unknown>((resolve,reject)=>{
  let bytes=0;const parts:Buffer[]=[];
  const clear=()=>{req.off('data',data);req.off('end',end);req.off('aborted',aborted);req.off('error',aborted);};
  const aborted=()=>{clear();reject(new HttpError(400,'incomplete_request','请求未完整接收。'));};
  const data=(raw:Buffer)=>{bytes+=raw.length;if(bytes>65536){clear();req.resume();reject(new HttpError(413,'body_too_large','请求不能超过 64 KiB。'));}else parts.push(raw);};
  const end=()=>{clear();try{resolve(JSON.parse(Buffer.concat(parts).toString('utf8')));}catch{reject(new HttpError(400,'invalid_json','JSON 格式无效。'));}};
  req.on('data',data);req.once('end',end);req.once('aborted',aborted);req.once('error',aborted);
 });
}

/** Loopback-only transport. Domain state and the UI share one JournalService instance. */
export async function startLocalApi(options:Options):Promise<RunningLocalApi>{
 const epoch=randomUUID(),replays=new Map<string,{hash:string;body:Record<string,unknown>;status:number}>(),sync=new ApiSyncJobs(options.sync);
 let active=true,port=options.port;
 const revision=(s:Snapshot)=>`${epoch}:${s.revision??0}`;
 const base=()=>`http://127.0.0.1:${port}/v1`;
 const send=(res:ServerResponse,status:number,value:unknown,rev?:string)=>{if(res.destroyed)return;res.statusCode=status;if(rev)res.setHeader('ETag',`"${rev}"`);res.end(JSON.stringify(value));};
 const envelope=(s:Snapshot,data:unknown)=>({revision:revision(s),now:s.now,data});
 const ensureActive=()=>{if(!active)fail(503,'api_stopped','接口已关闭，请重新连接。');};
 const server=createServer({maxHeaderSize:8192,requestTimeout:15000,headersTimeout:5000},async(req,res)=>{
  res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
  try{
   ensureActive();
   if(req.headers.host!==`127.0.0.1:${port}`)fail(403,'invalid_host','请使用设置中显示的本机地址。');
   if(req.headers.origin!==undefined||req.headers['sec-fetch-site']!==undefined)fail(403,'browser_origin_denied','本接口供本机客户端使用，不接受网页跨来源调用。');
   const auth=req.headers.authorization??'',expected=options.token();
   if(!expected||!auth.startsWith('Bearer ')||!timingSafeEqual(hash(auth.slice(7)),hash(expected)))fail(401,'unauthorized','访问密钥无效或未提供。');
   if(!req.url||req.url.length>2048)fail(400,'invalid_url','请求地址无效。');
   const url=new URL(req.url!,base()),path=url.pathname,params=url.searchParams;
   const listParams=(allowed:string[])=>{for(const key of params.keys())if(!allowed.includes(key)||params.getAll(key).length>1)fail(400,'invalid_query',`查询参数 ${key.slice(0,40)} 不受支持或重复。`);};
   const page=(values:unknown[],offsetValue:unknown=params.get('offset'),limitValue:unknown=params.get('limit'))=>{
    const offset=integer(offsetValue,0,10000000),limit=integer(limitValue,100,200);if(limit<1)fail(400,'invalid_pagination','limit 应为 1 至 200。');
    return {items:values.slice(offset,offset+limit),total:values.length,offset,limit,nextOffset:offset+limit<values.length?offset+limit:null};
   };
   const summarize=(s:Snapshot,filter:ReturnType<typeof emptyFilter>,offset?:unknown,limit?:unknown)=>{
    const index=outlineIndex(s.state),matched=filterOutline(s.state,filter,s.now,null,index).matches;
    const items=itemSorter(index,filter.sort??'smart',s.now,false)(index.ordered.filter(n=>matched.has(n.id))).map(n=>{
     const t=n.record as Task,stats=index.stats.get(n.id)!;
     return {...t,tagNames:(t.tagIds??[]).map(id=>s.state.tags.find(tag=>tag.id===id)?.name??''),ownEffortMs:stats.ownMs,branchEffortMs:stats.totalMs,blockedReason:blockedReason(index,t.id)};
    });
    return page(items,offset,limit);
   };
   if(req.method==='POST'&&['/v1/commands','/v1/sync/run','/v1/sync/resolve'].includes(path)){
    listParams([]);
    if(options.access()!=='write')fail(403,'read_only','当前接口只允许读取；请在应用设置中开启允许修改。');
    const key=req.headers['idempotency-key'],match=req.headers['if-match'];
    if(typeof key!=='string'||!/^[A-Za-z0-9._-]{8,120}$/.test(key))fail(428,'idempotency_key_required','写操作需提供 8 至 120 位唯一 Idempotency-Key。');
    if(typeof match!=='string')fail(428,'revision_required','写操作需提供最近读取的 If-Match 修订号。');
    const input=await readBody(req);ensureActive();
    // Recheck access and token after waiting for the body; settings may have changed.
    if(options.access()!=='write')fail(403,'read_only','当前接口只允许读取。');
    if(!timingSafeEqual(hash(auth.slice(7)),hash(options.token())))fail(401,'unauthorized','访问密钥已更新。');
    const digest=hash(path+':'+fingerprint(input)).toString('hex'),cached=replays.get(key as string);
    if(cached){if(cached.hash!==digest)fail(409,'idempotency_conflict','此请求键已经用于不同操作。');send(res,cached.status,{...cached.body,replayed:true},cached.body.revision as string);return;}
    const before=options.service.snapshot(),current=revision(before);
    if((match as string).replace(/^"|"$/g,'')!==current)throw new HttpError(412,'revision_conflict','数据已变化，请重新读取并核对后再操作。');
    if(path.startsWith('/v1/sync/')){
     const action=path.endsWith('/run')?'run':'resolve',operation=sync.start(action,input,before);
     const body={...envelope(before,{operation,operationUrl:`${base()}/sync/operations/${operation.id}`}),requestId:key,replayed:false};
     replays.set(key as string,{hash:digest,body,status:202});if(replays.size>1000)replays.delete(replays.keys().next().value!);
     try{options.audit?.({at:before.now,requestId:key,type:`sync.${action}`,operationId:operation.id,choice:action==='resolve'?(input as {choice:string}).choice:undefined});}catch{/* Acceptance is already recorded. */}
     send(res,202,body,current);return;
    }
    let command:ReturnType<typeof controlCommand>;
    try{command=controlCommand(input,before);}catch(e){if(e instanceof ControlInputError)throw new HttpError(400,'invalid_command',e.message);throw e;}
    let after:Snapshot;
    try{after=options.service.execute({...command,meta:{source:'api',entry:'api.command',version:options.version}});}catch(e){
     const message=e instanceof Error?e.message:'操作未保存。';
     if(/SQLITE|ENOENT|EACCES|EPERM|ENOSPC|[A-Za-z]:\\|\.sqlite|stack/i.test(message))throw new HttpError(500,'storage_error','操作未保存，请检查应用中的数据与磁盘状态。');
     throw new HttpError(422,'domain_error',message.slice(0,500));
    }
    const changes=(name:'tasks'|'sessions')=>{const old=new Map(before.state[name].map(v=>[v.id,JSON.stringify(v)]));return {created:after.state[name].filter(v=>!old.has(v.id)).map(v=>v.id),changed:after.state[name].filter(v=>old.get(v.id)!==JSON.stringify(v)).map(v=>v.id)};};
    const items=changes('tasks'),sessions=changes('sessions');
    const body={...envelope(after,{createdItemIds:items.created,changedItemIds:items.changed,createdSessionIds:sessions.created,changedSessionIds:sessions.changed,removedSessionIds:before.state.sessions.filter(r=>!after.state.sessions.some(s=>s.id===r.id)).map(r=>r.id),notices:[after.focusReminder,after.itemNotice].filter(Boolean)}),requestId:key,replayed:false};
    replays.set(key as string,{hash:digest,body,status:200});if(replays.size>1000)replays.delete(replays.keys().next().value!);
    // A UI/audit notification failure must not turn a committed write into an apparent failure.
    try{options.changed();}catch{/* The next workspace refresh reads the committed state. */}
    try{options.audit?.({at:after.now,requestId:key,type:(input as {type:string}).type,changedItemIds:items.changed,changedSessionIds:sessions.changed});}catch{/* Do not retry an already committed command. */}
    send(res,200,body,revision(after));return;
   }
   const s=options.service.snapshot();let data:unknown;
   if(req.method==='POST'&&path==='/v1/items/query'){
    const input=object(await readBody(req));ensureActive();if(!timingSafeEqual(hash(auth.slice(7)),hash(options.token())))fail(401,'unauthorized','访问密钥已更新。');for(const key of Object.keys(input))if(!['filter','offset','limit'].includes(key))fail(400,'invalid_request','筛选请求字段无效。');
    try{data=summarize(s,validateFilter(input.filter,s.state),input.offset,input.limit);}catch(e){if(e instanceof HttpError)throw e;throw new HttpError(400,'invalid_filter',e instanceof Error?e.message:'筛选条件无效。');}
   }else if(req.method==='GET'){
    if(path==='/v1/status'){listParams([]);data={application:'专注记',appVersion:options.version,apiVersion:'v1',access:options.access(),localDate:localDate(s.now),timezone:Intl.DateTimeFormat().resolvedOptions().timeZone,commands:Object.fromEntries(Object.entries(controlCommands).map(([key,d])=>[key,d.description]))};}
    else if(path==='/v1/openapi.json'){listParams([]);send(res,200,controlOpenApi(base()));return;}
    else if(path==='/v1/items'){
     listParams(['query','status','focus','scopeId','viewId','offset','limit']);
     const saved=params.get('viewId')?s.state.views.find(v=>v.id===params.get('viewId')):undefined;
     if(params.has('viewId')&&!saved)fail(404,'view_not_found','视图不存在。');
     let f=saved?structuredClone(saved.filter):withRules(emptyFilter(),group([condition('status','is','open')]));
     if(params.has('query'))f.query=params.get('query')!;
     if(params.has('scopeId'))f.scopeId=params.get('scopeId');
     if(saved&&['status','focus'].some(key=>params.has(key)))fail(400,'invalid_query','使用保存视图时不要同时覆盖状态或重点条件。');
     if(!saved){const rules=[];const status=params.get('status')??'open';if(!['open','done','cancelled','handed-off','all'].includes(status))fail(400,'invalid_query','status 应为 open、done、cancelled、handed-off 或 all。');if(status!=='all')rules.push(condition('status','is',status));if(params.has('focus')){if(params.get('focus')!=='today')fail(400,'invalid_query','focus 仅支持 today。');rules.push(condition('focusDate','period','today'));}f=withRules(f,group(rules));}
     try{f=validateFilter(f,s.state);}catch{fail(400,'invalid_filter','范围或查询条件无效。');}data=summarize(s,f,params.get('offset'),params.get('limit'));
    }else if(/^\/v1\/items\/[^/]+$/.test(path)){
     listParams([]);let id:string;try{id=decodeURIComponent(path.slice('/v1/items/'.length));}catch{fail(400,'invalid_id','事项 ID 无效。');}
     const task=s.state.tasks.find(t=>t.id===id);if(!task)fail(404,'item_not_found','事项不存在。');
     const index=outlineIndex(s.state);data={item:task,path:outlinePath(index,id!).map(n=>({id:n.id,title:n.title})),childIds:(index.children.get(id!)??[]).map(n=>n.id),effort:index.stats.get(id!),estimate:task!.itemType==='note'||task!.itemType==='event'?null:estimateProgress(s.state,id!),estimates:s.state.estimates.filter(e=>e.taskId===id),reviews:s.state.reviews.filter(r=>r.taskId===id),blockedReason:blockedReason(index,id!)};
    }else if(path==='/v1/timers'){listParams([]);data={timers:s.timers,rest:s.state.settings.rest??null,breakUntil:s.state.settings.breakUntil};}
    else if(path==='/v1/sessions'){
     listParams(['taskId','from','to','offset','limit','deleted']);if(params.has('deleted')&&!['true','false'].includes(params.get('deleted')!))fail(400,'invalid_filter','deleted 应为 true 或 false。');const from=params.get('from'),to=params.get('to');
     try{if(from)day(from);if(to)day(to);}catch{fail(400,'invalid_date','from/to 应为有效的 YYYY-MM-DD。');}
     if(from&&to&&from>to)fail(400,'invalid_date','结束日期不能早于开始日期。');
     const taskId=params.get('taskId');let sessions=(params.get('deleted')==='true'?s.state.deletedSessions:s.state.sessions).filter(r=>!taskId||r.taskId===taskId);
     // Segment dates, rather than session start alone, preserve cross-midnight effort.
     sessions=sessions.filter(r=>{const dates=new Set([r.date,...r.segments.flatMap(seg=>[localDate(seg.start),localDate(seg.end)])]);if(!from&&!to)return true;if([...dates].some(d=>(!from||d>=from)&&(!to||d<=to)&&sessionMsOnDate(r,d)>0))return true;return !!from&&sessionMsOnDate(r,from)>0||!!to&&sessionMsOnDate(r,to)>0;});
     data=page(sessions.sort((a,b)=>(b.start??b.date).localeCompare(a.start??a.date)));
    }else if(path==='/v1/tags'){listParams([]);data=s.state.tags;}
    else if(path==='/v1/views'){listParams([]);data=s.state.views;}
    else if(path==='/v1/sync/status'){listParams([]);data=sync.status();}
    else if(/^\/v1\/sync\/operations\/[a-f0-9-]{36}$/.test(path)){listParams([]);data=sync.get(path.slice('/v1/sync/operations/'.length));}
    else fail(404,'not_found','接口不存在。');
   }else fail(404,'not_found','接口不存在或请求方法不支持。');
   send(res,200,envelope(s,data),revision(s));
  }catch(e){
   const error=e instanceof HttpError||e instanceof ApiSyncError?e:new HttpError(500,'internal_error','接口请求未完成，请检查应用状态。');
   if(error.status===401)res.setHeader('WWW-Authenticate','Bearer');
   send(res,error.status,{error:{code:error.code,message:error.message}});
  }
 });
 server.keepAliveTimeout=2000;server.maxConnections=32;
 await new Promise<void>((resolve,reject)=>{server.once('error',reject);server.listen(options.port,'127.0.0.1',()=>{server.removeListener('error',reject);resolve();});});
 port=(server.address() as {port:number}).port;
 return {port,close:()=>{active=false;server.close();server.closeAllConnections();replays.clear();}};
}
