import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {JournalService} from '../core/service';
import {emptyState,type JournalState} from '../core/types';
import {SyncController} from '../electron/sync-controller';
import {blankSync,type SavedSync} from '../electron/sync-storage';
import {startLocalApi} from '../electron/local-api-server';

class Store {path='API sync test';state=emptyState();load(){return structuredClone(this.state);}save(s:JournalState){this.state=structuredClone(s);}close(){}}
class Remote {
 head:string|null=null;content:string|null=null;reads=0;writes=0;hook:(()=>Promise<void>)|null=null;
 async test(){}
 async read(){this.reads++;await this.hook?.();return {head:this.head,content:this.content};}
 async write(expected:string|null,content:string){assert.equal(expected,this.head);this.content=content;this.head=String(++this.writes);return this.head;}
}
const secret='b'.repeat(64),config={repository:'https://gitcode.com/test/journal.git',username:'tester',branch:'focus-journal',token:'never-expose-this-credential'};
function machine(remote:Remote){
 const service=new JournalService(new Store()),backups:string[]=[];let saved=blankSync(),updates=0;
 const sync=new SyncController({journal:service,persistence:{load:()=>saved,save:(next:SavedSync)=>{saved=structuredClone(next);}},vault:{encrypt:()=>'<encrypted>',decrypt:()=>config.token},remote:()=>remote,backup:content=>backups.push(content),changed:()=>{},journalChanged:()=>{updates++;}});
 return {service,sync,backups,updates:()=>updates,close:()=>{sync.dispose();service.shutdown();}};
}
async function setup(configured=true,access:'read'|'write'='write'){
 const remote=new Remote(),a=machine(remote);if(configured)a.sync.configure(config);
 const server=await startLocalApi({service:a.service,port:0,token:()=>secret,access:()=>access,version:'test',changed:()=>{},sync:a.sync});
 const url=`http://127.0.0.1:${server.port}/v1`;
 const get=async(route:string)=>{const r=await fetch(url+route,{headers:{Authorization:`Bearer ${secret}`}});return {status:r.status,body:await r.json() as any};};
 const post=async(route:string,body:unknown={},rev?:string,key=randomUUID())=>{const r=await fetch(url+route,{method:'POST',headers:{Authorization:`Bearer ${secret}`,'Content-Type':'application/json','If-Match':rev??(await get('/status')).body.revision,'Idempotency-Key':key},body:JSON.stringify(body)});return {status:r.status,body:await r.json() as any};};
 const finish=async(result:any)=>{assert.equal(result.status,202);for(let n=0;n<100;n++){const job=(await get('/sync/operations/'+result.body.data.operation.id)).body.data;if(job.state==='finished')return job;await delay(5);}throw Error('Operation did not finish');};
 return {...a,remote,get,post,finish,close:()=>{server.close();a.close();}};
}
const add=(s:JournalService,title:string)=>s.execute({type:'task.save',payload:{title}}).state.tasks.at(-1)!.id;
const rename=(s:JournalService,id:string,value:string)=>s.execute({type:'outline.patch',payload:{id,field:'title',value}});

test('sync API exposes no credentials, requires configuration/write access, and never implicitly pauses timers',async()=>{
 const h=await setup(false);try{
  assert.equal((await h.get('/sync/status')).body.data.phase,'unconfigured');
  assert.equal((await h.post('/sync/run')).body.error.code,'sync_not_configured');
  h.sync.configure(config);
  assert.doesNotMatch(JSON.stringify((await h.get('/sync/status')).body),/never-expose|encryptedToken|<encrypted>/);
  assert.equal((await h.post('/sync/run',{token:'secret'})).status,400);
  const id=add(h.service,'计时保留');h.service.execute({type:'focus.start',payload:{taskId:id}});
  assert.equal((await h.post('/sync/run')).body.error.code,'timers_running');assert.equal(h.service.snapshot().timers[0].paused,false);assert.equal(h.remote.reads,0);
  h.service.execute({type:'focus.pause'});
  assert.equal((await h.finish(await h.post('/sync/run'))).result.phase,'ok');
 }finally{h.close();}
 const ro=await setup(true,'read');try{assert.equal((await ro.get('/sync/status')).status,200);assert.equal((await ro.post('/sync/run')).status,403);assert.equal(ro.remote.reads,0);}finally{ro.close();}
});

test('async sync accepts immediately; retries and polling never start another transfer',async()=>{
 const h=await setup();let release=()=>{};try{
  add(h.service,'待上传');h.remote.hook=()=>new Promise<void>(r=>{release=r;});
  const revision=(await h.get('/status')).body.revision,key=randomUUID();
  const result=await h.post('/sync/run',{},revision,key);assert.equal(result.status,202);assert.equal(result.body.data.operation.state,'working');
  const replay=await h.post('/sync/run',{},revision,key);assert.equal(replay.body.replayed,true);assert.equal(replay.body.data.operation.id,result.body.data.operation.id);assert.equal(h.remote.reads,1);
  assert.equal((await h.post('/sync/run')).body.error.code,'sync_busy');
  assert.equal((await h.get('/sync/status')).body.data.phase,'working');
  assert.equal((await h.get('/sync/operations/'+result.body.data.operation.id)).body.data.state,'working');
  assert.equal((await h.post('/sync/resolve',{choice:'remote',conflictId:'missing'},revision,key)).body.error.code,'idempotency_conflict');
  h.remote.hook=null;release();assert.equal((await h.finish(result)).result.phase,'ok');assert.equal(h.remote.writes,1);
  const old=await h.post('/sync/run',{},revision,key);assert.equal(old.body.replayed,true);assert.equal(h.remote.writes,1);
  assert.equal((await h.get('/sync/operations/'+randomUUID())).status,404);
 }finally{release();h.close();}
});

test('sync conflict resolution is explicit, revision guarded, backed up, and keeps original item identity',async()=>{
 const h=await setup(),b=machine(h.remote);b.sync.configure(config);
 try{
  const id=add(h.service,'原始');await h.finish(await h.post('/sync/run'));await b.sync.run();
  rename(h.service,id,'本机');rename(b.service,id,'另一台');await b.sync.run();
  const conflict=(await h.finish(await h.post('/sync/run'))).result.conflict;assert.ok(conflict.id);assert.equal(h.backups.length,0);
  assert.equal((await h.post('/sync/resolve',{conflictId:conflict.id})).status,400);
  assert.equal((await h.post('/sync/resolve',{conflictId:'old',choice:'remote'})).body.error.code,'conflict_expired');
  const stale=(await h.get('/status')).body.revision;rename(h.service,id,'本机追加');
  assert.equal((await h.post('/sync/resolve',{conflictId:conflict.id,choice:'remote'},stale)).status,412);
  // A fresh API revision does not bypass the controller's original conflict comparison.
  const refreshed=await h.finish(await h.post('/sync/resolve',{conflictId:conflict.id,choice:'remote'}));
  assert.equal(refreshed.result.phase,'conflict');assert.notEqual(refreshed.result.conflict.id,conflict.id);assert.equal(h.backups.length,0);
  const before=(await h.get('/status')).body.revision;
  const done=await h.finish(await h.post('/sync/resolve',{conflictId:refreshed.result.conflict.id,choice:'remote'}));
  assert.equal(done.result.phase,'ok');assert.equal(h.service.snapshot().state.tasks.find(t=>t.id===id)!.title,'另一台');assert.equal(h.backups.length,1);assert.match(h.backups[0],/本机追加/);assert.equal(h.updates(),1);
  assert.notEqual((await h.get('/status')).body.revision,before);
 }finally{h.close();b.close();}
});

test('local conflict choice uploads once, while local editing during download cannot be overwritten',async()=>{
 const h=await setup(),b=machine(h.remote);b.sync.configure(config);
 try{
  const id=add(h.service,'本机事项');add(b.service,'另一台事项');await b.sync.run();
  const conflict=(await h.finish(await h.post('/sync/run'))).result.conflict,revision=(await h.get('/status')).body.revision,key=randomUUID(),input={conflictId:conflict.id,choice:'local'};
  const accepted=await h.post('/sync/resolve',input,revision,key);assert.equal((await h.finish(accepted)).result.phase,'ok');assert.equal(h.remote.writes,2);assert.equal(h.backups.length,1);
  assert.equal((await h.post('/sync/resolve',input,revision,key)).body.replayed,true);assert.equal(h.remote.writes,2);
  await b.sync.run();rename(b.service,id,'远端变化');await b.sync.run();
  h.remote.hook=async()=>{rename(h.service,id,'同步期间编辑');h.remote.hook=null;};
  assert.equal((await h.finish(await h.post('/sync/run'))).result.phase,'error');
  assert.equal(h.service.snapshot().state.tasks.find(t=>t.id===id)!.title,'同步期间编辑');assert.equal(h.backups.length,1);
 }finally{h.close();b.close();}
});
