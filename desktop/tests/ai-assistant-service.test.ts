import {test} from 'node:test';
import assert from 'node:assert/strict';
import {AiAssistantService} from '../core/ai-assistant-service';
import {AiError,type AiCompletion,type AiCompletionRequest,type AiConnection} from '../core/ai-types';
import {JournalService} from '../core/service';
import {emptyState,type JournalState,type Command} from '../core/types';

process.env.TZ='Asia/Shanghai';
class Store {path='AI isolated service tests';state=emptyState();writes=0;fail=false;load(){return structuredClone(this.state);}save(next:JournalState){if(this.fail)throw Error('保存失败');this.state=structuredClone(next);this.writes++;}close(){}}
class Clock {time=Date.parse('2026-10-22T12:00:00+08:00');mono=0;now(){return this.time;}monotonic(){return this.mono;}advance(ms:number){this.time+=ms;this.mono+=ms;}}
const connection:AiConnection={baseUrl:'https://model.example/v1',model:'test-model',apiKey:'test-key'};
const response=(commands:Command[]=[],extra:Partial<AiCompletion>={}):AiCompletion=>({text:'根据当前信息，建议如下。',toolCalls:commands.length?[{id:'proposal',name:'propose_changes',arguments:JSON.stringify({summary:'逐条确认即可。',changes:commands.map(command=>({command,reason:'缩小开始的阻力'}))})}]:[],finishReason:commands.length?'tool_calls':'stop',...extra});
function deferred<T>(){let resolve:(value:T)=>void=()=>{},reject:(error:unknown)=>void=()=>{};const promise=new Promise<T>((res,rej)=>{resolve=res;reject=rej;});return {promise,resolve,reject};}
function setup(complete?:(connection:AiConnection,request:AiCompletionRequest)=>Promise<AiCompletion>,changed?:()=>void){
 const store=new Store(),clock=new Clock(),journal=new JournalService(store,clock);
 const root=journal.execute({type:'outline.create',payload:{kind:'task',title:'项目',parentId:null}}).state.tasks.at(-1)!.id;
 const child=journal.execute({type:'outline.create',payload:{kind:'task',title:'子事项',parentId:root}}).state.tasks.at(-1)!.id;
 const other=journal.execute({type:'outline.create',payload:{kind:'task',title:'另一事项',parentId:root}}).state.tasks.at(-1)!.id;
 let notifications=0;const assistant=new AiAssistantService(journal,async()=>connection,complete??(async()=>response([{type:'outline.patch',payload:{id:child,field:'title',value:'更明确的事项'}}])),changed??(()=>{notifications++;}));
 const generate=()=>assistant.generate({scope:{kind:'item',itemId:root},prompt:'整理和拆分'});
 return {store,clock,journal,assistant,root,child,other,generate,notifications:()=>notifications};
}

test('AI generating streams analysis and reviewable proposals without writing journal data',async()=>{
 let h:ReturnType<typeof setup>;h=setup(async(_connection,request)=>{assert.equal(request.messages.length,2);assert.equal(request.tools?.[0].function.name,'propose_changes');assert.ok(request.messages[1].content.includes(h.child));request.onDelta?.({text:'正在分析'});return response([{type:'outline.patch',payload:{id:h.child,field:'title',value:'下一步'}}]);});
 const baseline=h.journal.exportJson(),writes=h.store.writes,events:string[]=[];h.assistant.subscribe(s=>events.push(s.phase+':'+s.text));
 const state=await h.generate();assert.equal(state.phase,'done');assert.equal(state.suggestions.length,1);assert.equal(state.suggestions[0].state,'pending');assert.ok(events.some(value=>value.includes('正在分析')));assert.equal(h.journal.exportJson(),baseline);assert.equal(h.store.writes,writes);assert.equal(h.notifications(),0);
 state.suggestions[0].after='caller mutation';assert.equal(h.assistant.get().suggestions[0].after,'下一步');
});

test('invalid out-of-scope proposals retain analysis and cannot modify items',async()=>{
 const h=setup(async()=>response([{type:'outline.patch',payload:{id:'invented-id',field:'title',value:'不允许'}}]));const before=h.journal.exportJson();
 const state=await h.generate();assert.equal(state.phase,'error');assert.match(state.error??'',/范围之外/);assert.ok(state.text.trim());assert.equal(state.suggestions.length,0);assert.equal(h.journal.exportJson(),before);
});

test('AI explicitly applies one proposal through domain service and repeat confirmation is idempotent',async()=>{
 const h=setup();const state=await h.generate(),before=h.store.writes;
 const applied=h.assistant.apply({runId:state.id,suggestionId:state.suggestions[0].id});assert.equal(applied.suggestions[0].state,'applied');assert.equal(h.journal.snapshot().state.tasks.find(t=>t.id===h.child)!.title,'更明确的事项');assert.equal(h.store.writes,before+1);assert.equal(h.notifications(),1);
 h.assistant.apply({runId:state.id,suggestionId:state.suggestions[0].id});assert.equal(h.store.writes,before+1);assert.equal(h.notifications(),1);
});

test('AI created items use the existing capture command exactly once',async()=>{
 const h=setup(async()=>response([{type:'item.create',payload:{title:'第一小步',tagNames:['开始']}}]));const state=await h.generate(),count=h.journal.snapshot().state.tasks.length;
 h.assistant.apply({runId:state.id,suggestionId:'1'});h.assistant.apply({runId:state.id,suggestionId:'1'});
 const after=h.journal.snapshot().state,created=after.tasks.find(t=>t.title==='第一小步')!;assert.equal(after.tasks.length,count+1);assert.equal(created.parentId,h.root);assert.equal(after.sessions.length,0);assert.ok(created.tagIds?.length);
});

test('AI create confirmation rechecks normalized sibling names added manually after preview',async()=>{
 const h=setup(async()=>response([{type:'item.create',payload:{title:'Review API'}}]));
 const state=await h.generate();assert.equal(state.suggestions[0].state,'pending');
 const manual=h.journal.execute({type:'outline.create',payload:{kind:'task',title:'ＲＥＶＩＥＷ ＡＰＩ',parentId:h.root}}).state.tasks.at(-1)!;
 h.journal.execute({type:'outline.patch',payload:{id:manual.id,field:'description',value:'手动补充的内容应保留'}});
 const before=h.journal.exportJson(),writes=h.store.writes;
 const rejected=h.assistant.apply({runId:state.id,suggestionId:state.suggestions[0].id});
 assert.equal(rejected.suggestions[0].state,'pending');assert.match(rejected.suggestions[0].error??'',/同名事项/);assert.equal(h.store.writes,writes);assert.equal(h.notifications(),0);assert.equal(h.journal.exportJson(),before);
 const matching=h.journal.snapshot().state.tasks.filter(t=>t.parentId===h.root&&t.title.trim().normalize('NFKC').toLocaleLowerCase()==='review api');assert.equal(matching.length,1);assert.equal(matching[0].id,manual.id);assert.equal(matching[0].description,'手动补充的内容应保留');
});

test('AI confirmation refuses a genuine edit and keeps the new user content',async()=>{
 const h=setup();const state=await h.generate();h.journal.execute({type:'outline.patch',payload:{id:h.child,field:'title',value:'我自己已修改'}});const writes=h.store.writes;
 const rejected=h.assistant.apply({runId:state.id,suggestionId:'1'});assert.equal(rejected.suggestions[0].state,'pending');assert.match(rejected.suggestions[0].error??'',/变化/);assert.equal(h.store.writes,writes);assert.equal(h.journal.snapshot().state.tasks.find(t=>t.id===h.child)!.title,'我自己已修改');
});

test('AI running effort and checkpoint revisions do not falsely invalidate the preview',async()=>{
 const h=setup();h.journal.execute({type:'focus.start',payload:{taskId:h.child}});const state=await h.generate();h.clock.advance(20000);h.journal.tick();
 const before=h.journal.snapshot(),applied=h.assistant.apply({runId:state.id,suggestionId:'1'}),after=h.journal.snapshot();assert.equal(applied.suggestions[0].state,'applied');assert.equal(after.timer?.sessionId,before.timer?.sessionId);assert.equal(after.timer?.durationMs,20000);assert.equal(after.timer?.paused,false);
});

test('AI multiple proposals for one item rebase after each explicit confirmation',async()=>{
 let h:ReturnType<typeof setup>;h=setup(async()=>response([{type:'outline.patch',payload:{id:h.child,field:'title',value:'改后的名称'}},{type:'outline.patch',payload:{id:h.child,field:'description',value:'更清晰的说明'}}]));
 const state=await h.generate();const first=h.assistant.apply({runId:state.id,suggestionId:'1'});assert.equal(first.suggestions[1].target,'改后的名称');assert.equal(first.suggestions[1].state,'pending');
 const next=h.assistant.apply({runId:state.id,suggestionId:'2'});assert.equal(next.suggestions[1].state,'applied');const task=h.journal.snapshot().state.tasks.find(t=>t.id===h.child)!;assert.equal(task.title,'改后的名称');assert.equal(task.description,'更清晰的说明');
});

test('AI applying another item never erases an existing conflict in a pending proposal',async()=>{
 let h:ReturnType<typeof setup>;h=setup(async()=>response([{type:'outline.patch',payload:{id:h.child,field:'title',value:'AI 名称'}},{type:'outline.patch',payload:{id:h.other,field:'title',value:'另一 AI 名称'}}]));
 const state=await h.generate();h.journal.execute({type:'outline.patch',payload:{id:h.child,field:'title',value:'手动新名称'}});
 const second=h.assistant.apply({runId:state.id,suggestionId:'2'});assert.equal(second.suggestions[1].state,'applied');const first=h.assistant.apply({runId:state.id,suggestionId:'1'});assert.match(first.suggestions[0].error??'',/变化/);assert.equal(h.journal.snapshot().state.tasks.find(t=>t.id===h.child)!.title,'手动新名称');
});

test('AI cancellation and model errors leave journal untouched and preserve visible partial text',async()=>{
 const wait=deferred<AiCompletion>();let request:AiCompletionRequest|undefined;
 const h=setup(async(_c,r)=>{request=r;r.onDelta?.({text:'部分分析'});return wait.promise;}),before=h.journal.exportJson(),pending=h.generate();await Promise.resolve();
 const stopped=h.assistant.cancel();assert.equal(stopped.phase,'cancelled');assert.equal(stopped.text,'部分分析');assert.equal(request?.signal?.aborted,true);wait.resolve(response());await pending;assert.equal(h.journal.exportJson(),before);assert.equal(h.assistant.get().phase,'cancelled');
 const failed=setup(async()=>{throw new AiError('timeout','AI 响应超时');}),saved=failed.journal.exportJson();const state=await failed.generate();assert.equal(state.phase,'error');assert.match(state.error??'',/超时/);assert.equal(failed.journal.exportJson(),saved);
});

test('AI invalid tool names, multiple tools, half JSON and unsafe commands never become executable',async()=>{
 const invalid=[response([],{toolCalls:[{id:'x',name:'execute_shell',arguments:'{}'}]}),response([],{toolCalls:[{id:'x',name:'propose_changes',arguments:'{"summary":'}]}),response([],{toolCalls:[{id:'x',name:'propose_changes',arguments:'{}'},{id:'y',name:'propose_changes',arguments:'{}'}]}),response([{type:'focus.start-unassigned',payload:{}}])];
 for(const result of invalid){const h=setup(async()=>result),before=h.journal.exportJson();const state=await h.generate();assert.equal(state.phase,'error');assert.equal(state.suggestions.length,0);assert.equal(h.journal.exportJson(),before);assert.throws(()=>h.assistant.apply({runId:state.id,suggestionId:'1'}));}
});

test('AI only allows the current completed run and known suggestion IDs',async()=>{
 const h=setup();const first=await h.generate(),second=await h.generate(),before=h.journal.exportJson();assert.notEqual(first.id,second.id);assert.throws(()=>h.assistant.apply({runId:first.id,suggestionId:'1'}));assert.throws(()=>h.assistant.apply({runId:second.id,suggestionId:'missing'}));assert.equal(h.journal.exportJson(),before);
});

test('AI journal persistence failure keeps proposal retryable and never claims applied',async()=>{
 const h=setup(),state=await h.generate(),before=h.journal.exportJson();h.store.fail=true;
 const failed=h.assistant.apply({runId:state.id,suggestionId:'1'});assert.equal(failed.suggestions[0].state,'pending');assert.ok(failed.suggestions[0].error);assert.equal(h.journal.exportJson(),before);assert.equal(h.notifications(),0);
 h.store.fail=false;assert.equal(h.assistant.apply({runId:state.id,suggestionId:'1'}).suggestions[0].state,'applied');
});

test('AI cancel allows a new request immediately and ignores late results from the old request',async()=>{
 const old=deferred<AiCompletion>();let count=0,oldRequest:AiCompletionRequest|undefined;
 const h=setup(async(_c,r)=>{if(++count===1){oldRequest=r;return old.promise;}return response([],{text:'新请求结果'});});
 const pending=h.generate();await Promise.resolve();h.assistant.cancel();const next=await h.generate();assert.equal(next.phase,'done');assert.equal(next.text,'新请求结果');
 oldRequest?.onDelta?.({text:'不应出现的旧流'});old.resolve(response([],{text:'不应出现的旧结果'}));await pending;assert.equal(h.assistant.get().id,next.id);assert.equal(h.assistant.get().text,'新请求结果');
});

test('AI disposal cancels work, removes listeners and forbids further execution',async()=>{
 const wait=deferred<AiCompletion>();let request:AiCompletionRequest|undefined;
 const h=setup(async(_c,r)=>{request=r;return wait.promise;}),pending=h.generate();await Promise.resolve();let notifications=0;h.assistant.subscribe(()=>notifications++);h.assistant.dispose();const after=notifications;assert.equal(request?.signal?.aborted,true);
 wait.resolve(response());await pending;assert.equal(notifications,after);await assert.rejects(h.generate());
 const done=setup(),state=await done.generate(),before=done.journal.exportJson();done.assistant.dispose();assert.throws(()=>done.assistant.apply({runId:state.id,suggestionId:'1'}));assert.equal(done.journal.exportJson(),before);
});

test('AI notification failures do not turn generated suggestions or committed changes into failures',async()=>{
 const h=setup(undefined,()=>{throw Error('window closed');});h.assistant.subscribe(()=>{throw Error('renderer unavailable');});
 const state=await h.generate();assert.equal(state.phase,'done');const applied=h.assistant.apply({runId:state.id,suggestionId:'1'});assert.equal(applied.suggestions[0].state,'applied');assert.equal(applied.suggestions[0].error,undefined);
});
