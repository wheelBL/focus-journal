import {randomUUID} from 'node:crypto';
import type {JournalService} from '../core/service';
import {fingerprint,isEmptyJournal,parseSyncDocument,summarizeSync,syncDocument} from '../core/sync-data';
import type {JournalState} from '../core/types';
import type {SyncInput,SyncStatus} from '../core/sync-types';
import {blankSync,SyncError,validateSyncInput,type SavedSync,type SyncPersistence,type TokenVault} from './sync-storage';
import type {JournalRemote,RemoteConfig,RemoteSnapshot} from './gitcode-remote';

interface Dependencies {
 journal:JournalService;persistence:SyncPersistence;vault:TokenVault;
 remote(config:RemoteConfig):JournalRemote;backup(content:string):void;
 changed(status:SyncStatus):void;journalChanged():void;
}
interface ConflictState {id:string;localHash:string;remoteHead:string|null;remoteHash:string|null}
export class SyncController {
 private saved:SavedSync=blankSync();private state:SyncStatus={config:null,phase:'unconfigured',message:'配置 GitCode 后即可一键同步。',lastSuccess:null,conflict:null};
 private conflict:ConflictState|null=null;private abort:AbortController|null=null;private disposed=false;
 constructor(private deps:Dependencies){try{this.saved=deps.persistence.load();if(this.saved.config){this.state.phase='idle';this.state.message='准备就绪，点击一键同步。';}}catch{this.state.phase='error';this.state.message='同步配置读取失败，请重新配置；本机工作记录不受影响。';}}
 status():SyncStatus {const c=this.saved.config;return structuredClone({...this.state,config:c?{repository:c.repository,username:c.username,branch:c.branch,hasToken:!!c.encryptedToken}:null,lastSuccess:this.saved.lastSuccess});}
 private emit(){if(!this.disposed)this.deps.changed(this.status());}
 private idle(){if(this.disposed)throw new SyncError('应用正在退出。');if(this.abort)throw new SyncError('同步正在进行，请稍候。');}
 private store(next:SavedSync){this.deps.persistence.save(next);this.saved=next;}
 configure(input:SyncInput):SyncStatus {
  this.idle();const c=validateSyncInput(input),old=this.saved.config;
  const sameCredentials=old?.repository===c.repository&&old.username===c.username;
  if(!c.token&&!sameCredentials)throw new SyncError('首次连接或更换仓库、用户名时，请填写访问令牌。');
  let encryptedToken:string;try{encryptedToken=c.token?this.deps.vault.encrypt(c.token):old!.encryptedToken;}catch{throw new SyncError('Windows 凭据加密不可用，配置未保存。请重新打开应用后重试。');}
  const same=!!old&&old.repository===c.repository&&old.branch===c.branch;
  try{this.store({config:{repository:c.repository,username:c.username,branch:c.branch,encryptedToken},baseline:same?this.saved.baseline:null,lastSuccess:same?this.saved.lastSuccess:null});}catch{throw new SyncError('同步配置未能保存，请检查数据文件夹权限和磁盘空间。');}
  this.conflict=null;this.state={...this.state,phase:'idle',message:'配置已保存，可以测试连接或直接同步。',conflict:null};this.emit();return this.status();
 }
 disconnect():SyncStatus {this.idle();try{this.store(blankSync());}catch{throw new SyncError('未能移除同步配置，请检查数据文件夹权限。');}this.conflict=null;this.state={config:null,phase:'unconfigured',message:'已断开 GitCode，工作记录继续保存在本机。',lastSuccess:null,conflict:null};this.emit();return this.status();}
 private remote():JournalRemote {
  const c=this.saved.config;if(!c)throw new SyncError('请先在设置中配置 GitCode 仓库。');
  let token:string;try{token=this.deps.vault.decrypt(c.encryptedToken);}catch{throw new SyncError('无法解密这台电脑的访问令牌，请在设置中重新填写令牌。');}
  if(!token)throw new SyncError('请在设置中填写访问令牌。');
  return this.deps.remote({repository:c.repository,username:c.username,branch:c.branch,token});
 }
 private check(signal:AbortSignal){if(this.disposed||signal.aborted)throw new SyncError('同步已取消或超时，本机数据保留。');}
 private local(){const s=this.deps.journal.snapshot();if(s.timers.some(t=>!t.paused))throw new SyncError('请先暂停正在计时的事项，再同步。暂停的计时器和已投入时间会一起保存。');return s.state;}
 private parse(remote:RemoteSnapshot){if(remote.content===null)return null;try{return parseSyncDocument(remote.content);}catch{throw new SyncError('远端日志格式、版本或数据校验失败，未替换本机数据。请检查同步分支，或从 GitCode 历史版本恢复有效快照。');}}
 private success(hash:string,message:string){this.store({...this.saved,baseline:hash,lastSuccess:new Date().toISOString()});this.conflict=null;this.state={...this.state,phase:'ok',message,conflict:null};}
 private makeConflict(local:JournalState,remote:RemoteSnapshot,parsed:ReturnType<SyncController['parse']>){
  const id=randomUUID();this.conflict={id,localHash:fingerprint(local),remoteHead:remote.head,remoteHash:parsed?fingerprint(parsed.state):null};
  this.state={...this.state,phase:'conflict',message:parsed?'本机与远端都有内容需要确认。请选择保留哪份，未自动覆盖。':'远端同步文件已被移除。请选择是否重新上传本机内容。',conflict:{id,local:summarizeSync(local),remote:parsed?summarizeSync(parsed.state):null,remoteUpdatedAt:parsed?.updatedAt??null}};
 }
 private async perform(work:(remote:JournalRemote,signal:AbortSignal)=>Promise<void>,message:string):Promise<SyncStatus>{
  this.idle();const controller=new AbortController();this.abort=controller;this.state={...this.state,phase:'working',message};this.emit();
  const timer=setTimeout(()=>controller.abort(),90000);
  try{await work(this.remote(),controller.signal);this.check(controller.signal);}catch(e){if(!this.disposed)this.state={...this.state,phase:'error',message:e instanceof SyncError?e.message:'同步未能完成，本机数据已保留。请检查磁盘空间、数据文件夹权限和网络后重试。'};}
  finally{clearTimeout(timer);this.abort=null;this.emit();}
  return this.status();
 }
 test():Promise<SyncStatus>{return this.perform(async(remote,signal)=>{await remote.test(signal);this.check(signal);this.state={...this.state,phase:this.conflict?'conflict':'ok',message:'读取和推送接口可访问。实际分支写入权限会在同步时确认；本次未上传日志。'};},'正在测试 GitCode 连接…');}
 run():Promise<SyncStatus>{return this.perform(async(remote,signal)=>{
  this.conflict=null;this.state.conflict=null;
  const local=this.local(),hash=fingerprint(local),current=await remote.read(signal);this.check(signal);const parsed=this.parse(current);
  const latest=this.local();if(fingerprint(latest)!==hash)throw new SyncError('读取远端期间本机记录发生变化，请再次点击同步。');
  const remoteHash=parsed?fingerprint(parsed.state):null,base=this.saved.baseline;
  if(remoteHash===hash){this.success(hash,'本机与 GitCode 已一致。');return;}
  if(parsed&&((base===hash&&remoteHash!==base)||(!base&&isEmptyJournal(local)))){this.download(parsed.state,hash,signal);return;}
  if((base&&remoteHash===base)||(!base&&(!parsed||isEmptyJournal(parsed.state)))){await this.upload(remote,current,local,hash,signal);return;}
  this.makeConflict(local,current,parsed);
 },'正在检查本机和 GitCode 的变化…');}
 private download(state:JournalState,expectedHash:string,signal:AbortSignal){
  this.check(signal);const current=this.local();if(fingerprint(current)!==expectedHash)throw new SyncError('本机内容刚刚发生变化，已停止下载，请重新同步。');
  this.deps.backup(this.deps.journal.exportJson());
  this.deps.journal.importSyncedState(state);this.deps.journalChanged();
  this.success(fingerprint(state),'已下载并载入 GitCode 日志。本机旧数据已备份，计时器保持暂停。');
 }
 private async upload(remote:JournalRemote,current:RemoteSnapshot,local:JournalState,hash:string,signal:AbortSignal){
  this.check(signal);await remote.write(current.head,syncDocument(local),signal);this.check(signal);
  const changed=fingerprint(this.deps.journal.snapshot().state)!==hash;
  this.success(hash,changed?'已上传开始同步时的记录；期间新增的修改仍在本机，请再次同步。':'已将本机日志上传到 GitCode。');
 }
 resolve(id:string,choice:'local'|'remote'):Promise<SyncStatus>{
  const pending=this.conflict;
  if(!pending||pending.id!==id||!['local','remote'].includes(choice))return Promise.reject(new SyncError('冲突信息已过期，请重新同步。'));
  return this.perform(async(remote,signal)=>{
   const local=this.local(),hash=fingerprint(local),current=await remote.read(signal);this.check(signal);const parsed=this.parse(current);
   const latest=this.local(),latestHash=fingerprint(latest);
   if(hash!==latestHash||hash!==pending.localHash||current.head!==pending.remoteHead||(parsed?fingerprint(parsed.state):null)!==pending.remoteHash){this.makeConflict(latest,current,parsed);this.state.message='内容在确认期间发生变化，已更新两边摘要，请重新选择。';return;}
   if(choice==='remote'){if(!parsed)throw new SyncError('远端没有可载入的日志。');this.download(parsed.state,hash,signal);}
   else{this.deps.backup(this.deps.journal.exportJson());await this.upload(remote,current,local,hash,signal);}
  },'正在重新检查冲突并保存所选内容…');
 }
 dispose(){this.disposed=true;this.abort?.abort();}
}
