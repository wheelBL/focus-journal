import {DatabaseSync,backup} from 'node:sqlite';
import {cpSync,existsSync,lstatSync,mkdirSync,readFileSync,readdirSync,realpathSync,renameSync,statSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {emptyState,type JournalState} from '../core/types';
import {parseJournalBackup} from '../core/service';
import {fingerprint} from '../core/sync-data';
import {SqliteJournalStore} from '../core/store';

export const WORKSPACE_MARKER='workspace-location.json';
export const WORKSPACE_ANCHOR='active-workspace.json';
const collections=['projects','tasks','sessions','deletedSessions','notes','estimates','reviews','audit','tags','views','moves','itemReviews','activities'] as const;
const transient=new Set(['SingletonLock','SingletonCookie','SingletonSocket','lockfile','Cache','Code Cache','GPUCache','DawnCache','DawnGraphiteCache','DawnWebGPUCache','ShaderCache','GrShaderCache','Crashpad']);
export interface WorkspaceCandidate {directory:string;label:string;items:number;sessions:number;contentHash:string;rowsHash:string}
export interface WorkspaceOptions {platform:NodeJS.Platform;home:string;appData:string;defaultUserData:string;args:string[]}
export interface WorkspacePlan {mode:'normal'|'bootstrap'|'migrate'|'outside';directory:string;canonical:string;legacy:string;source?:string;explicit:boolean;args:string[]}
interface Marker {format:'focus-journal-workspace';version:1;id:string;database:'journal.sqlite';ready:true;createdAt:string;source:string|null;sourceRowsHash:string|null}
const anchorFile=(directory:string)=>path.join(path.dirname(directory),'.focus-journal-bootstrap',WORKSPACE_ANCHOR);
function assertAnchor(directory:string){
 const file=anchorFile(directory);if(!existsSync(file))return;
 try{
  const anchor=JSON.parse(readFileSync(file,'utf8')),marker=JSON.parse(readFileSync(path.join(directory,WORKSPACE_MARKER),'utf8')) as Marker;
  if(anchor.format!=='focus-journal-location'||anchor.version!==1||anchor.workspaceId!==marker.id||!samePath(anchor.directory,directory))throw Error();
 }catch{throw Error(`工作区登记与实际数据不一致，已停止启动，未替换或创建数据。\n${directory}`);}
}
export function registerWorkspace(directory:string){
 assertWorkspace(directory);assertAnchor(directory);
 const file=anchorFile(directory);if(existsSync(file))return;
 const marker=JSON.parse(readFileSync(path.join(directory,WORKSPACE_MARKER),'utf8')) as Marker;
 mkdirSync(path.dirname(file),{recursive:true});
 const temporary=file+'.'+randomUUID()+'.tmp';
 writeFileSync(temporary,JSON.stringify({format:'focus-journal-location',version:1,workspaceId:marker.id,directory},null,2),{flag:'wx',mode:0o600});
 if(existsSync(file)){assertAnchor(directory);return;}
 renameSync(temporary,file);
}

function option(args:string[],name:string){
 const positions=args.flatMap((value,i)=>value===name?[i]:[]);
 if(positions.length>1)throw Error(`${name} 只能指定一次。`);
 if(!positions.length)return undefined;
 const value=args[positions[0]+1];if(!value||value.startsWith('--'))throw Error(`${name} 缺少目录。`);return value;
}
export function normalLaunchArgs(args:string[]){
 const result:string[]=[];
 for(let i=0;i<args.length;i++){if(args[i]==='--migrate-workspace'){i++;continue;}if(args[i]==='--workspace-outside')continue;result.push(args[i]);}
 return result;
}
function samePath(a:string,b:string){return path.resolve(a).toLowerCase()===path.resolve(b).toLowerCase();}
export function assertPhysicalDirectory(directory:string){
 if(existsSync(directory)&&!samePath(realpathSync.native(directory),directory))throw Error(`数据目录被重定向，已停止打开，避免读错工作区：\n${directory}`);
}
export function assertWorkspace(directory:string){
 assertPhysicalDirectory(directory);
 try{
  const marker=JSON.parse(readFileSync(path.join(directory,WORKSPACE_MARKER),'utf8')) as Marker;
  if(marker.format!=='focus-journal-workspace'||marker.version!==1||marker.database!=='journal.sqlite'||marker.ready!==true||typeof marker.id!=='string'||!marker.id)throw Error();
  const file=path.join(directory,marker.database);if(!statSync(file).isFile())throw Error();
  const db=new DatabaseSync(file,{readOnly:true});try{
   const meta=db.prepare("SELECT data FROM records WHERE kind='meta' AND id='schema'").get();
   if(!meta||!Number.isInteger(JSON.parse(meta.data as string).schemaVersion)||!db.prepare("SELECT 1 FROM records WHERE kind='settings' AND id='settings'").get())throw Error();
  }finally{db.close();}
 }catch{throw Error(`工作区标识或数据库缺失，已停止启动，未创建空白数据。\n${directory}\n请保留此目录，从备份恢复或检查文件权限。`);}
}
/** Called before Electron creates its profile or takes its single-instance lock. */
export function workspacePlan(options:WorkspaceOptions):WorkspacePlan {
 const explicit=option(options.args,'--data-dir'),source=option(options.args,'--migrate-workspace');
 if(explicit&&source)throw Error('不能同时指定测试工作区和数据迁移。');
 const legacy=path.join(options.appData,'专注记'),canonical=path.join(realpathSync.native(options.home),'.focus-journal');
 const base={canonical,legacy,explicit:!!explicit,args:normalLaunchArgs(options.args)};
 if(explicit)return {...base,mode:'normal',directory:path.resolve(explicit)};
 if(options.args.includes('--demo')||options.args.includes('--tree-prototype'))throw Error('演示和测试必须用 --data-dir 指定独立目录。');
 if(options.platform!=='win32')return {...base,mode:'normal',directory:options.defaultUserData};
 if(existsSync(canonical)){assertWorkspace(canonical);assertAnchor(canonical);return {...base,mode:'normal',directory:canonical};}
 if(existsSync(anchorFile(canonical)))throw Error(`已登记的工作区目录缺失，已停止启动，未回退旧副本或创建空白数据。\n${canonical}\n请先找回原目录或从备份恢复。`);
 if(options.args.includes('--quit'))return {...base,mode:'normal',directory:legacy};
 const bootstrap=path.join(realpathSync.native(options.home),'.focus-journal-bootstrap');
 // An inherited MSIX context can redirect AppData even for an unpackaged child.
 // Leave that context before inspecting or copying a legacy profile.
 if(existsSync(legacy)&&!samePath(realpathSync.native(legacy),legacy)){
  if(options.args.includes('--workspace-outside'))throw Error('无法访问原始数据目录，请从资源管理器启动专注记。未打开缓存或创建空白工作区。');
  return {...base,mode:'outside',directory:bootstrap};
 }
 if(source){
  const resolved=path.resolve(source),allowed=legacyDirectories(options.home,options.appData).some(c=>samePath(c.directory,resolved));
  if(!allowed)throw Error('迁移来源不属于专注记的已有数据目录。');
  inspectWorkspace(resolved,'选定的原工作区');
  return {...base,mode:'migrate',directory:resolved,source:resolved};
 }
 return {...base,mode:'bootstrap',directory:bootstrap};
}
function legacyDirectories(home:string,appData:string){
 const result=[{directory:path.join(appData,'专注记'),label:'原标准目录'}];
 const packages=path.join(home,'AppData','Local','Packages');
 if(existsSync(packages))for(const entry of readdirSync(packages,{withFileTypes:true}))if(entry.isDirectory()){
  const directory=path.join(packages,entry.name,'LocalCache','Roaming','专注记');
  if(existsSync(directory))result.push({directory,label:`应用缓存 · ${entry.name.split('_')[0]}`});
 }
 return result;
}
/** Read only business records, never device credential files. */
export function inspectWorkspace(directory:string,label:string):WorkspaceCandidate {
 assertPhysicalDirectory(directory);
 const db=new DatabaseSync(path.join(directory,'journal.sqlite'),{readOnly:true});
 try{
  if(db.prepare('PRAGMA integrity_check').get()?.integrity_check!=='ok')throw Error('SQLite 完整性检查失败');
  const rows=db.prepare('SELECT kind,id,data FROM records ORDER BY kind,id').all() as {kind:string;id:string;data:string}[];
  if(!rows.length)throw Error('数据库没有有效日志记录');
  const state=emptyState();for(const key of collections)state[key]=[];state.schemaVersion=1;
  for(const row of rows){
   if(row.kind==='meta')state.schemaVersion=JSON.parse(row.data).schemaVersion;
   else if(row.kind==='settings')state.settings=JSON.parse(row.data);
   else if(collections.includes(row.kind as typeof collections[number]))(state[row.kind as keyof JournalState] as unknown[]).push(JSON.parse(row.data));
  }
  const migrated=parseJournalBackup(JSON.stringify({format:'focus-journal',version:state.schemaVersion,state}));
  return {directory,label,items:migrated.tasks.length,sessions:migrated.sessions.length,contentHash:fingerprint(migrated),rowsHash:createHash('sha256').update(JSON.stringify(rows)).digest('hex')};
 }finally{db.close();}
}
export function discoverWorkspaces(home:string,appData:string){
 const candidates:WorkspaceCandidate[]=[],seen=new Set<string>();
 for(const candidate of legacyDirectories(home,appData)){
  if(!existsSync(candidate.directory))continue;
  const real=realpathSync.native(candidate.directory).toLowerCase();if(seen.has(real))continue;seen.add(real);
  // A partial/corrupt legacy profile must never be treated as a first installation.
  try{candidates.push(inspectWorkspace(candidate.directory,candidate.label));}
  catch{throw Error(`发现已有工作区但无法校验，未创建新数据，也未覆盖原文件：\n${candidate.directory}`);}
 }
 return candidates;
}
export function unambiguousWorkspace(candidates:WorkspaceCandidate[]){
 return candidates.length&&candidates.every(c=>c.contentHash===candidates[0].contentHash)?candidates[0]:null;
}
/** Caller must own the selected source profile's Electron lock (or bootstrap lock for fresh installs). */
export async function initializeWorkspace(target:string,source:WorkspaceCandidate|null){
 if(existsSync(target)){assertWorkspace(target);registerWorkspace(target);return;}
 assertPhysicalDirectory(path.dirname(target));
 const staging=target+'.staging-'+randomUUID();mkdirSync(staging,{recursive:false});
 try{
  if(source){
   const before=inspectWorkspace(source.directory,source.label);
   if(before.rowsHash!==source.rowsHash)throw Error('原工作区刚刚发生变化，请重新启动。');
   cpSync(source.directory,staging,{recursive:true,preserveTimestamps:true,filter:entry=>{
    const name=path.basename(entry);if(transient.has(name))return false;
    if(lstatSync(entry).isSymbolicLink())throw Error('原配置包含目录链接，请先确认链接中的数据位置。');
    return !name.endsWith('-wal')&&!name.endsWith('-shm')&&!name.endsWith('-journal')&&!(statSync(entry).isFile()&&name.endsWith('.sqlite'));
   }});
   // Back up every application SQLite database with its WAL, not just the main file.
   const copyDatabases=async(relative=''):Promise<void>=>{
    for(const entry of readdirSync(path.join(source.directory,relative),{withFileTypes:true})){
     if(transient.has(entry.name)||entry.isSymbolicLink())continue;
     const local=path.join(relative,entry.name),from=path.join(source.directory,local),to=path.join(staging,local);
     if(entry.isDirectory())await copyDatabases(local);
     else if(entry.name.endsWith('.sqlite')){
      const db=new DatabaseSync(from,{readOnly:true});try{await backup(db,to);}finally{db.close();}
     }
    }
   };
   await copyDatabases();
   const copied=inspectWorkspace(staging,'迁移校验');
   if(copied.rowsHash!==source.rowsHash||inspectWorkspace(source.directory,source.label).rowsHash!==source.rowsHash)throw Error('迁移校验未通过，原工作区已保留。');
  }else{
   const store=new SqliteJournalStore(path.join(staging,'journal.sqlite'));try{store.load();}finally{store.close();}
  }
  const marker:Marker={format:'focus-journal-workspace',version:1,id:randomUUID(),database:'journal.sqlite',ready:true,createdAt:new Date().toISOString(),source:source?.directory??null,sourceRowsHash:source?.rowsHash??null};
  writeFileSync(path.join(staging,WORKSPACE_MARKER),JSON.stringify(marker,null,2),{flag:'wx',mode:0o600});
  assertWorkspace(staging);
  // A competing initializer cannot replace another initialized workspace.
  if(existsSync(target))throw Error('目标工作区已存在，请重新启动；未覆盖任何数据。');
  renameSync(staging,target);
  registerWorkspace(target);
 }catch(error){
  // Keep the staging copy for diagnosis/recovery; never remove the source.
  throw Error(`${error instanceof Error?error.message:'迁移失败'}\n原文件仍在原目录；未切换工作区。\n迁移副本：${staging}`);
 }
}
