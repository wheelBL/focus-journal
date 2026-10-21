import fs from 'node:fs';
import https from 'node:https';
import * as git from 'isomorphic-git';
import {MAX_SYNC_BYTES} from '../core/sync-data';
import {SyncError} from './sync-storage';

export interface RemoteSnapshot {head:string|null;content:string|null}
export interface JournalRemote {
 test(signal:AbortSignal):Promise<void>;read(signal:AbortSignal):Promise<RemoteSnapshot>;
 write(expectedHead:string|null,content:string,signal:AbortSignal):Promise<string>;
}
export interface RemoteConfig {repository:string;username:string;branch:string;token:string}
export const SYNC_FILE='focus-journal.json';
// A new bare repository may have this branch but no default HEAD yet. isomorphic-git
// 1.44 still asks for HEAD when fetching an explicit branch. Supply only a local
// symref hint; never change refs, object IDs, or the server's default branch.
function withDefaultBranch(http:git.HttpClient,branch:string):git.HttpClient {
 return {request:async request=>{
  const response=await http.request(request);
  if(!request.url.endsWith('/info/refs?service=git-upload-pack')||response.statusCode!==200||!response.body)return response;
  const chunks:Uint8Array[]=[];for await(const part of response.body)chunks.push(part);let bytes=Buffer.concat(chunks);
  const packets:{offset:number;length:number;text:string}[]=[];let offset=0;
  while(offset+4<=bytes.length){const length=parseInt(bytes.subarray(offset,offset+4).toString(),16);if(!Number.isFinite(length)||length<0||length>65520||offset+length>bytes.length)break;if(length===0){offset+=4;continue;}if(length<4)break;packets.push({offset,length,text:bytes.subarray(offset+4,offset+length).toString()});offset+=length;}
  if(!packets.some(p=>/^[a-f0-9]{40} HEAD(?:\x00|\n)/.test(p.text)||p.text.includes('symref=HEAD:'))&&packets.some(p=>p.text.split(/[\x00\n]/)[0].endsWith(` refs/heads/${branch}`))){
   const first=packets.find(p=>/^[a-f0-9]{40} refs\//.test(p.text));
   if(first){const text=first.text.replace(/\n$/,'')+(first.text.includes('\0')?' ':'\0')+`symref=HEAD:refs/heads/${branch}\n`;const packet=Buffer.from((Buffer.byteLength(text)+4).toString(16).padStart(4,'0')+text);bytes=Buffer.concat([bytes.subarray(0,first.offset),packet,bytes.subarray(first.offset+first.length)]);}
  }
  return {...response,body:(async function*(){yield bytes;})()};
 }};
}
// Do not forward credentials to redirects or use URLs outside this configured GitCode repository.
export function secureGitHttp(repository:string,operationSignal:AbortSignal):git.HttpClient {
 return {request:async({url,method='GET',headers={},body})=>{
  if(!url.startsWith(repository+'/'))throw new SyncError('远端请求地址不匹配，已停止同步。');
  return await new Promise<git.GitHttpResponse>((resolve,reject)=>{
   const req=https.request(url,{method,headers,signal:operationSignal},res=>{
    if(res.statusCode&&res.statusCode>=300&&res.statusCode<400){res.resume();reject(new SyncError('GitCode 返回了新的仓库地址，请使用仓库页面提供的 HTTPS 克隆地址更新配置。'));return;}
    const chunks:Buffer[]=[];let size=0;
    res.on('data',(chunk:Buffer)=>{size+=chunk.length;if(size>96*1024*1024){res.destroy();reject(new SyncError('同步分支过大，请使用专注记专用分支或独立仓库。'));}else chunks.push(chunk);});
    res.on('error',reject);res.on('end',()=>resolve({url,method,headers:Object.fromEntries(Object.entries(res.headers).map(([k,v])=>[k,Array.isArray(v)?v.join(','):v??''])),statusCode:res.statusCode??500,statusMessage:res.statusMessage??'',body:(async function*(){yield Buffer.concat(chunks);})()}));
   });
   req.setTimeout(20000,()=>req.destroy(new SyncError('连接 GitCode 超时，请检查网络后重试。')));req.on('error',reject);
   void(async()=>{try{if(body)for await(const chunk of body)req.write(chunk);req.end();}catch(e){req.destroy();reject(e);}})();
  });
 }};
}
export function gitFailure(error:unknown):SyncError {
 if(error instanceof SyncError)return error;
 const e=error as {code?:string;data?:{statusCode?:number};message?:string};
 if(e?.data?.statusCode===401||e?.code==='UserCanceledError')return new SyncError('GitCode 身份验证失败。请检查用户名、令牌是否有效，以及令牌的仓库权限。');
 if(e?.data?.statusCode===403)return new SyncError('GitCode 拒绝访问。请检查仓库读写权限、令牌范围和分支保护规则。');
 if(e?.data?.statusCode===404)return new SyncError('找不到 GitCode 仓库或没有访问权限。请检查 HTTPS 克隆地址和令牌。');
 if(e?.code==='PushRejectedError'||e?.code==='MergeNotSupportedError')return new SyncError('远端在同步期间发生变化，或分支禁止写入。已保留本机数据，请重新同步；若持续失败，请检查分支保护规则。');
 if(['ENOTFOUND','ETIMEDOUT','ECONNREFUSED','ECONNRESET','EAI_AGAIN','ABORT_ERR'].includes(e?.code??''))return new SyncError('无法连接 GitCode 或连接超时。本机数据已保留，请检查网络后重试。');
 return new SyncError('GitCode 同步未完成。本机数据已保留，请检查网络、仓库权限和分支设置后重试。');
}
export class GitCodeRemote implements JournalRemote {
 constructor(private dir:string,private config:RemoteConfig,private httpFactory=(signal:AbortSignal)=>secureGitHttp(config.repository,signal)){}
 private args(signal:AbortSignal){return {fs,dir:this.dir,url:this.config.repository,http:this.httpFactory(signal),onAuth:()=>({username:this.config.username,password:this.config.token}),onAuthFailure:()=>{throw new SyncError('GitCode 身份验证失败，请检查用户名和访问令牌。');}};}
 private check(signal:AbortSignal){if(signal.aborted)throw new SyncError('同步已取消，本机数据保留。');}
 async test(signal:AbortSignal){try{for(const forPush of [false,true]){this.check(signal);await git.listServerRefs({...this.args(signal),forPush,protocolVersion:1});}}catch(e){throw gitFailure(e);}}
 async read(signal:AbortSignal):Promise<RemoteSnapshot>{
  try{
   this.check(signal);fs.mkdirSync(this.dir,{recursive:true});
   if(!fs.existsSync(this.dir+'/.git'))await git.init({fs,dir:this.dir,defaultBranch:'journal-local'});
   await git.addRemote({fs,dir:this.dir,remote:'origin',url:this.config.repository,force:true});
   const refs=await git.listServerRefs({...this.args(signal),protocolVersion:1});this.check(signal);
   const remote=refs.find(r=>r.ref===`refs/heads/${this.config.branch}`);if(!remote)return {head:null,content:null};
   const args=this.args(signal);const fetched=await git.fetch({...args,http:withDefaultBranch(args.http,this.config.branch),ref:this.config.branch,remote:'origin',depth:1,singleBranch:true,tags:false});this.check(signal);
   const head=fetched.fetchHead;if(!head)throw new SyncError('无法读取同步分支，请检查 GitCode 仓库。');
   const {tree}=await git.readTree({fs,dir:this.dir,oid:head});const entry=tree.find(e=>e.path===SYNC_FILE);
   if(!entry)return {head,content:null};
   if(entry.type!=='blob'||entry.mode==='120000')throw new SyncError('远端同步文件类型不正确，未替换本机数据。');
   const {blob}=await git.readBlob({fs,dir:this.dir,oid:entry.oid});if(blob.length>MAX_SYNC_BYTES)throw new SyncError('远端同步文件超过 24 MB，未替换本机数据。');
   return {head,content:Buffer.from(blob).toString('utf8')};
  }catch(e){throw gitFailure(e);}
 }
 async write(expectedHead:string|null,content:string,signal:AbortSignal):Promise<string>{
  try{
   const current=await this.read(signal);if(current.head!==expectedHead)throw new SyncError('远端刚刚发生变化，已停止上传。请重新同步后再处理。');
   this.check(signal);
   const tree=current.head?(await git.readTree({fs,dir:this.dir,oid:current.head})).tree:[];
   const oid=await git.writeBlob({fs,dir:this.dir,blob:Buffer.from(content)});
   const treeOid=await git.writeTree({fs,dir:this.dir,tree:[...tree.filter(e=>e.path!==SYNC_FILE),{mode:'100644',path:SYNC_FILE,oid,type:'blob'}]});
   const commit=await git.commit({fs,dir:this.dir,ref:'refs/heads/journal-local',parent:current.head?[current.head]:[],tree:treeOid,message:'Update focus journal snapshot',author:{name:'Focus Journal',email:'journal@localhost'}});
   this.check(signal);
   const result=await git.push({...this.args(signal),ref:'journal-local',remoteRef:this.config.branch,remote:'origin',force:false});
   this.check(signal);if(!result.ok||result.error)throw new SyncError('GitCode 未接受上传。请检查写入权限和分支保护规则，再重新同步。');
   return commit;
  }catch(e){throw gitFailure(e);}
 }
}
