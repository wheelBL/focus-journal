export interface SyncConfig {repository:string;username:string;branch:string;hasToken:boolean}
export interface SyncInput {repository:string;username:string;branch:string;token?:string}
export interface SyncSummary {items:number;projects:number;sessions:number;notes:number;minutes:number}
export interface SyncConflict {id:string;local:SyncSummary;remote:SyncSummary|null;remoteUpdatedAt:string|null}
export interface SyncStatus {
 config:SyncConfig|null;phase:'unconfigured'|'idle'|'working'|'ok'|'error'|'conflict';
 message:string;lastSuccess:string|null;conflict:SyncConflict|null;
}
export interface SyncApi {
 status():Promise<SyncStatus>;configure(input:SyncInput):Promise<SyncStatus>;disconnect():Promise<SyncStatus>;
 test():Promise<SyncStatus>;run():Promise<SyncStatus>;resolve(id:string,choice:'local'|'remote'):Promise<SyncStatus>;
 onChanged(callback:(status:SyncStatus)=>void):()=>void;
}
