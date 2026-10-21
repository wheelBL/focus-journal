import {appendFileSync,existsSync,readFileSync} from 'node:fs';
import {randomBytes} from 'node:crypto';
import {atomicWrite,type TokenVault} from './sync-storage';
import {startLocalApi,type RunningLocalApi} from './local-api-server';
import type {JournalService} from '../core/service';
import type {LocalApiSettings,LocalApiStatus} from '../core/local-api-types';
import type {ApiSyncTarget} from './local-api-sync';

interface Saved extends LocalApiSettings {encryptedToken:string|null}
const defaults=():Saved=>({enabled:false,port:17642,access:'read',encryptedToken:null});
/** Device settings/credentials stay outside journal snapshots, backups and sync. */
export class LocalApiController {
 private saved=defaults();private secret='';private listener:RunningLocalApi|null=null;private error:string|null=null;private busy=false;private disposed=false;private loadFailed=false;
 constructor(private service:JournalService,private file:string,private vault:TokenVault,private changed:()=>void,private version:string,private sync?:ApiSyncTarget){
  try{if(existsSync(file)){const value=JSON.parse(readFileSync(file,'utf8')) as Saved;this.validate(value);if(value.encryptedToken!==null&&typeof value.encryptedToken!=='string')throw Error();this.saved=value;}}
  catch{this.loadFailed=true;this.error='接口配置无法读取；请重新保存设置以重建连接配置。';}
 }
 private validate(value:unknown):asserts value is LocalApiSettings{
  const v=value as LocalApiSettings;if(!v||typeof v.enabled!=='boolean'||!Number.isInteger(v.port)||v.port<1024||v.port>65535||!['read','write'].includes(v.access))throw Error('请输入 1024 至 65535 的端口，并选择访问权限。');
 }
 status():LocalApiStatus{return {enabled:this.saved.enabled,port:this.saved.port,access:this.saved.access,running:!!this.listener,baseUrl:this.listener?`http://127.0.0.1:${this.listener.port}/v1`:null,hasToken:!!this.saved.encryptedToken,error:this.error};}
 private unlock(){if(this.secret)return this.secret;if(!this.saved.encryptedToken)throw Error('请先启用接口以生成访问密钥。');try{this.secret=this.vault.decrypt(this.saved.encryptedToken);if(!/^[a-f0-9]{64}$/.test(this.secret))throw Error();return this.secret;}catch{throw Error('访问密钥无法在这台电脑解密，请重新生成密钥。');}}
 private persist(value:Saved){try{atomicWrite(this.file,JSON.stringify(value,null,2));}catch{throw Error('接口设置未保存，请检查数据目录权限。');}}
 async initialize(){if(this.saved.enabled&&!this.loadFailed)try{await this.configure(this.saved);}catch(e){this.error=e instanceof Error?e.message:'接口启动失败。';}}
 async configure(value:unknown):Promise<LocalApiStatus>{
  this.validate(value);if(this.busy||this.disposed)throw Error('接口正在切换，请稍候。');this.busy=true;
  let candidate:RunningLocalApi|null=null;
  try{
   const next:Saved={enabled:value.enabled,port:value.port,access:value.access,encryptedToken:this.saved.encryptedToken};
   if(next.enabled&&!next.encryptedToken){const secret=randomBytes(32).toString('hex');try{next.encryptedToken=this.vault.encrypt(secret);}catch{throw Error('Windows 密钥保护不可用，接口尚未启用。');}this.secret=secret;}
   if(next.enabled){
    if(this.saved.encryptedToken)this.unlock();
    if(!this.listener||this.listener.port!==next.port)try{candidate=await startLocalApi({service:this.service,port:next.port,token:()=>this.secret,access:()=>this.saved.access,changed:this.changed,version:this.version,sync:this.sync,audit:entry=>appendFileSync(this.file.replace(/\.json$/,'.audit.jsonl'),JSON.stringify(entry)+'\n')});}
    catch{throw Error(`端口 ${next.port} 不可用，请更换端口后重试。`);}
   }
   if(this.disposed)throw Error('应用正在退出。');
   this.persist(next);this.saved=next;this.error=null;this.loadFailed=false;
   if(candidate||!next.enabled){this.listener?.close();this.listener=candidate;candidate=null;}
   return this.status();
  }catch(e){candidate?.close();throw e;}
  finally{this.busy=false;}
 }
 token(){if(this.busy||this.disposed)throw Error('接口正在切换，请稍候。');return this.unlock();}
 rotateToken(){
  if(this.busy||this.disposed)throw Error('接口正在切换，请稍候。');
  const secret=randomBytes(32).toString('hex');let encryptedToken:string;
  try{encryptedToken=this.vault.encrypt(secret);}catch{throw Error('Windows 密钥保护不可用，旧密钥保持有效。');}
  const next={...this.saved,encryptedToken};this.persist(next);this.saved=next;this.secret=secret;this.error=null;return secret;
 }
 dispose(){this.disposed=true;this.listener?.close();this.listener=null;this.secret='';}
}
