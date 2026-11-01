import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,existsSync,readdirSync,renameSync,rmSync,symlinkSync} from 'node:fs';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {JournalService} from '../core/service';
import {SqliteJournalStore} from '../core/store';
import {workspacePlan,inspectWorkspace,initializeWorkspace,discoverWorkspaces,unambiguousWorkspace,WORKSPACE_MARKER,normalLaunchArgs} from '../electron/workspace-location';
import {windowsCommandLine,outsideLaunchScript} from '../electron/windows-workspace-launch';

mkdirSync('qa-data',{recursive:true});
function fixture(){
 const root=mkdtempSync(path.resolve('qa-data/workspace-location-')),home=path.join(root,'home'),appData=path.join(home,'AppData','Roaming');mkdirSync(appData,{recursive:true});
 const canonical=path.join(home,'.focus-journal'),legacy=path.join(appData,'专注记');
 const options={platform:'win32' as const,home,appData,defaultUserData:legacy,args:[] as string[]};
 return {root,home,appData,canonical,legacy,options,cleanup(){assert.equal(path.dirname(root),path.resolve('qa-data'));rmSync(root,{recursive:true,force:true});}};
}
function seed(directory:string,title='保留身份和投入'){
 const service=new JournalService(new SqliteJournalStore(path.join(directory,'journal.sqlite')));
 try{const added=service.execute({type:'task.save',payload:{title,parentId:'inbox'}}),id=added.state.tasks.at(-1)!.id;
 service.execute({type:'session.manual',payload:{taskId:id,date:'2026-10-22',minutes:12,summary:'迁移前记录'}});}finally{service.shutdown();}
 return inspectWorkspace(directory,'测试来源');
}
test('normal Windows entries share one home directory independent of appData and cwd',async()=>{
 const f=fixture();try{
  await initializeWorkspace(f.canonical,seed(f.legacy));
  for(const args of [[],['--workspace-outside'],['--some-electron-flag'],['--migrate-workspace',f.legacy]]){
   const plan=workspacePlan({...f.options,args,appData:path.join(f.root,'different-launcher-cache')});assert.equal(plan.mode,'normal');assert.equal(plan.directory,f.canonical);assert.equal(plan.explicit,false);
  }
 }finally{f.cleanup();}
});
test('explicit QA profiles remain isolated, malformed or duplicate directory options fail',()=>{
 const f=fixture();try{
  const qa=path.join(f.root,'qa');assert.equal(workspacePlan({...f.options,args:['--demo','--data-dir',qa]}).directory,qa);assert.equal(existsSync(f.canonical),false);
  for(const args of [['--data-dir'],['--data-dir','--demo'],['--data-dir',qa,'--data-dir',qa],['--demo'],['--tree-prototype'],['--data-dir',qa,'--migrate-workspace',f.legacy]])assert.throws(()=>workspacePlan({...f.options,args}));
 }finally{f.cleanup();}
});
test('macOS keeps its established profile and does not bootstrap a Windows directory',()=>{
 const f=fixture();try{const original=path.join(f.home,'Library','Application Support','专注记');const plan=workspacePlan({...f.options,platform:'darwin',defaultUserData:original});assert.equal(plan.directory,original);assert.equal(plan.mode,'normal');assert.equal(existsSync(f.canonical),false);}finally{f.cleanup();}
});
test('first startup never opens a new journal before migration has completed',()=>{
 const f=fixture();try{seed(f.legacy);const plan=workspacePlan(f.options);assert.equal(plan.mode,'bootstrap');assert.equal(plan.directory,path.join(f.home,'.focus-journal-bootstrap'));assert.equal(existsSync(f.canonical),false);}finally{f.cleanup();}
});
test('redirected AppData re-enters an independent process once and cannot fall back to its cache',()=>{
 const f=fixture();try{
  const cached=path.join(f.root,'cached');seed(cached);symlinkSync(cached,f.legacy,'junction');
  assert.equal(workspacePlan(f.options).mode,'outside');assert.throws(()=>workspacePlan({...f.options,args:['--workspace-outside']}),/未打开缓存/);assert.equal(existsSync(f.canonical),false);
 }finally{f.cleanup();}
});
test('distinct standard and MSIX profiles require an explicit choice instead of picking the largest',()=>{
 const f=fixture();try{
  seed(f.legacy,'标准目录事项');const cache=path.join(f.home,'AppData','Local','Packages','TestApp_x','LocalCache','Roaming','专注记');seed(cache,'缓存目录事项');
  const candidates=discoverWorkspaces(f.home,f.appData);assert.equal(candidates.length,2);assert.equal(unambiguousWorkspace(candidates),null);
  assert.equal(workspacePlan({...f.options,args:['--migrate-workspace',cache]}).mode,'migrate');assert.throws(()=>workspacePlan({...f.options,args:['--migrate-workspace',f.root]}),/迁移来源/);
 }finally{f.cleanup();}
});
test('migration copies complete raw journal, device data, browser drafts, backups and encrypted bytes',async()=>{
 const f=fixture();try{
  const candidate=seed(f.legacy);mkdirSync(path.join(f.legacy,'Local Storage','leveldb'),{recursive:true});mkdirSync(path.join(f.legacy,'backups'));mkdirSync(path.join(f.legacy,'Cache'));
  const files={'ai-config.json':'synthetic encrypted configuration','sync-config.json':'synthetic encrypted sync config','Local State':'synthetic profile encryption state','Local Storage/leveldb/000003.log':'synthetic unsaved draft','backups/history.json':'synthetic backup','appearance.json':'{"theme":"dark"}'};
  for(const [relative,content] of Object.entries(files))writeFileSync(path.join(f.legacy,relative),content);
  writeFileSync(path.join(f.legacy,'Cache','discardable'),'cache');writeFileSync(path.join(f.legacy,'lockfile'),'stale lock');
  await initializeWorkspace(f.canonical,candidate);
  assert.equal(inspectWorkspace(f.canonical,'目标').rowsHash,candidate.rowsHash);assert.equal(inspectWorkspace(f.legacy,'原目录').rowsHash,candidate.rowsHash);
  for(const [relative,content] of Object.entries(files))assert.equal(readFileSync(path.join(f.canonical,relative),'utf8'),content);
  assert.equal(existsSync(path.join(f.canonical,'Cache')),false);assert.equal(existsSync(path.join(f.canonical,'lockfile')),false);
  const marker=JSON.parse(readFileSync(path.join(f.canonical,WORKSPACE_MARKER),'utf8'));assert.equal(marker.source,f.legacy);assert.equal(marker.ready,true);assert.equal(marker.sourceRowsHash,candidate.rowsHash);
 }finally{f.cleanup();}
});
test('migration includes WAL transactions in the journal and independent application databases',async()=>{
 const f=fixture();let db:DatabaseSync|undefined;try{
  seed(f.legacy);db=new DatabaseSync(path.join(f.legacy,'usage.sqlite'));db.exec('PRAGMA journal_mode=WAL; CREATE TABLE events(id INTEGER PRIMARY KEY,value TEXT); INSERT INTO events(value) VALUES (\'synthetic history\')');
  const candidate=inspectWorkspace(f.legacy,'有 WAL 的目录');await initializeWorkspace(f.canonical,candidate);
  const copied=new DatabaseSync(path.join(f.canonical,'usage.sqlite'),{readOnly:true});try{assert.equal(copied.prepare('SELECT value FROM events').get()!.value,'synthetic history');}finally{copied.close();}
 }finally{db?.close();f.cleanup();}
});
test('changed source, incomplete canonical marker or missing database never creates an empty workspace',async()=>{
 const f=fixture();try{
  const candidate=seed(f.legacy),db=new DatabaseSync(path.join(f.legacy,'journal.sqlite'));db.prepare("UPDATE records SET data=? WHERE kind='settings'").run(JSON.stringify({...JSON.parse(db.prepare("SELECT data FROM records WHERE kind='settings'").get()!.data as string),targetMinutes:30}));db.close();
  await assert.rejects(initializeWorkspace(f.canonical,candidate),/发生变化/);assert.equal(existsSync(f.canonical),false);assert.ok(readdirSync(f.home).some(n=>n.startsWith('.focus-journal.staging-')));
  mkdirSync(f.canonical);assert.throws(()=>workspacePlan(f.options),/未创建空白/);
  writeFileSync(path.join(f.canonical,WORKSPACE_MARKER),JSON.stringify({format:'focus-journal-workspace',version:1,id:'test',database:'journal.sqlite',ready:true}));assert.throws(()=>workspacePlan(f.options),/数据库缺失/);
 }finally{f.cleanup();}
});
test('invalid legacy database blocks new initialization and leaves original bytes intact',()=>{
 const f=fixture();try{mkdirSync(f.legacy);const file=path.join(f.legacy,'journal.sqlite');writeFileSync(file,'corrupt journal');assert.throws(()=>discoverWorkspaces(f.home,f.appData),/无法校验/);assert.equal(readFileSync(file,'utf8'),'corrupt journal');assert.equal(existsSync(f.canonical),false);}finally{f.cleanup();}
});
test('an existing marker cannot turn an empty or corrupt journal into a new database',async()=>{
 const f=fixture();try{await initializeWorkspace(f.canonical,null);const file=path.join(f.canonical,'journal.sqlite');writeFileSync(file,'');assert.throws(()=>workspacePlan(f.options),/未创建空白/);assert.equal(readFileSync(file).length,0);writeFileSync(file,'damaged');assert.throws(()=>workspacePlan(f.options),/未创建空白/);assert.equal(readFileSync(file,'utf8'),'damaged');}finally{f.cleanup();}
});
test('a missing registered directory cannot be mistaken for a fresh install or reopen old copies',async()=>{
 const f=fixture();try{await initializeWorkspace(f.canonical,seed(f.legacy));renameSync(f.canonical,path.join(f.root,'preserved-missing-workspace'));assert.throws(()=>workspacePlan(f.options),/已登记的工作区目录缺失/);assert.equal(existsSync(f.canonical),false);assert.equal(inspectWorkspace(f.legacy,'保留来源').sessions,1);}finally{f.cleanup();}
});
test('workspace identity mismatch stops startup rather than adopting an unexpected replacement',async()=>{
 const f=fixture();try{await initializeWorkspace(f.canonical,null);const file=path.join(f.canonical,WORKSPACE_MARKER),marker=JSON.parse(readFileSync(file,'utf8'));writeFileSync(file,JSON.stringify({...marker,id:'different-workspace'}));assert.throws(()=>workspacePlan(f.options),/登记与实际数据不一致/);}finally{f.cleanup();}
});
test('fresh workspace is published atomically and repeated initialization cannot replace it',async()=>{
 const f=fixture();try{await initializeWorkspace(f.canonical,null);const before=readFileSync(path.join(f.canonical,WORKSPACE_MARKER),'utf8'),hash=inspectWorkspace(f.canonical,'新目录').rowsHash;await initializeWorkspace(f.canonical,seed(f.legacy));assert.equal(readFileSync(path.join(f.canonical,WORKSPACE_MARKER),'utf8'),before);assert.equal(inspectWorkspace(f.canonical,'新目录').rowsHash,hash);}finally{f.cleanup();}
});
test('independent launcher quotes native arguments and never interpolates user paths as PowerShell code',()=>{
 const executable='C:\\folder with spaces\\专注记.exe',args=['a"b','C:\\trailing\\','$(Write-Output unsafe)','`literal`',"single'quote"];
 assert.equal(windowsCommandLine(['C:\\end\\']),'"C:\\end\\\\"');assert.equal(windowsCommandLine(['a"b']),'"a\\"b"');
 const script=outsideLaunchScript(executable,args,'C:\\cwd');assert.equal(script.includes('$(Write-Output unsafe)'),false);
 const encoded=script.match(/FromBase64String\('([^']+)'\)/)![1],payload=JSON.parse(Buffer.from(encoded,'base64').toString());assert.equal(payload.command,windowsCommandLine([executable,...args]));assert.equal(payload.cwd,'C:\\cwd');
 assert.deepEqual(normalLaunchArgs(['--migrate-workspace','source','--workspace-outside','app','--other']),['app','--other']);
});
