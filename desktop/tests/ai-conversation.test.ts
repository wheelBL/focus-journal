import {reviewIntent} from '../core/ai-review-intent';
import {test} from 'node:test';import assert from 'node:assert/strict';import {mkdtempSync,readFileSync,rmSync,mkdirSync,writeFileSync} from 'node:fs';import path from 'node:path';
import {AiAssistantService} from '../core/ai-assistant-service';import {AiConversationStore} from '../electron/ai-conversation-store';import {buildAiContext,buildAiPlan} from '../core/ai-assistant';import {JournalService} from '../core/service';import {emptyState,type JournalState} from '../core/types';import type {AiCompletionRequest} from '../core/ai-types';import {controlCommand} from '../core/control-api';
class Store{path='isolated';state=emptyState();load(){return structuredClone(this.state)}save(s:JournalState){this.state=structuredClone(s)}close(){}}
const clock={now:()=>Date.parse('2026-11-03T10:00:00+08:00'),monotonic:()=>0},connection={baseUrl:'https://example.invalid/v1',model:'synthetic',apiKey:'synthetic-key-do-not-store'};
const response=(changes:unknown[]=[])=>({text:'当前分析',finishReason:'stop',toolCalls:changes.length?[{id:'tool',name:'propose_changes',arguments:JSON.stringify({summary:'请确认',changes:changes.map(command=>({command}))})}]:[]});
const add=(s:JournalService,title:string)=>s.execute({type:'outline.create',payload:{title,parentId:null}}).state.tasks.at(-1)!.id;

test('conversation continues with fresh state, outcome history and safe persisted restart; scope changes isolate history',async()=>{
 const base=path.resolve('qa-data');mkdirSync(base,{recursive:true});const dir=mkdtempSync(path.join(base,'ai-conversation-'));assert.ok(path.resolve(dir).startsWith(base+path.sep));try{const file=path.join(dir,'history.json'),s=new JournalService(new Store(),clock),id=add(s,'原名'),requests:AiCompletionRequest[]=[];let count=0;
 const complete=async(_c:unknown,r:AiCompletionRequest)=>{requests.push(r);return ++count===1?response([{type:'outline.patch',payload:{id,field:'title',value:'用户确认后的名称'}},{type:'outline.patch',payload:{id,field:'description',value:'尚未确认'}}]):response();};
 const a=new AiAssistantService(s,async()=>connection,complete,()=>{},undefined,new AiConversationStore(file));const first=await a.generate({scope:{kind:'all'},prompt:'讨论第一轮 synthetic-key-do-not-store'});a.apply({runId:first.id,suggestionId:'1'});await a.generate({scope:{kind:'all'},prompt:'继续讨论'});
 assert.equal(requests[1].messages.length,4);assert.match(requests[1].messages[2].content,/已由用户确认并应用/);assert.match(requests[1].messages[2].content,/未应用/);assert.match(requests[1].messages.at(-1)!.content,/用户确认后的名称/);assert.equal(a.get().turns[0].suggestions[1].state,'historical');assert.throws(()=>a.apply({runId:first.id,suggestionId:'2'}));
 assert.equal(readFileSync(file,'utf8').includes(connection.apiKey),false);const resumed=new AiAssistantService(s,async()=>connection,complete,()=>{},undefined,new AiConversationStore(file));assert.equal(resumed.get().turns.length,2);assert.equal(resumed.get().turns[0].suggestions[0].state,'applied');assert.equal(resumed.get().turns[0].suggestions[1].state,'historical');assert.throws(()=>resumed.apply({runId:first.id,suggestionId:'2'}));
 await resumed.generate({scope:{kind:'item',itemId:id},prompt:'仅讨论这一项'});assert.equal(requests.at(-1)!.messages.length,2);assert.equal(resumed.get().turns.length,1);resumed.reset();assert.equal(resumed.get().turns.length,0);assert.equal(resumed.get().scope,null);s.shutdown();
 }finally{rmSync(dir,{recursive:true,force:true});}
});
test('review proposals target existing item, preserve cadence and do not pause, complete or create work',async()=>{
 const s=new JournalService(new Store(),clock),id=add(s,'待审事项');let proposal:Record<string,unknown>={type:'item-review.configure',payload:{id,enabled:true,nextDate:'2026-11-04',interval:{unit:'weeks',count:2}}};
 const a=new AiAssistantService(s,async()=>connection,async()=>response([proposal]));let r=await a.generate({scope:{kind:'all'},prompt:'明天审视这个已有事项'});assert.equal(r.suggestions[0].label,'设置事项审视');a.apply({runId:r.id,suggestionId:'1'});let state=s.snapshot().state,item=state.tasks.find(t=>t.id===id)!;assert.deepEqual(item.reviewSchedule?.interval,{unit:'once',count:1});assert.equal(item.availability??'active','active');assert.equal(item.status,'open');assert.equal(state.tasks.length,2);assert.equal(state.itemReviews.length,0);
 proposal={type:'item-review.configure',payload:{id,enabled:true,nextDate:'2026-11-05',interval:{unit:'weeks',count:2}}};r=await a.generate({scope:{kind:'all'},prompt:'改成每两周审视'});a.apply({runId:r.id,suggestionId:'1'});item=s.snapshot().state.tasks.find(t=>t.id===id)!;assert.deepEqual(item.reviewSchedule?.interval,{unit:'weeks',count:2});
 proposal={type:'item-review.configure',payload:{id,enabled:true,nextDate:'2026-11-06',interval:{unit:'once',count:1}}};r=await a.generate({scope:{kind:'all'},prompt:'下次改为周五'});a.apply({runId:r.id,suggestionId:'1'});item=s.snapshot().state.tasks.find(t=>t.id===id)!;assert.deepEqual(item.reviewSchedule?.interval,{unit:'weeks',count:2});assert.equal(item.reviewSchedule?.nextDate,'2026-11-06');
 const plan=(changes:unknown[])=>buildAiPlan({summary:'',changes:changes.map(command=>({command}))},buildAiContext(s.snapshot(),{kind:'all'}));assert.throws(()=>plan([{type:'item-review.configure',payload:{id,enabled:true,nextDate:'2026-11-04',pause:true}}]),/不能自动暂停/);assert.throws(()=>plan([{type:'item-review.defer',payload:{id:'not-in-scope',nextDate:'2026-11-04'}}]),/范围之外/);assert.throws(()=>plan([{type:'item-review.defer',payload:{id,nextDate:'2026-11-04'}},{type:'item-review.configure',payload:{id,enabled:true,nextDate:'2026-11-05'}}]),/重复/);
 assert.equal(controlCommand({type:'item-review.configure',payload:{id,enabled:true,nextDate:'2026-11-06'}},s.snapshot()).payload!.interval instanceof Object,true);s.shutdown();
});
test('overdue review focus prioritizes real scoped IDs beyond the first hundred',()=>{
 const s=new JournalService(new Store(),clock);for(let i=0;i<105;i++)add(s,`事项 ${i}`);const id=add(s,'过期审视');s.execute({type:'item-review.configure',payload:{id,enabled:true,nextDate:'2026-11-01',interval:{unit:'once',count:1}}});const snapshot=s.snapshot();assert.equal(buildAiContext(snapshot,{kind:'all'}).ids.has(id),false);const focus=buildAiContext(snapshot,{kind:'all'},{focusReview:true});assert.ok(focus.ids.has(id));assert.match(focus.content,/reviewSchedule/);assert.equal(focus.preview.truncated,true);assert.ok(buildAiContext(snapshot,{kind:'today'}).ids.has(id));const named=add(s,'单独指定目标');const namedContext=buildAiContext(s.snapshot(),{kind:'all'},{focusReview:true,focusText:'请设置单独指定目标的审视'});assert.ok(namedContext.ids.has(named));s.shutdown();
});

test('deferred review retains cadence and stale review plans are never applied',async()=>{
 const s=new JournalService(new Store(),clock),id=add(s,'已有审视');s.execute({type:'item-review.configure',payload:{id,enabled:true,nextDate:'2026-11-03',interval:{unit:'weeks',count:3}}});const assistant=new AiAssistantService(s,async()=>connection,async()=>response([{type:'item-review.defer',payload:{id,nextDate:'2026-11-05'}}]));const first=await assistant.generate({scope:{kind:'all'},prompt:'延后此项审视'});assert.equal(first.suggestions[0].label,'延后事项审视');assistant.apply({runId:first.id,suggestionId:'1'});let task=s.snapshot().state.tasks.find(t=>t.id===id)!;assert.equal(task.reviewSchedule?.nextDate,'2026-11-05');assert.deepEqual(task.reviewSchedule?.interval,{unit:'weeks',count:3});assert.equal(s.snapshot().state.itemReviews.length,0);
 const stale=await assistant.generate({scope:{kind:'all'},prompt:'再调整审视'});s.execute({type:'item-review.defer',payload:{id,nextDate:'2026-11-06'}});const result=assistant.apply({runId:stale.id,suggestionId:'1'});assert.match(result.suggestions[0].error??'',/已经变化/);task=s.snapshot().state.tasks.find(t=>t.id===id)!;assert.equal(task.reviewSchedule?.nextDate,'2026-11-06');s.shutdown();
});
test('history write failures are surfaced without interrupting journal work or exposing a secret',async()=>{
 const s=new JournalService(new Store(),clock),id=add(s,'事项'),saves:string[]=[];const history={load:()=>null,save:(value:unknown)=>{saves.push(JSON.stringify(value));throw Error('private path');}};const a=new AiAssistantService(s,async()=>connection,async()=>response([{type:'outline.patch',payload:{id,field:'title',value:'正常保存'}}]),()=>{},undefined,history);
 const generated=await a.generate({scope:{kind:'all'},prompt:`测试 ${connection.apiKey}`});assert.equal(generated.phase,'done');assert.match(generated.historyError??'',/未能保存/);assert.ok(saves.length);assert.ok(saves.every(x=>!x.includes(connection.apiKey)));const applied=a.apply({runId:generated.id,suggestionId:'1'});assert.equal(applied.suggestions[0].state,'applied');assert.equal(s.snapshot().state.tasks.find(t=>t.id===id)!.title,'正常保存');s.shutdown();
});

test('a pending proposal restored after restart is historical and cannot be applied',async()=>{
 const base=path.resolve('qa-data');mkdirSync(base,{recursive:true});const dir=mkdtempSync(path.join(base,'ai-restart-'));assert.ok(path.resolve(dir).startsWith(base+path.sep));try{const s=new JournalService(new Store(),clock),id=add(s,'原事项'),file=path.join(dir,'conversation.json'),make=()=>new AiAssistantService(s,async()=>connection,async()=>response([{type:'outline.patch',payload:{id,field:'title',value:'旧建议'}}]),()=>{},undefined,new AiConversationStore(file));const first=make(),state=await first.generate({scope:{kind:'all'},prompt:'请建议'});assert.equal(state.suggestions[0].state,'pending');const restored=make(),current=restored.get();assert.equal(current.suggestions[0].state,'historical');assert.throws(()=>restored.apply({runId:state.id,suggestionId:'1'}),/找不到|过期/);assert.equal(s.snapshot().state.tasks.find(t=>t.id===id)!.title,'原事项');s.shutdown();}finally{rmSync(dir,{recursive:true,force:true});}
});

test('an existing-item review request refuses a fabricated inbox task',async()=>{
 const s=new JournalService(new Store(),clock);add(s,'原有事项');const assistant=new AiAssistantService(s,async()=>connection,async()=>response([{type:'item.create',payload:{title:'稍后审视原有事项'}}]));const before=s.exportJson(),result=await assistant.generate({scope:{kind:'all'},prompt:'请安排审视已有事项'});assert.equal(result.phase,'error');assert.match(result.error??'',/已有事项/);assert.equal(s.exportJson(),before);s.shutdown();
});

test('conversation and model history are bounded independently',async()=>{
 const s=new JournalService(new Store(),clock);let lastRequest:AiCompletionRequest|undefined;const assistant=new AiAssistantService(s,async()=>connection,async(_c,request)=>{lastRequest=request;return response();});for(let i=0;i<23;i++)await assistant.generate({scope:{kind:'all'},prompt:`轮次 ${i}`});const state=assistant.get();assert.equal(state.turns.length,20);assert.equal(state.turns[0].prompt,'轮次 3');assert.equal(lastRequest?.messages.length,18);assert.equal(lastRequest?.messages[1].content,'轮次 14');s.shutdown();
});

test('review intent does not mistake negation or a review arrangement for creating a separate task',async()=>{
 const s=new JournalService(new Store(),clock);add(s,'原有事项');const assistant=new AiAssistantService(s,async()=>connection,async()=>response([{type:'item.create',payload:{title:'不应创建'}}]));
 for(const prompt of ['不要新建任务，给逾期任务安排审视','创建审视安排','创建审视任务']){const r=await assistant.generate({scope:{kind:'all'},prompt});assert.equal(r.phase,'error');assert.match(r.error??'',/已有事项/);}
 const allowed=await assistant.generate({scope:{kind:'all'},prompt:'安排审视，另外创建一个普通任务'});assert.equal(allowed.phase,'done');assert.equal(allowed.suggestions[0].state,'pending');assert.equal(s.snapshot().state.tasks.length,2);s.shutdown();
});
test('fixed weekday is not misrepresented as an interval after actual review',async()=>{
 const s=new JournalService(new Store(),clock),id=add(s,'需审视事项'),a=new AiAssistantService(s,async()=>connection,async()=>response([{type:'item-review.configure',payload:{id,enabled:true,nextDate:'2026-11-09',interval:{unit:'weeks',count:1}}}]));const result=await a.generate({scope:{kind:'all'},prompt:'每周一审视此事项'});assert.equal(result.phase,'error');assert.match(result.error??'',/实际审视日期.*固定星期/);assert.equal(s.snapshot().state.tasks.find(t=>t.id===id)!.reviewSchedule??null,null);s.shutdown();
});
test('known API secrets never enter error, conversation or saved AI usage',async()=>{
 const s=new JournalService(new Store(),clock),id=add(s,'事项'),history:unknown[]=[],usage:unknown[]=[],persistence={load:()=>null,save:(v:unknown)=>history.push(v)};const a=new AiAssistantService(s,async()=>connection,async()=>{throw Error(`failure ${connection.apiKey}`);},()=>{},r=>usage.push(r),persistence);const state=await a.generate({scope:{kind:'all'},prompt:`请处理 ${connection.apiKey}`});assert.equal(state.phase,'error');assert.equal((state.error??'').includes(connection.apiKey),false);assert.equal(JSON.stringify(history).includes(connection.apiKey),false);assert.equal(JSON.stringify(usage).includes(connection.apiKey),false);assert.equal(s.snapshot().state.tasks.find(t=>t.id===id)!.title,'事项');s.shutdown();
});

test('conversation reload discards unrecognized data and preserves corrupt files',()=>{
 const base=path.resolve('qa-data');mkdirSync(base,{recursive:true});const dir=mkdtempSync(path.join(base,'ai-invalid-'));assert.ok(path.resolve(dir).startsWith(base+path.sep));try{
  const file=path.join(dir,'history.json'),store=new AiConversationStore(file),turn={id:'turn',scope:{kind:'all' as const,unrelated:'fake-secret'},prompt:'hi',phase:'done' as const,text:'hello',error:null,context:null,suggestions:[],unrelated:'fake-secret'};
  store.save({id:'id',scope:{kind:'all'},turns:[turn]});assert.equal(readFileSync(file,'utf8').includes('fake-secret'),false);
  writeFileSync(file,'{broken');const broken=new AiConversationStore(file);assert.throws(()=>broken.load());assert.throws(()=>broken.save({id:'new',scope:null,turns:[]}));assert.equal(readFileSync(file,'utf8'),'{broken');
 }finally{rmSync(dir,{recursive:true,force:true});}
});


test('same-scope followups carry user review intent and cadence, with explicit one-time and new-task overrides',async()=>{
 const s=new JournalService(new Store(),clock),id=add(s,'熟悉的事项');let plan:unknown[]=[];const requests:AiCompletionRequest[]=[];const assistant=new AiAssistantService(s,async()=>connection,async(_c,r)=>{requests.push(r);return response(plan);});
 await assistant.generate({scope:{kind:'all'},prompt:'给熟悉的事项安排审视，每两周一次'});
 plan=[{type:'item-review.configure',payload:{id,enabled:true,nextDate:'2026-11-04'}}];let r=await assistant.generate({scope:{kind:'all'},prompt:'明天'});assert.equal(r.phase,'done');assert.match(r.suggestions[0].after,/每 2 周/);assistant.apply({runId:r.id,suggestionId:'1'});assert.deepEqual(s.snapshot().state.tasks.find(t=>t.id===id)!.reviewSchedule?.interval,{unit:'weeks',count:2});
 plan=[{type:'item-review.configure',payload:{id,enabled:true,nextDate:'2026-11-05',interval:{unit:'weeks',count:2}}}];r=await assistant.generate({scope:{kind:'all'},prompt:'改成仅这一次'});assert.match(r.suggestions[0].after,/单次/);assistant.apply({runId:r.id,suggestionId:'1'});assert.deepEqual(s.snapshot().state.tasks.find(t=>t.id===id)!.reviewSchedule?.interval,{unit:'once',count:1});
 plan=[{type:'item.create',payload:{title:'不应被误建'}}];r=await assistant.generate({scope:{kind:'all'},prompt:'就这样'});assert.equal(r.phase,'error');assert.match(r.error??'',/已有事项/);
 plan=[{type:'item.create',payload:{title:'独立任务'}}];r=await assistant.generate({scope:{kind:'all'},prompt:'新建一个普通任务'});assert.equal(r.phase,'done');assert.equal(r.suggestions[0].state,'pending');
 r=await assistant.generate({scope:{kind:'today'},prompt:'明天'});assert.equal(r.phase,'done');assert.equal(requests.at(-1)!.messages.length,2);s.shutdown();
});

test('review intent is cleared by explicit cancellation and latest recurrence overrides prior requests',()=>{
 const previous=[{id:'one',scope:{kind:'all' as const},prompt:'安排审视，每两周一次',phase:'done' as const,text:'',error:null,context:null,suggestions:[]}];
 assert.equal(reviewIntent('取消之前的要求',previous).focusReview,false);assert.equal(reviewIntent('算了',previous).focusReview,false);assert.equal(reviewIntent('请帮我新建一个普通任务',previous).focusReview,false);assert.deepEqual(reviewIntent('不用每周，改成每月',previous).interval,{unit:'months',count:1});assert.deepEqual(reviewIntent('改成只这一次',previous).interval,{unit:'once',count:1});assert.deepEqual(reviewIntent('今天，先安排一次。',previous).interval,{unit:'once',count:1});
});

test('review wording distinguishes task reconsideration from effort reflection and negation',()=>{for(const text of ['回顾投入','回顾本周投入记录','番茄复盘','不要回顾这项任务'])assert.equal(reviewIntent(text,[]).focusReview,false,text);for(const text of ['重新判断这项任务','下周回顾这项任务是否还值得做'])assert.equal(reviewIntent(text,[]).focusReview,true,text);});
