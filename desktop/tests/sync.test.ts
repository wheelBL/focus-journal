import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,readdirSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {JournalService,parseJournalBackup} from '../core/service';
import {emptyState,type JournalState} from '../core/types';
import {fingerprint,parseSyncDocument,syncDocument} from '../core/sync-data';
import {SyncController} from '../electron/sync-controller';
import {FileSyncPersistence,blankSync,SyncError,validateSyncInput,type SavedSync} from '../electron/sync-storage';
import type {JournalRemote} from '../electron/gitcode-remote';

class Store {path='sync tests';state=emptyState();fail=false;load(){return structuredClone(this.state);}save(s:JournalState){if(this.fail)throw new Error('disk full');this.state=structuredClone(s);}close(){}}
class SharedRemote implements JournalRemote {
 head:string|null=null;content:string|null=null;writes=0;reads=0;readHook:(()=>void|Promise<void>)|null=null;fail=false;
 async test(){if(this.fail)throw new SyncError('network unavailable');}
 async read(){this.reads++;await this.readHook?.();if(this.fail)throw new SyncError('network unavailable');return {head:this.head,content:this.content};}
 async write(expected:string|null,content:string){if(this.fail)throw new SyncError('network unavailable');if(expected!==this.head)throw new SyncError('remote changed');this.content=content;this.head=String(++this.writes);return this.head;}
}
const config={repository:'https://gitcode.com/test/journal.git',username:'tester',branch:'focus-journal',token:'test-token-should-not-leak'};
const vault={encrypt:(_:string)=>'encrypted-byte-sequence',decrypt:(_:string)=>config.token};
function setup(remote=new SharedRemote()) {
 const store=new Store(),service=new JournalService(store);let saved=blankSync(),backupFail=false,saveFail=false;
 const backups:string[]=[],statuses:unknown[]=[],persistence={load:()=>structuredClone(saved),save:(s:SavedSync)=>{if(saveFail)throw new Error('disk full');saved=structuredClone(s);}};
 const deps={journal:service,persistence,vault,remote:()=>remote,backup:(s:string)=>{if(backupFail)throw new Error('disk full');backups.push(s);},changed:(s:unknown)=>statuses.push(s),journalChanged:()=>{}};
 const sync=new SyncController(deps);sync.configure(config);
 return {store,service,sync,remote,backups,statuses,deps,get saved(){return saved;},failBackup:()=>backupFail=true,failSave:()=>saveFail=true};
}
const add=(s:JournalService,title:string)=>s.execute({type:'task.save',payload:{title,estimateMinutes:25,dueAt:'2026-10-23'}}).state.tasks.at(-1)!.id;
const rename=(s:JournalService,id:string,value:string)=>s.execute({type:'outline.patch',payload:{id,field:'title',value}});

test('GitCode configuration rejects credentials in URLs, other hosts and invalid branches',()=>{
 assert.equal(validateSyncInput({...config,repository:'https://gitcode.com/test/journal/'}).repository,config.repository);
 for(const repository of ['http://gitcode.com/a/b','https://example.com/a/b','https://gitcode.com.evil.test/a/b','https://u:secret@gitcode.com/a/b','https://gitcode.com/a/b?token=secret','https://gitcode.com/a/b#secret','https://gitcode.com:444/a/b','https://gitcode.com/a'])assert.throws(()=>validateSyncInput({...config,repository}));
 for(const branch of ['a..b','a.lock','a//b','a/','refs/@{main}','.hidden','a/.secret'])assert.throws(()=>validateSyncInput({...config,branch}));
 const a=setup();assert.doesNotMatch(JSON.stringify(a.sync.status())+JSON.stringify(a.saved)+a.service.exportJson(),/test-token-should-not-leak/);
 assert.throws(()=>a.sync.configure({...config,token:'',repository:'https://gitcode.com/test/another.git'}),/令牌/);
 a.sync.configure({...config,token:''});assert.equal(a.saved.config!.encryptedToken,'encrypted-byte-sequence');
});

test('two machines upload, download and continue with hierarchy, tags, views and all journal collections',async()=>{
 const a=setup(),b=setup(a.remote);a.service.seedDemo();
 const initial=a.service.snapshot().state;initial.tags=[{id:'tag',name:'自定义'}];initial.tasks.filter((t:{id:string})=>t.id!=='inbox')[0].tagIds=['tag'];initial.views=[{id:'view',name:'本周',filter:{view:'all',query:'',showDone:false,scopeId:null,tagIds:['tag'],tagMode:'all',planned:'any',completed:'any',due:'this-week',projectsOnly:false}}];
 a.service.importJson(JSON.stringify({format:'focus-journal',version:7,state:initial}));
 assert.equal((await a.sync.run()).phase,'ok');assert.equal((await b.sync.run()).phase,'ok');
 assert.equal(fingerprint(a.service.snapshot().state),fingerprint(b.service.snapshot().state));assert.equal(b.backups.length,1);
 const id=b.service.snapshot().state.tasks.filter((t:{id:string})=>t.id!=='inbox')[0].id;rename(b.service,id,'第二台电脑继续');await b.sync.run();await a.sync.run();assert.equal(a.service.snapshot().state.tasks.find(t=>t.id===id)!.title,'第二台电脑继续');
 assert.equal(a.backups.length,1);assert.ok(a.sync.status().lastSuccess);const restarted=new SyncController(a.deps);assert.equal(restarted.status().lastSuccess,a.saved.lastSuccess);assert.equal((await restarted.run()).phase,'ok');
});

test('device settings, selection and timer reminders do not cause false content changes',async()=>{
 const a=setup(),b=setup(a.remote),id=add(a.service,'任务');await a.sync.run();await b.sync.run();
 a.service.execute({type:'settings.save',payload:{targetMinutes:30,breakMinutes:10}});a.service.execute({type:'task.select',payload:{id}});await a.sync.run();assert.equal(a.remote.writes,1);
 rename(b.service,id,'更新标题');await b.sync.run();await a.sync.run();assert.equal(a.service.snapshot().state.settings.targetMinutes,30);assert.equal(a.service.snapshot().state.settings.selectedTaskId,id);
});

test('both sides edited: no automatic overwrite; remote choice backs up complete local content',async()=>{
 const a=setup(),b=setup(a.remote),id=add(a.service,'初始');await a.sync.run();await b.sync.run();
 rename(a.service,id,'本机修改');rename(b.service,id,'远端修改');await b.sync.run();const original=a.service.exportJson();let result=await a.sync.run();
 assert.equal(result.phase,'conflict');assert.equal(a.backups.length,0);assert.equal(a.remote.writes,2);
 result=await a.sync.resolve(result.conflict!.id,'remote');assert.equal(result.phase,'ok');assert.equal(a.service.snapshot().state.tasks.filter((t:{id:string})=>t.id!=='inbox')[0].title,'远端修改');assert.equal(parseJournalBackup(a.backups[0]).tasks.filter((t:{id:string})=>t.id!=='inbox')[0].title,'本机修改');assert.ok(JSON.parse(original).state.tasks.filter((t:{id:string})=>t.id!=='inbox')[0].id===id);
});

test('first connection with independent nonempty data requires choice; local choice appends remote history',async()=>{
 const a=setup(),b=setup(a.remote);add(a.service,'A');add(b.service,'B');await a.sync.run();let state=await b.sync.run();assert.equal(state.phase,'conflict');
 const old=b.remote.content;state=await b.sync.resolve(state.conflict!.id,'local');assert.equal(state.phase,'ok');assert.notEqual(b.remote.content,old);assert.equal(b.remote.writes,2);assert.equal(parseSyncDocument(b.remote.content!).state.tasks.filter((t:{id:string})=>t.id!=='inbox')[0].title,'B');assert.equal(b.backups.length,1);
});

test('running timers block sync; paused sessions move with preserved effort and never auto-run',async()=>{
 const a=setup(),b=setup(a.remote),id=add(a.service,'计时');a.service.execute({type:'focus.start',payload:{taskId:id}});
 const failed=await a.sync.run();assert.equal(failed.phase,'error');assert.match(failed.message,/暂停/);assert.equal(a.remote.reads,0);
 a.service.execute({type:'focus.pause'});const duration=a.service.snapshot().timers[0].durationMs;await a.sync.run();await b.sync.run();assert.equal(b.service.snapshot().timers[0].paused,true);assert.equal(b.service.snapshot().timers[0].durationMs,duration);
 rename(b.service,id,'暂停时改名');await b.sync.run();await a.sync.run();assert.equal(a.service.snapshot().timers[0].paused,true);assert.equal(a.service.snapshot().state.tasks.filter((t:{id:string})=>t.id!=='inbox')[0].title,'暂停时改名');
});

test('malformed remote, dangling hierarchy and future schema cannot replace local data',async()=>{
 const a=setup();add(a.service,'保留');await a.sync.run();const before=fingerprint(a.service.snapshot().state);
 const original=a.remote.content!;
 for(const corrupt of ['not json',JSON.stringify({...JSON.parse(original),version:99}),JSON.stringify({...JSON.parse(original),state:{...JSON.parse(original).state,schemaVersion:99}})]){a.remote.content=corrupt;assert.equal((await a.sync.run()).phase,'error');assert.equal(fingerprint(a.service.snapshot().state),before);assert.equal(a.backups.length,0);}
 const bad=JSON.parse(original);bad.state.tasks.filter((t:{id:string})=>t.id!=='inbox')[0].parentId=bad.state.tasks.filter((t:{id:string})=>t.id!=='inbox')[0].id;a.remote.content=JSON.stringify(bad);assert.equal((await a.sync.run()).phase,'error');assert.equal(fingerprint(a.service.snapshot().state),before);
});

test('backup failure and database failure stop downloads without changing local data',async()=>{
 for(const failure of ['backup','database']){const a=setup(),b=setup(a.remote);add(a.service,'远端');await a.sync.run();const hash=fingerprint(b.service.snapshot().state);if(failure==='backup')b.failBackup();else b.store.fail=true;assert.equal((await b.sync.run()).phase,'error');assert.equal(fingerprint(b.service.snapshot().state),hash);assert.equal(b.saved.baseline,null);}
});

test('editing during fetch cannot be overwritten, and starting a timer during fetch is protected',async()=>{
 for(const action of ['edit','start']){const a=setup(),b=setup(a.remote),id=add(a.service,'原任务');await a.sync.run();await b.sync.run();rename(a.service,id,'远端');await a.sync.run();
  a.remote.readHook=()=>{a.remote.readHook=null;if(action==='edit')rename(b.service,id,'本机新修改');else b.service.execute({type:'focus.start',payload:{taskId:id}});};
  assert.equal((await b.sync.run()).phase,'error');assert.equal(b.service.snapshot().state.tasks.filter((t:{id:string})=>t.id!=='inbox')[0].title,action==='edit'?'本机新修改':'原任务');assert.equal(b.backups.length,1);
 }
});

test('stale conflict choices refresh the comparison instead of replacing newer local or remote content',async()=>{
 for(const side of ['local','remote']){const a=setup(),b=setup(a.remote),id=add(a.service,'原任务');await a.sync.run();await b.sync.run();rename(a.service,id,'远端新');await a.sync.run();rename(b.service,id,'本机新');const c=await b.sync.run();
  if(side==='local')rename(b.service,id,'本机更新');else {rename(a.service,id,'远端更新');await a.sync.run();}
  const result=await b.sync.resolve(c.conflict!.id,'remote');assert.equal(result.phase,'conflict');assert.notEqual(result.conflict!.id,c.conflict!.id);assert.equal(b.service.snapshot().state.tasks.filter((t:{id:string})=>t.id!=='inbox')[0].title,side==='local'?'本机更新':'本机新');
 }
});

test('remote deletion is surfaced without silently resurrecting or removing records',async()=>{
 const a=setup();add(a.service,'任务');await a.sync.run();a.remote.content=null;a.remote.head='deleted';const state=await a.sync.run();assert.equal(state.phase,'conflict');assert.equal(state.conflict!.remote,null);assert.equal(a.service.snapshot().state.tasks.filter((t:{id:string})=>t.id!=='inbox').length,1);assert.equal(a.remote.writes,1);
});

test('network failures and credential failures preserve data and never echo raw errors or tokens',async()=>{
 const a=setup();add(a.service,'任务');const hash=fingerprint(a.service.snapshot().state);a.remote.fail=true;assert.equal((await a.sync.run()).phase,'error');assert.equal(fingerprint(a.service.snapshot().state),hash);
 a.remote.fail=false;a.remote.readHook=()=>{throw new Error(config.token);};const result=await a.sync.run();assert.doesNotMatch(result.message,new RegExp(config.token));assert.equal(a.saved.baseline,null);
 const bad=new SyncController({...a.deps,vault:{...vault,decrypt:()=>{throw new Error(config.token);}}});assert.match((await bad.run()).message,/解密/);
});

test('overlapping operations are rejected and quit aborts pending work before a download',async()=>{
 const a=setup(),b=setup(a.remote);add(a.service,'远端');await a.sync.run();let release!:()=>void;let entered!:()=>void;const ready=new Promise<void>(r=>entered=r);a.remote.readHook=async()=>{entered();await new Promise<void>(r=>release=r);};
 const pending=b.sync.run();await ready;await assert.rejects(b.sync.run(),/正在进行/);assert.throws(()=>b.sync.configure(config),/正在进行/);b.sync.dispose();release();await pending;assert.equal(b.service.snapshot().state.tasks.filter((t:{id:string})=>t.id!=='inbox').length,0);assert.equal(b.backups.length,0);
});

test('upload acknowledgement loss and metadata save failure recover on the next sync without a blind overwrite',async()=>{
 const a=setup();add(a.service,'任务');const originalWrite=a.remote.write.bind(a.remote);let first=true;
 a.remote.write=async(h,c)=>{const id=await originalWrite(h,c);if(first){first=false;throw new SyncError('connection lost');}return id;};
 assert.equal((await a.sync.run()).phase,'error');assert.equal(a.saved.baseline,null);assert.equal((await a.sync.run()).phase,'ok');assert.equal(a.remote.writes,1);
 const b=setup();add(b.service,'另一个任务');b.failSave();assert.equal((await b.sync.run()).phase,'error');assert.equal(b.saved.baseline,null);assert.equal(b.service.snapshot().state.tasks.filter((t:{id:string})=>t.id!=='inbox').length,1);
});

test('configuration and baseline persist atomically outside exported journal; disconnect preserves records',()=>{
 const folder=mkdtempSync(path.resolve('qa-evidence/journal-sync-'));try{
  const file=path.join(folder,'sync-config.json'),store=new FileSyncPersistence(file),a=setup();const saved=a.saved;store.save(saved);assert.deepEqual(store.load(),saved);assert.doesNotMatch(readFileSync(file,'utf8'),new RegExp(config.token));assert.deepEqual(readdirSync(folder),['sync-config.json']);
  add(a.service,'本机保留');a.sync.disconnect();assert.equal(a.sync.status().config,null);assert.equal(a.service.snapshot().state.tasks.filter((t:{id:string})=>t.id!=='inbox').length,1);assert.equal(a.saved.config,null);
 }finally{rmSync(folder,{recursive:true,force:true});}
});
