import {existsSync,mkdirSync,readFileSync,renameSync,writeFileSync,openSync,fsyncSync,closeSync} from 'node:fs';
import path from 'node:path';
import type {SyncInput} from '../core/sync-types';

export class SyncError extends Error {}
export interface SavedSync {
 config:{repository:string;username:string;branch:string;encryptedToken:string}|null;
 baseline:string|null;lastSuccess:string|null;
}
export interface SyncPersistence {load():SavedSync;save(record:SavedSync):void}
export interface TokenVault {encrypt(token:string):string;decrypt(cipher:string):string}
export const blankSync=():SavedSync=>({config:null,baseline:null,lastSuccess:null});
export function atomicWrite(file:string,content:string):void {
 mkdirSync(path.dirname(file),{recursive:true});const temp=file+'.tmp';
 writeFileSync(temp,content,{encoding:'utf8',mode:0o600});
 const fd=openSync(temp,'r+');try{fsyncSync(fd);}finally{closeSync(fd);}
 renameSync(temp,file);
}
export class FileSyncPersistence implements SyncPersistence {
 constructor(private file:string){}
 load():SavedSync {
  if(!existsSync(this.file))return blankSync();
  const data=JSON.parse(readFileSync(this.file,'utf8')) as SavedSync;
  if(data.config){const c=validateSyncInput({...data.config,token:'validation'});if(!data.config.encryptedToken||c.repository!==data.config.repository)throw new Error('invalid configuration');}
  if(data.baseline!==null&&!/^[a-f0-9]{64}$/.test(data.baseline))throw new Error('invalid baseline');
  if(data.lastSuccess!==null&&(typeof data.lastSuccess!=='string'||!Number.isFinite(Date.parse(data.lastSuccess))))throw new Error('invalid date');
  return data;
 }
 save(data:SavedSync){atomicWrite(this.file,JSON.stringify(data,null,2));}
}
export function validateSyncInput(value:unknown):Required<SyncInput> {
 const v=value as SyncInput;
 if(!v||typeof v.repository!=='string'||typeof v.username!=='string'||typeof v.branch!=='string'||(v.token!==undefined&&typeof v.token!=='string'))throw new SyncError('请填写 GitCode 仓库地址、用户名和访问令牌。');
 let url:URL;try{url=new URL(v.repository.trim());}catch{throw new SyncError('请输入 GitCode 仓库的 HTTPS 克隆地址。');}
 if(url.protocol!=='https:'||!['gitcode.com','hub.gitcode.com'].includes(url.hostname)||url.port||url.username||url.password||url.search||url.hash)throw new SyncError('仅支持 gitcode.com 或 hub.gitcode.com 的 HTTPS 克隆地址；地址中不要填写令牌。');
 const parts=url.pathname.replace(/\/$/,'').replace(/\.git$/,'').split('/').slice(1);
 if(parts.length<2||parts.length>8||parts.some(p=>!p||!/^[-\w.]+$/.test(p)||p==='.'||p==='..'))throw new SyncError('请输入完整的 GitCode 仓库克隆地址，例如 https://gitcode.com/用户名/仓库.git。');
 const repository=`${url.origin}/${parts.join('/')}.git`,username=v.username.trim(),branch=v.branch.trim()||'focus-journal',token=v.token?.trim()??'';
 if(!username||username.length>120||/[\s:\x00-\x1f]/.test(username))throw new SyncError('请输入 GitCode 登录用户名，不使用昵称。');
 if(!/^[a-zA-Z0-9][a-zA-Z0-9._/-]{0,99}$/.test(branch)||branch.includes('..')||branch.includes('//')||branch.split('/').some(p=>p.startsWith('.')||p.endsWith('.')||p.endsWith('.lock'))||branch.endsWith('/'))throw new SyncError('同步分支名称无效，建议使用 focus-journal。');
 if(token.length>4096||/[\s\x00-\x1f]/.test(token))throw new SyncError('访问令牌格式无效，请重新粘贴。');
 return {repository,username,branch,token};
}
