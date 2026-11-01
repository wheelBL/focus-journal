import {test} from 'node:test';
import assert from 'node:assert/strict';
import {request,createServer} from 'node:http';
import {randomUUID} from 'node:crypto';
import {mkdtempSync,readFileSync,mkdirSync} from 'node:fs';
import path from 'node:path';
import {JournalService} from '../core/service';
import {emptyState,type JournalState} from '../core/types';
import {startLocalApi} from '../electron/local-api-server';
import {LocalApiController} from '../electron/local-api-controller';
import {emptyFilter} from '../core/filters';
import {condition,group,withRules} from '../core/filter-rules';
import {controlOpenApi} from '../core/control-api';

process.env.TZ='Asia/Shanghai';
class Store{path='API isolated test';state=emptyState();fail=false;load(){return structuredClone(this.state);}save(s:JournalState){if(this.fail)throw Error('SQLITE ENOSPC C:\\private\\journal.sqlite');this.state=structuredClone(s);}close(){}}
const token='a'.repeat(64);
async function setup(access:'read'|'write'='write'){
 const store=new Store(),clock={time:Date.parse('2026-10-20T14:00:00'),now(){return this.time;},monotonic(){return this.time;}},s=new JournalService(store,clock);
 let changed=0;const audits:Record<string,unknown>[]=[];
 const server=await startLocalApi({service:s,port:0,token:()=>token,access:()=>access,changed:()=>{changed++;},version:'test',audit:e=>audits.push(e)});
 const base=`http://127.0.0.1:${server.port}/v1`;
 const get=async(route:string)=>{const r=await fetch(base+route,{headers:{Authorization:`Bearer ${token}`}});return {status:r.status,body:await r.json() as any,headers:r.headers};};
 const post=async(route:string,body:unknown,headers:Record<string,string>={})=>{const r=await fetch(base+route,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json',...headers},body:JSON.stringify(body)});return {status:r.status,body:await r.json() as any};};
 const command=async(type:string,payload:Record<string,unknown>,rev?:string,key=randomUUID())=>post('/commands',{type,payload},{'If-Match':rev??(await get('/status')).body.revision,'Idempotency-Key':key});
 return {s,store,clock,server,base,get,post,command,audits,changed:()=>changed,close:()=>{server.close();s.shutdown();}};
}
const freePort=async()=>{const s=createServer();await new Promise<void>(r=>s.listen(0,'127.0.0.1',r));const port=(s.address() as {port:number}).port;await new Promise<void>((r,reject)=>s.close(e=>e?reject(e):r()));return port;};

test('API handoff closes personal work, exposes an explicit closed query and reclaim reopens',async()=>{
 const h=await setup();try{const id=(await h.command('item.create',{title:'通过 API 交接'})).body.data.createdItemIds[0];assert.equal((await h.command('item.handoff',{id,assignee:'同事'})).status,200);
 assert.equal((await h.get('/items')).body.data.items.some((t:any)=>t.id===id),false);assert.equal((await h.get('/items?status=done')).body.data.items.some((t:any)=>t.id===id),false);
 const closed=await h.get('/items?status=handed-off');assert.equal(closed.status,200);assert.equal(closed.body.data.items.find((t:any)=>t.id===id).completedAt,null);
 assert.equal((await h.command('item.reclaim',{id})).status,200);assert.equal((await h.get('/items')).body.data.items.some((t:any)=>t.id===id),true);assert.equal((await h.get('/timers')).body.data.timers?.length??0,0);
 }finally{h.close();}
});

test('content revision survives elapsed-only checkpoints while business changes still reject stale writes',async()=>{
 const h=await setup();try{
  const id=(await h.command('item.create',{title:'稳定修订'})).body.data.createdItemIds[0];await h.command('focus.start',{taskId:id});const revision=(await h.get('/status')).body.revision;
  h.clock.time+=10000;h.s.tick();assert.equal((await h.get('/status')).body.revision,revision);assert.equal((await h.get(`/items/${id}`)).body.data.effort.ownMs,10000);
  assert.equal((await h.command('outline.patch',{id,field:'title',value:'无需因时钟重试'},revision)).status,200);
  assert.equal((await h.command('outline.patch',{id,field:'title',value:'应拒绝旧修订'},revision)).status,412);
 }finally{h.close();}
});

test('AI backdates and adjusts running effort with a fresh reminder, revision checks and idempotent replay',async()=>{
 const h=await setup();try{
  const taskId=(await h.command('item.create',{title:'已做40分钟'})).body.data.createdItemIds[0];
  const started=await h.command('focus.start',{taskId,startedAt:'2026-10-20T13:20:00+08:00'});assert.equal(started.status,200);
  const sessionId=started.body.data.createdSessionIds[0];let timer=h.s.snapshot().timer!;assert.equal(timer.durationMs,2400000);assert.equal(timer.targetOffsetMs,2400000);assert.equal(h.s.tick().length,0);
  const revision=(await h.get('/status')).body.revision,key=randomUUID(),payload={sessionId,startedAt:'2026-10-20T13:10:00+08:00',expectedStart:'2026-10-20T05:20:00.000Z'};
  const changed=await h.command('focus.set-start',payload,revision,key);assert.equal(changed.status,200);const audits=h.s.snapshot().state.audit.length;
  const replay=await h.command('focus.set-start',payload,revision,key);assert.equal(replay.body.replayed,true);assert.equal(h.s.snapshot().state.audit.length,audits);assert.equal(h.s.snapshot().state.sessions.length,1);
  timer=h.s.snapshot().timer!;assert.equal(timer.durationMs,3000000);assert.equal(timer.targetOffsetMs,3000000);assert.equal((await h.get(`/items/${taskId}`)).body.data.effort.ownMs,3000000);
  assert.equal((await h.command('focus.set-start',{sessionId,startedAt:'2026-10-20T13:00:00+08:00'},revision)).status,412);
  assert.equal((await h.command('focus.set-start',{sessionId,startedAt:'2026-10-20T15:00:00+08:00'})).status,422);
  assert.equal((await h.command('focus.set-start',{sessionId,startedAt:'2026-10-20T13:00:00+08:00',targetOffsetMs:0})).status,400);
  h.clock.time+=25*60000;assert.equal(h.s.tick().length,1);assert.equal(h.s.snapshot().timer!.durationMs,75*60000);
 }finally{h.close();}
});

test('AI may start unassigned work in the past but invalid start times leave no partial session',async()=>{
 const h=await setup();try{
  const before=h.s.exportJson();assert.equal((await h.command('focus.start-unassigned',{startedAt:'2026-10-20T15:00:00+08:00'})).status,422);assert.equal(h.s.exportJson(),before);
  assert.equal((await h.command('focus.start-unassigned',{startedAt:'2026-10-20T13:20:00+08:00'})).status,200);assert.equal(h.s.snapshot().timer!.taskId,null);assert.equal(h.s.snapshot().timer!.targetOffsetMs,40*60000);
 }finally{h.close();}
});

test('AI can preserve timed evidence while correcting metadata, with strict mode validation and idempotent replay',async()=>{
 const h=await setup();try{
  const taskId=(await h.command('item.create',{title:'保留精确片段'})).body.data.createdItemIds[0],sessionId=(await h.command('focus.start',{taskId})).body.data.createdSessionIds[0];h.clock.time+=60000;assert.equal((await h.command('focus.pause',{sessionId})).status,200);h.clock.time+=300000;assert.equal((await h.command('focus.resume',{sessionId})).status,200);h.clock.time+=60000;assert.equal((await h.command('focus.stop',{sessionId})).status,200);
  const original=h.s.snapshot().state.sessions[0],revision=(await h.get('/status')).body.revision,key=randomUUID(),payload={id:original.id,taskId,preserveTiming:true,reason:'补写成果',summary:'已补充'};
  const saved=await h.command('session.manual',payload,revision,key);assert.equal(saved.status,200);const record=h.s.snapshot().state.sessions[0];assert.deepEqual({...record,summary:original.summary,updatedAt:original.updatedAt},original);
  const audits=h.s.snapshot().state.audit.length;assert.equal((await h.command('session.manual',payload,revision,key)).body.replayed,true);assert.equal(h.s.snapshot().state.audit.length,audits);
  const before=h.s.exportJson();for(const invalid of [{...payload,minutes:2},{...payload,date:'2026-10-20'},{...payload,start:null},{...payload,reason:''},{taskId,preserveTiming:true,reason:'不可新建'}]){assert.equal((await h.command('session.manual',invalid)).status,422);assert.equal(h.s.exportJson(),before);}
 }finally{h.close();}
});

test('API deletes and restores ended effort with revision safety, read access to trash and updated item totals',async()=>{
 const h=await setup();try{
  const id=(await h.command('item.create',{title:'投入归属'})).body.data.createdItemIds[0];
  const record=(await h.command('session.manual',{taskId:id,date:'2026-10-19',minutes:12,summary:'有进展'})).body.data.createdSessionIds[0];
  const revision=(await h.get('/status')).body.revision,key=randomUUID();
  const deleted=await h.command('session.delete',{id:record,summary:'放弃前补充的进展'},revision,key);assert.equal(deleted.status,200);assert.deepEqual(deleted.body.data.removedSessionIds,[record]);
  assert.equal((await h.command('session.delete',{id:record,summary:'放弃前补充的进展'},revision,key)).body.replayed,true);
  assert.equal((await h.get('/sessions')).body.data.total,0);assert.equal((await h.get('/sessions?deleted=true')).body.data.items[0].id,record);assert.equal((await h.get(`/items/${id}`)).body.data.effort.ownMs,0);assert.equal((await h.get('/sessions?deleted=yes')).status,400);
  assert.equal((await h.command('session.restore',{id:record},revision)).status,412);assert.equal((await h.command('session.restore',{id:record})).status,200);
  assert.equal((await h.get('/sessions?deleted=true')).body.data.total,0);assert.equal((await h.get('/sessions')).body.data.items[0].summary,'放弃前补充的进展');assert.equal((await h.get(`/items/${id}`)).body.data.effort.ownMs,720000);
 }finally{h.close();}
});

test('loopback API authenticates every route, rejects browser/DNS rebinding access and describes actual commands',async()=>{
 const h=await setup();try{
  assert.equal((await fetch(h.base+'/status')).status,401);
  assert.equal((await fetch(h.base+'/status',{headers:{Authorization:`Bearer ${token}`,Origin:'https://example.com'}})).status,403);
  const invalidHost=await new Promise<number>(resolve=>{const r=request(h.base+'/status',{headers:{Host:'evil.example',Authorization:`Bearer ${token}`}},res=>{res.resume();resolve(res.statusCode!);});r.end();});
  assert.equal(invalidHost,403);
  const status=await h.get('/status');assert.equal(status.status,200);assert.equal(status.headers.get('access-control-allow-origin'),null);assert.equal(status.body.data.apiVersion,'v1');assert.equal(status.body.data.localDate,'2026-10-20');
  assert.equal(JSON.stringify(status.body).includes(h.store.path),false);
  const spec=await h.get('/openapi.json');assert.equal(spec.body.openapi,'3.1.0');assert.equal(spec.body.components.securitySchemes.bearerAuth.scheme,'bearer');
  assert.deepEqual(spec.body,controlOpenApi(h.base));assert.equal((await h.get('/missing')).status,404);
 }finally{h.close();}
});

test('AI creates nested typed entries and queries actual matching items, tags, dates, effort and saved views',async()=>{
 const h=await setup();try{
  const parent=(await h.command('item.create',{title:'项目父项'})).body.data.createdItemIds[0];
  await h.command('outline.patch',{id:parent,field:'isProject',value:true});
  const child=(await h.command('item.create',{title:'测试子项',parentId:parent,tagNames:['自定义'],plannedDate:'2026-10-20',dueAt:'2026-10-23',description:'说明'})).body.data.createdItemIds[0];
  await h.command('item.focus',{id:child});
  const note=(await h.command('item.create',{title:'参考',itemType:'note',parentId:parent})).body.data.createdItemIds[0];
  const event=await h.command('item.create',{title:'会议',itemType:'event',eventAt:'2026-10-21T10:00:00+08:00',eventEnd:'2026-10-21T11:00:00+08:00'});assert.equal(event.status,200);
  const list=await h.get('/items?focus=today');assert.deepEqual(list.body.data.items.map((t:any)=>t.id),[child]);assert.equal(list.body.data.total,1);
  assert.deepEqual(list.body.data.items[0].tagNames,['自定义']);assert.equal(list.body.data.items[0].dueAt,'2026-10-23');
  const detail=await h.get(`/items/${child}`);assert.equal(detail.body.data.path.at(-2).id,parent);
  assert.equal((await h.get(`/items/${parent}`)).body.data.childIds.includes(note),true);
  assert.equal((await h.get('/items?status=all&limit=1')).body.data.items.length,1);
  assert.equal((await h.get('/items?limit=0')).status,400);assert.equal((await h.get('/items?typo=x')).status,400);
  assert.equal((await h.get('/tags')).body.data[0].name,'自定义');
  const filter=withRules(emptyFilter(),group([condition('status','is','open'),condition('focusDate','period','today')]));
  const view=h.s.execute({type:'view.save',payload:{name:'每天重点',filter}}).state.views[0];
  assert.equal((await h.get('/views')).body.data[0].id,view.id);
  assert.deepEqual((await h.get('/items?viewId='+view.id)).body.data.items.map((t:any)=>t.id),[child]);
  const query=await h.post('/items/query',{filter});assert.deepEqual(query.body.data.items.map((t:any)=>t.id),[child]);
  await h.command('task.status',{id:child,status:'done'});assert.equal((await h.get('/items?focus=today')).body.data.total,0);
  assert.equal(h.s.snapshot().state.tasks.find(t=>t.id===parent)!.status,'open');
 }finally{h.close();}
});

test('write preconditions prevent stale/concurrent overwrites, duplicate requests replay without duplicate items or audit',async()=>{
 const h=await setup();try{
  const revision=(await h.get('/status')).body.revision,key=randomUUID(),payload={title:'只创建一次'};
  const pair=await Promise.all([h.command('item.create',payload,revision,key),h.command('item.create',payload,revision,key)]);
  assert.deepEqual(pair.map(r=>r.status),[200,200]);assert.equal(pair.filter(r=>r.body.replayed).length,1);
  assert.equal(h.s.snapshot().state.tasks.filter(t=>t.title==='只创建一次').length,1);assert.equal(h.changed(),1);assert.equal(h.audits.length,1);
  assert.equal((await h.command('item.create',{title:'不同内容'},revision,key)).status,409);
  assert.equal((await h.command('item.create',{title:'旧修订'},revision)).status,412);
  const fresh=(await h.get('/status')).body.revision;
  const race=await Promise.all([h.command('item.create',{title:'竞态甲'},fresh),h.command('item.create',{title:'竞态乙'},fresh)]);
  assert.deepEqual(race.map(r=>r.status).sort(),[200,412]);
  assert.equal(JSON.stringify(h.audits).includes(token),false);assert.equal(JSON.stringify(h.audits).includes('只创建一次'),false);
  const missing=await h.post('/commands',{type:'item.create',payload});assert.equal(missing.status,428);
  h.server.close();const next=await startLocalApi({service:h.s,port:0,token:()=>token,access:()=> 'write',changed:()=>{},version:'test'});
  try{const r=await fetch(`http://127.0.0.1:${next.port}/v1/commands`,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json','If-Match':fresh,'Idempotency-Key':key},body:JSON.stringify({type:'item.create',payload})});assert.equal(r.status,412);}finally{next.close();}
 }finally{h.close();}
});

test('readonly, unknown commands, extra fields and failed domain/storage writes preserve original records',async()=>{
 const ro=await setup('read');try{assert.equal((await ro.command('item.create',{title:'禁止写入'})).status,403);assert.equal((await ro.post('/items/query',{filter:emptyFilter()})).status,200);}finally{ro.close();}
 const h=await setup();try{
  const before=h.s.exportJson();
  assert.equal((await h.command('settings.save',{targetMinutes:1,breakMinutes:1})).status,400);
  assert.equal((await h.command('item.create',{title:'额外字段',start:true})).status,400);
  for(const key of ['constructor','__proto__','toString'])assert.equal((await h.command('item.create',JSON.parse(`{"title":"未知字段","${key}":{}}`))).status,400);
  assert.equal((await h.command('item.create',{title:'非法笔记',itemType:'note',dueAt:'2026-10-22'})).status,422);
  assert.equal((await h.command('outline.patch',{id:'missing',field:'title',value:'x'})).status,422);assert.equal(h.s.exportJson(),before);
  h.store.fail=true;const result=await h.command('item.create',{title:'磁盘失败'});h.store.fail=false;
  assert.equal(result.status,500);assert.equal(result.body.error.code,'storage_error');assert.equal(JSON.stringify(result.body).includes('private'),false);assert.equal(h.s.exportJson(),before);
  const malformed=await fetch(h.base+'/commands',{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json','If-Match':'x','Idempotency-Key':randomUUID()},body:'{'});
  assert.equal(malformed.status,400);
  const oversized=await h.post('/commands',{type:'item.create',payload:{title:'a'.repeat(70000)}},{'If-Match':'x','Idempotency-Key':randomUUID()});assert.equal(oversized.status,413);
 }finally{h.store.fail=false;h.close();}
});

test('timer pause/resume/stop, unnamed assignment and manual effort preserve actual segments and update shared UI state',async()=>{
 const h=await setup();try{
  const id=(await h.command('item.create',{title:'计时事项'})).body.data.createdItemIds[0];
  const start=await h.command('focus.start',{taskId:id,targetMinutes:25});assert.equal(start.status,200);const sessionId=start.body.data.createdSessionIds[0];
  h.clock.time+=60000;await h.command('focus.pause',{sessionId});h.clock.time+=60000;await h.command('focus.resume',{sessionId});h.clock.time+=120000;
  const end=await h.command('focus.stop',{sessionId});assert.equal(end.status,200);
  assert.equal((await h.get('/timers')).body.data.timers.length,0);
  const sessions=await h.get('/sessions?taskId='+id);assert.equal(sessions.body.data.items[0].durationMs,180000);assert.equal(sessions.body.data.items[0].segments.length,2);
  assert.equal((await h.get('/items/'+id)).body.data.effort.ownMs,180000);
  const manual=await h.command('session.manual',{taskId:id,date:'2026-10-19',minutes:30,start:'2026-10-19T23:50:00+08:00',end:'2026-10-20T00:20:00+08:00',summary:'跨日补记'});assert.equal(manual.status,200);
  assert.equal((await h.get('/sessions?from=2026-10-20&to=2026-10-20')).body.data.items.length,2);
  const free=(await h.command('focus.start-unassigned',{})).body.data.createdSessionIds[0];h.clock.time+=60000;await h.command('focus.stop',{sessionId:free});
  assert.equal((await h.command('session.assign',{id:free,title:'结束后补充'})).status,200);
  assert.equal(h.s.snapshot().state.sessions.filter(s=>s.id===free).length,1);assert.equal(h.s.snapshot().state.sessions.find(s=>s.id===free)!.durationMs,60000);
 }finally{h.close();}
});

test('parent completion/moves obey domain constraints and retain original history',async()=>{
 const h=await setup();try{
  const parent=(await h.command('item.create',{title:'分支'})).body.data.createdItemIds[0],child=(await h.command('item.create',{title:'子项',parentId:parent})).body.data.createdItemIds[0],other=(await h.command('item.create',{title:'另一个项目'})).body.data.createdItemIds[0];
  assert.equal((await h.command('task.status',{id:parent,status:'done'})).status,422);
  assert.equal((await h.command('outline.move',{id:parent,targetId:child,position:'inside'})).status,422);
  await h.command('session.manual',{taskId:child,date:'2026-10-19',minutes:15});const session=h.s.snapshot().state.sessions[0];
  await h.command('outline.move',{id:parent,targetId:other,position:'inside'});
  assert.equal((await h.get('/items/'+child)).body.data.path.some((p:any)=>p.id===other),true);assert.deepEqual(h.s.snapshot().state.sessions[0],session);
  assert.equal((await h.command('item.change',{id:parent,action:'delete'})).status,422);
  assert.equal((await h.command('item.change',{id:parent,action:'delete',confirmBranch:true})).status,200);
  assert.equal((await h.get('/items')).body.data.items.some((t:any)=>t.id===child),false);
  await h.command('item.change',{id:parent,action:'restore'});assert.equal(h.s.snapshot().state.sessions[0].id,session.id);
 }finally{h.close();}
});

test('device controller defaults off, encrypts token, preserves live service on port collision, rotates and disables immediately',async()=>{
 mkdirSync('qa-evidence',{recursive:true});const dir=mkdtempSync(path.resolve('qa-evidence/local-api-config-')),file=path.join(dir,'local-api.json'),s=new JournalService(new Store());
 const vault={encrypt:(v:string)=>Buffer.from(v).toString('base64'),decrypt:(v:string)=>Buffer.from(v,'base64').toString()};
 const c=new LocalApiController(s,file,vault,()=>{},'test');let other:Awaited<ReturnType<typeof setup>>|undefined;
 try{
  assert.equal(c.status().enabled,false);assert.equal(c.status().running,false);assert.throws(()=>c.token(),/先启用/);
  const port=await freePort();await c.configure({enabled:true,port,access:'write'});const secret=c.token();
  assert.equal(readFileSync(file,'utf8').includes(secret),false);
  const call=(key:string)=>fetch(c.status().baseUrl+'/status',{headers:{Authorization:`Bearer ${key}`}});
  assert.equal((await call(secret)).status,200);other=await setup();
  await assert.rejects(c.configure({enabled:true,port:other.server.port,access:'read'}),/不可用/);
  assert.equal(c.status().port,port);assert.equal(c.status().access,'write');assert.equal((await call(secret)).status,200);
  const next=c.rotateToken();assert.notEqual(next,secret);assert.equal((await call(secret)).status,401);assert.equal((await call(next)).status,200);
  const url=c.status().baseUrl!;await c.configure({enabled:false,port,access:'read'});assert.equal(c.status().running,false);await assert.rejects(fetch(url+'/status'));
  await c.configure({enabled:true,port,access:'read'});c.dispose();const restored=new LocalApiController(s,file,vault,()=>{},'test');
  try{await restored.initialize();assert.equal(restored.status().running,true);assert.equal(restored.token(),next);}finally{restored.dispose();}
 }finally{c.dispose();other?.close();s.shutdown();}
});

test('unavailable token encryption never starts or saves an open endpoint',async()=>{
 const dir=mkdtempSync(path.resolve('qa-evidence/local-api-unavailable-')),s=new JournalService(new Store()),c=new LocalApiController(s,path.join(dir,'local-api.json'),{encrypt:()=>{throw Error('unavailable');},decrypt:()=>{throw Error('unavailable');}},()=>{},'test');
 try{await assert.rejects(c.configure({enabled:true,port:await freePort(),access:'write'}),/密钥保护/);assert.equal(c.status().running,false);assert.equal(c.status().enabled,false);}finally{c.dispose();s.shutdown();}
});


test('API groups reject execution and appear in all-items search',async()=>{const h=await setup();try{const created=await h.command('item.create',{title:'API 分组',itemType:'group',parentId:null});assert.equal(created.status,200);const id=created.body.data.createdItemIds[0];assert.equal((await h.get('/items?status=all&query=API')).body.data.items.find((t:any)=>t.id===id).itemType,'group');assert.equal((await h.get('/items')).body.data.items.some((t:any)=>t.id===id),false);assert.equal((await h.command('focus.start',{taskId:id})).status,422);assert.equal((await h.command('item.create',{title:'非法',itemType:'group',dueAt:'2026-10-23'})).status,422);assert.equal((await h.command('outline.patch',{id,field:'itemType',value:'task'})).status,200);}finally{h.close();}});
