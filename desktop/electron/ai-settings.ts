import {existsSync,readFileSync} from 'node:fs';
import {performance} from 'node:perf_hooks';
import {AiError,type AiConnection,type AiConnectionTest,type AiSettingsInput,type AiSettingsStatus} from '../core/ai-types';
import {atomicWrite} from './sync-storage';
import {chatCompletion,isLoopback,validateAiSettings,type AiFetch} from './ai-transport';

export interface AiVault {encrypt(secret:string):Promise<string>;decrypt(cipher:string):Promise<string>}
export interface SavedAiSettings {baseUrl:string;model:string;encryptedKey:string|null}
export interface AiSettingsPersistence {load():unknown;save(value:SavedAiSettings):void}
interface AsyncSafeStorage {
 isAsyncEncryptionAvailable():Promise<boolean>;
 encryptStringAsync(value:string):Promise<Buffer>;
 decryptStringAsync(value:Buffer):Promise<{result:string;shouldReEncrypt:boolean}>;
}
/** Uses Electron's asynchronous DPAPI-backed API on Windows; no plaintext fallback. */
export function createElectronAiVault(storage:AsyncSafeStorage):AiVault{return {
 async encrypt(secret){if(!await storage.isAsyncEncryptionAvailable())throw new AiError('credentials','Windows 密钥保护暂不可用，请稍后重试。');return (await storage.encryptStringAsync(secret)).toString('base64');},
 async decrypt(cipher){if(!await storage.isAsyncEncryptionAvailable())throw new AiError('credentials','Windows 密钥保护暂不可用，请稍后重试。');return (await storage.decryptStringAsync(Buffer.from(cipher,'base64'))).result;}
};}
export class AiSettings {
 private saved:SavedAiSettings={baseUrl:'',model:'',encryptedKey:null};private error:string|null=null;private busy=false;
 private persistence:AiSettingsPersistence;
 constructor(file:string,private vault:AiVault,persistence?:AiSettingsPersistence){
  this.persistence=persistence??{load:()=>existsSync(file)?JSON.parse(readFileSync(file,'utf8')):null,save:value=>atomicWrite(file,JSON.stringify(value,null,2))};
  try{const record=this.persistence.load();if(record!==null){const r=record as SavedAiSettings,settings=validateAiSettings(r);if(!r||r.encryptedKey!==null&&(typeof r.encryptedKey!=='string'||!r.encryptedKey||r.encryptedKey.length>32768))throw Error();this.saved={baseUrl:settings.baseUrl,model:settings.model!,encryptedKey:r.encryptedKey};}}
  catch{this.error='AI 配置无法读取，请重新保存服务地址、模型和密钥。';}
 }
 status():AiSettingsStatus{return {baseUrl:this.saved.baseUrl,model:this.saved.model,hasKey:!!this.saved.encryptedKey,configured:!this.error&&!!this.saved.baseUrl&&!!this.saved.model&&(!!this.saved.encryptedKey||isLoopback(new URL(this.saved.baseUrl))),error:this.error};}
 private persist(next:SavedAiSettings){try{this.persistence.save(next);}catch{throw new AiError('storage','AI 设置未保存，请检查数据文件夹权限后重试；原设置已保留。');}this.saved=next;this.error=null;}
 async configure(input:AiSettingsInput):Promise<AiSettingsStatus>{
  if(this.busy)throw new AiError('busy','AI 设置正在保存，请稍候。');
  const value=validateAiSettings(input),key=value.apiKey??'';this.busy=true;
  try{
   if(!key&&this.saved.encryptedKey&&this.saved.baseUrl&&new URL(value.baseUrl).origin!==new URL(this.saved.baseUrl).origin)throw new AiError('credentials','更换服务地址时请重新输入密钥；不会将原密钥发送给另一服务。使用无密钥本机模型时，请先移除原密钥。');
   let encryptedKey=this.saved.encryptedKey;
   if(key)try{encryptedKey=await this.vault.encrypt(key);if(!encryptedKey)throw Error();}catch{throw new AiError('credentials','密钥未保存，Windows 密钥保护暂不可用；原设置已保留。');}
   if(!encryptedKey&&!isLoopback(new URL(value.baseUrl)))throw new AiError('credentials','请填写访问密钥；密钥仅加密保存在这台电脑。');
   this.persist({baseUrl:value.baseUrl,model:value.model,encryptedKey});return this.status();
  }finally{this.busy=false;}
 }
 async clearKey():Promise<AiSettingsStatus>{if(this.busy)throw new AiError('busy','AI 设置正在保存，请稍候。');this.persist({...this.saved,encryptedKey:null});return this.status();}
 /** Main-process use only. Never expose this return value through preload. */
 async connection():Promise<AiConnection>{
  if(this.busy)throw new AiError('busy','AI 设置正在保存，请稍候。');
  if(!this.status().configured)throw new AiError('configuration',this.error??'请先配置 AI 服务地址、模型和密钥。');
  const saved={...this.saved};let apiKey='';
  if(saved.encryptedKey)try{apiKey=await this.vault.decrypt(saved.encryptedKey);if(!apiKey||apiKey.length>4096||/[\s\x00-\x1f\x7f]/.test(apiKey))throw Error();}catch{throw new AiError('credentials','密钥无法在这台电脑解密，请重新输入并保存密钥。');}
  return {baseUrl:saved.baseUrl,model:saved.model,apiKey};
 }
 async test(options:{signal?:AbortSignal;fetch?:AiFetch;timeoutMs?:number}={}):Promise<AiConnectionTest>{
  const config=await this.connection(),start=performance.now();
  await chatCompletion(config,{messages:[{role:'user',content:'Reply with OK.'}],maxTokens:32,timeoutMs:options.timeoutMs??30_000,signal:options.signal},options.fetch);
  return {message:'连接成功，模型已响应；未发送任何工作记录。',latencyMs:Math.round(performance.now()-start)};
 }
}
