import {randomUUID} from 'node:crypto';
import type {SyncStatus} from '../core/sync-types';
import type {Snapshot} from '../core/types';

export interface ApiSyncTarget {status():SyncStatus;run():Promise<SyncStatus>;resolve(id:string,choice:'local'|'remote'):Promise<SyncStatus>}
export class ApiSyncError extends Error {constructor(public status:number,public code:string,message:string){super(message);}}
interface Operation {id:string;action:'run'|'resolve';state:'working'|'finished';startedAt:string;finishedAt:string|null;result:SyncStatus|null;error:string|null}

/** Sync outlives the initiating HTTP request; polling never starts another transfer. */
export class ApiSyncJobs {
 private operations=new Map<string,Operation>();
 constructor(private target?:ApiSyncTarget){}
 status(){if(!this.target)throw new ApiSyncError(503,'sync_unavailable','当前运行环境不支持同步。');return this.target.status();}
 get(id:string){const job=this.operations.get(id);if(!job)throw new ApiSyncError(404,'operation_not_found','操作记录不存在或已过期，请查询当前同步状态。');return structuredClone(job);}
 start(action:'run'|'resolve',input:unknown,snapshot:Snapshot){
  if(!input||typeof input!=='object'||Array.isArray(input))throw new ApiSyncError(400,'invalid_request','同步请求应为 JSON 对象。');
  const p=input as Record<string,unknown>,allowed=action==='run'?[]:['conflictId','choice'];
  if(Object.keys(p).some(k=>!allowed.includes(k)))throw new ApiSyncError(400,'invalid_request','同步请求包含不支持的字段。');
  if(action==='resolve'&&(typeof p.conflictId!=='string'||!p.conflictId||!['local','remote'].includes(String(p.choice))))throw new ApiSyncError(400,'invalid_request','请指定 conflictId，并明确选择 local 或 remote。');
  const status=this.status();
  if(!status.config)throw new ApiSyncError(409,'sync_not_configured','请先在应用设置中配置 GitCode 同步。');
  if(status.phase==='working'||[...this.operations.values()].some(j=>j.state==='working'))throw new ApiSyncError(409,'sync_busy','同步正在进行，请查询已有操作的结果。');
  if(snapshot.timers.some(t=>!t.paused))throw new ApiSyncError(409,'timers_running','请先明确暂停正在运行的计时器，再同步。');
  if(action==='resolve'&&(status.conflict?.id!==p.conflictId||!status.conflict))throw new ApiSyncError(409,'conflict_expired','冲突信息已过期，请重新读取同步状态。');
  if(action==='resolve'&&p.choice==='remote'&&!status.conflict?.remote)throw new ApiSyncError(409,'remote_missing','远端没有可载入的日志。');
  const job:Operation={id:randomUUID(),action,state:'working',startedAt:new Date().toISOString(),finishedAt:null,result:null,error:null};
  this.operations.set(job.id,job);
  if(this.operations.size>200)this.operations.delete(this.operations.keys().next().value!);
  // Capture acceptance before an immediately resolved promise can update the job.
  const accepted=structuredClone(job);
  void Promise.resolve().then(()=>action==='run'?this.target!.run():this.target!.resolve(p.conflictId as string,p.choice as 'local'|'remote')).then(
   result=>{job.result=result;},
   ()=>{job.error='同步未完成，请查询当前同步状态并核对后重试。';}
  ).finally(()=>{job.state='finished';job.finishedAt=new Date().toISOString();});
  return accepted;
 }
}
