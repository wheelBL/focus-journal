import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildAiContext,buildAiPlan,planStillCurrent,refreshPlanBaseline,aiTool,aiSystemPrompt} from '../core/ai-assistant';
import {emptyState,type Snapshot,type Task,type Session,type Command} from '../core/types';

process.env.TZ='Asia/Shanghai';
const now='2026-10-22T04:00:00.000Z';
function task(id:string,parentId:string|null=null,extra:Partial<Task>={}):Task{return {id,title:id,parentId,projectId:null,order:0,itemType:'task',description:'',outcome:'',nextAction:'',estimateMinutes:null,plannedDate:null,dueAt:null,status:'open',createdAt:'2026-10-01T00:00:00.000Z',startedAt:null,completedAt:null,...extra};}
function snapshot():Snapshot{const state=emptyState();state.projects=[];state.tasks=[task('inbox',null,{title:'收件箱'}),task('root',null,{title:'项目',isProject:true}),task('child','root',{title:'子事项'}),task('outside',null,{title:'其他项目'})];return {revision:1,state,timers:[],timer:null,now,dataPath:'PRIVATE_DATABASE_PATH',demo:true};}
function session(id:string,taskId:string,start:string,end:string,extra:Partial<Session>={}):Session{const minutes=(Date.parse(end)-Date.parse(start))/60000;return {id,taskId,date:start.slice(0,10),start,end,status:'ended',targetMinutes:25,segments:[{start,end,durationMs:minutes*60000}],durationMs:minutes*60000,manual:false,summary:'推进内容',reminded:false,recovered:false,updatedAt:end,...extra};}
const patch=(id='child',field='title',value:unknown='改进后的名称'):Command=>({type:'outline.patch',payload:{id,field,value}});
const proposal=(commands:Command[])=>({summary:'建议说明',changes:commands.map(command=>({reason:'减少开工阻力',command}))});
const plan=(s:Snapshot,commands:Command[])=>buildAiPlan(proposal(commands),buildAiContext(s,{kind:'item',itemId:'root'}));

test('AI scope includes only selected subtree and does not disclose hidden ancestors or private collections',()=>{
 const s=snapshot();s.state.tasks.push(task('hidden','root',{deletedAt:now,description:'PRIVATE_DELETED'}),task('hidden-child','hidden',{description:'PRIVATE_DESCENDANT'}),task('archived','root',{archived:true}),task('archived-child','archived'));
 s.state.notes.push({id:'note',kind:'note',text:'PRIVATE_LEGACY_NOTE',taskId:null,createdAt:now});s.state.audit.push({id:'audit',entityId:'root',before:'PRIVATE_AUDIT',reason:'PRIVATE_AUDIT',createdAt:now});
 s.state.sessions.push(session('outside-work','outside','2026-10-22T00:00:00Z','2026-10-22T00:20:00Z',{summary:'PRIVATE_OUTSIDE_SUMMARY'}));
 const context=buildAiContext(s,{kind:'item',itemId:'root'});
 assert.deepEqual([...context.ids],['root','child']);assert.equal(context.preview.itemCount,2);assert.equal(context.preview.recordCount,0);assert.equal(context.content.includes('PRIVATE_'),false);
 assert.throws(()=>buildAiContext(s,{kind:'item',itemId:'hidden-child'}));assert.throws(()=>buildAiContext(s,{kind:'item',itemId:'archived-child'}));
});

test('AI rejects unknown context and unavailable selection without mutating state',()=>{
 const s=snapshot(),before=structuredClone(s);assert.throws(()=>buildAiContext(s,{kind:'item',itemId:'missing'}));assert.throws(()=>buildAiContext(s,{kind:'invalid' as any}));assert.deepEqual(s,before);
});

test('all-items scope includes unscheduled items but excludes deleted branches and reports truncation',()=>{
 const s=snapshot();s.state.tasks.push(task('deleted',null,{deletedAt:now}),task('hidden','deleted'));
 const result=buildAiContext(s,{kind:'all'});assert.ok(result.ids.has('outside'));assert.ok(result.ids.has('child'));assert.equal(result.ids.has('deleted'),false);assert.equal(result.ids.has('hidden'),false);assert.equal(result.preview.label,'全部事项与投入');
 for(let i=0;i<110;i++)s.state.tasks.push(task('extra-'+i));const bounded=buildAiContext(s,{kind:'all'});assert.equal(bounded.preview.truncated,true);assert.ok(bounded.ids.size<=100);
});

test('AI limits context item and record counts and announces truncation',()=>{
 const s=snapshot();for(let i=0;i<120;i++){s.state.tasks.push(task('wide-'+i,'root'));s.state.sessions.push(session('work-'+i,'child','2026-10-22T00:00:00Z','2026-10-22T00:01:00Z'));}
 const context=buildAiContext(s,{kind:'item',itemId:'root'}),content=JSON.parse(context.content);assert.equal(context.preview.itemCount,100);assert.equal(context.preview.recordCount,100);assert.equal(context.preview.truncated,true);assert.equal(content.items.length,100);assert.equal(content.effort.length,100);
});

test('AI long field truncation is disclosed and request stays within transport budget',()=>{
 const s=snapshot();s.state.tasks.find(t=>t.id==='child')!.description='说明'.repeat(600);
 const small=buildAiContext(s,{kind:'item',itemId:'root'});assert.equal(small.preview.truncated,true);
 for(let i=0;i<98;i++){const id='wide-'+i;s.state.tasks.push(task(id,'root',{title:'事项'.repeat(50),description:'细节'.repeat(1000)}));s.state.sessions.push(session('work-'+i,id,'2026-10-22T00:00:00Z','2026-10-22T00:01:00Z',{summary:'进展'.repeat(500)}));}
 const context=buildAiContext(s,{kind:'item',itemId:'root'});assert.equal(context.preview.truncated,true);
 const request=JSON.stringify({messages:[{role:'system',content:aiSystemPrompt},{role:'user',content:context.content+'用户需求'.repeat(1000)}],tools:[aiTool]});assert.ok(request.length<100000,`request characters: ${request.length}`);
});

test('AI today context contains scheduled events and transmits event and reminder facts',()=>{
 const s=snapshot();s.state.tasks.push(task('event',null,{title:'讨论',itemType:'event',eventAt:'2026-10-22T06:00:00Z',eventEnd:'2026-10-22T07:00:00Z',reminder:{at:'2026-10-22T05:50:00Z',state:'scheduled',snoozedUntil:null}}));
 const context=buildAiContext(s,{kind:'today'}),data=JSON.parse(context.content),event=data.items.find((t:any)=>t.id==='event');
 assert.ok(event);assert.equal(event.eventAt,'2026-10-22T06:00:00Z');assert.equal(event.eventEnd,'2026-10-22T07:00:00Z');assert.ok(JSON.stringify(event).includes('2026-10-22T05:50:00Z'));
});

test('AI recent effort clips a cross-boundary record to the seven-day context',()=>{
 const s=snapshot();s.state.sessions.push(session('cross','child','2026-10-15T23:00:00+08:00','2026-10-16T01:00:00+08:00'));
 const context=buildAiContext(s,{kind:'recent'}),data=JSON.parse(context.content);assert.deepEqual(data.range,{start:'2026-10-16',end:'2026-10-22'});assert.equal(data.effort[0].minutes,60);
});

test('AI date-only deadlines use the last eligible day, and overdue work remains visible today',()=>{
 const s=snapshot();s.state.tasks.push(task('tomorrow-boundary',null,{dueAt:'2026-10-23'}),task('overdue',null,{dueAt:'2026-10-20'}));
 const context=buildAiContext(s,{kind:'today'});assert.ok(context.ids.has('tomorrow-boundary'));assert.ok(context.ids.has('overdue'));
});

test('AI proposal rejects unsupported commands, hidden fields, out-of-scope targets and pending IDs',()=>{
 const s=snapshot();
 for(const command of [{type:'focus.start',payload:{taskId:'child'}},{type:'task.status',payload:{id:'child',status:'done'}},{type:'sync.run',payload:{}},patch('outside'),patch('not-created-yet'),patch('child','isProject',true),patch('child','estimateMinutes',10),{type:'tag.attach',payload:{id:'child',name:'标签',extra:'unexpected'}}])assert.throws(()=>plan(s,[command]));
 assert.throws(()=>plan(s,[{type:'item.create',payload:{title:'越界',parentId:'outside'}}]));
});

test('AI selected item scope cannot escape to root with a null parent',()=>{
 assert.throws(()=>plan(snapshot(),[{type:'item.create',payload:{title:'越界新事项',parentId:null}}]));
});

test('AI new items default to the selected item and preview every meaningful field',()=>{
 const s=snapshot(),before=structuredClone(s);const result=plan(s,[{type:'item.create',payload:{title:'核对结果',description:'检查两份记录',plannedDate:'2026-10-23',dueAt:'2026-10-24',estimateMinutes:25,remindAt:'2026-10-23T09:00:00+08:00',tagNames:['工作']}}]);
 const entry=result.entries[0];assert.equal(entry.command.payload!.parentId,'root');assert.equal(entry.view.target,'放入「项目」');
 for(const value of ['核对结果','检查两份记录','2026-10-23','2026-10-24','25','09:00:00','工作'])assert.ok(entry.view.after.includes(value),value);
 assert.deepEqual(s,before);
});

test('AI duplicate fields and oversized suggestions are rejected before any apply',()=>{
 const s=snapshot();assert.throws(()=>plan(s,[patch(),patch('child','title','不同新名称')]));assert.throws(()=>plan(s,Array.from({length:21},(_,i)=>({type:'item.create',payload:{title:`建议${i}`}}))));
 assert.throws(()=>buildAiPlan({...proposal([patch()]),extra:'unexpected'},buildAiContext(s,{kind:'item',itemId:'root'})));
});

test('AI duplicate normalized labels and existing same-name child are rejected',()=>{
 const s=snapshot();assert.throws(()=>plan(s,[{type:'tag.attach',payload:{id:'child',name:' Work '}},{type:'tag.attach',payload:{id:'child',name:'work'}}]));
 assert.throws(()=>plan(s,[{type:'item.create',payload:{title:' 子事项 ',parentId:'root'}}]));
});

test('AI proposal validates dates and incompatible information-item fields before preview',()=>{
 const s=snapshot();
 for(const command of [patch('child','plannedDate','2026-02-30'),patch('child','dueAt','not-a-date'),{type:'item.create',payload:{title:'信息',itemType:'note',estimateMinutes:25}},{type:'item.create',payload:{title:'冲突计划',plannedDate:'2026-10-25',dueAt:'2026-10-24'}}])assert.throws(()=>plan(s,[command]));
});

test('AI plan ignores timer growth, checkpoint revision, wall date and updatedAt-only changes',()=>{
 const s=snapshot(),entry=plan(s,[patch()]).entries[0];const fresh=structuredClone(s);fresh.revision=99;fresh.now='2026-10-23T04:00:00.000Z';fresh.state.tasks.find(t=>t.id==='child')!.updatedAt=fresh.now;
 fresh.state.sessions.push(session('running','child','2026-10-22T00:00:00Z','2026-10-22T00:40:00Z',{status:'running',end:null}));
 assert.equal(planStillCurrent(entry,fresh),true);
});

test('AI plan detects item edits, target removal, branch move and changed ancestor availability',()=>{
 const s=snapshot(),entry=plan(s,[patch()]).entries[0];
 for(const mutate of [(fresh:Snapshot)=>{fresh.state.tasks.find(t=>t.id==='child')!.title='自己修改';},(fresh:Snapshot)=>{fresh.state.tasks=fresh.state.tasks.filter(t=>t.id!=='child');},(fresh:Snapshot)=>{fresh.state.tasks.find(t=>t.id==='child')!.parentId='outside';},(fresh:Snapshot)=>{fresh.state.tasks.find(t=>t.id==='root')!.deletedAt=now;}]){const fresh=structuredClone(s);mutate(fresh);assert.equal(planStillCurrent(entry,fresh),false);}
 const unrelated=structuredClone(s);unrelated.state.tasks.find(t=>t.id==='outside')!.title='不相关修改';assert.equal(planStillCurrent(entry,unrelated),true);
});

test('AI preview refresh preserves intended after value while reflecting confirmed changes',()=>{
 const s=snapshot(),entry=plan(s,[patch()]).entries[0];const fresh=structuredClone(s);fresh.state.tasks.find(t=>t.id==='child')!.title='已确认的中间名称';assert.equal(planStillCurrent(entry,fresh),false);
 refreshPlanBaseline(entry,fresh);assert.equal(planStillCurrent(entry,fresh),true);assert.equal(entry.view.before,'已确认的中间名称');assert.equal(entry.view.after,'改进后的名称');
});

test('AI tag rename is a meaningful preview conflict even when attached IDs are unchanged',()=>{
 const s=snapshot();s.state.tags=[{id:'tag-1',name:'工作'}];s.state.tasks.find(t=>t.id==='child')!.tagIds=['tag-1'];const entry=plan(s,[{type:'tag.attach',payload:{id:'child',name:'重要'}}]).entries[0];
 const fresh=structuredClone(s);fresh.state.tags[0].name='个人';assert.equal(planStillCurrent(entry,fresh),false);
});

test('AI remaining-estimate preview subtracts recorded effort and preserves unknown values',()=>{
 const s=snapshot(),child=s.state.tasks.find(t=>t.id==='child')!;child.estimateMinutes=50;s.state.sessions.push(session('effort','child','2026-10-22T01:00:00Z','2026-10-22T01:20:00Z'));
 const entry=plan(s,[{type:'estimate.add',payload:{taskId:'child',remainingMinutes:15,reason:'已完成大部分'}}]).entries[0];assert.match(entry.view.before,/30/);assert.equal(entry.view.before.includes('50'),false);assert.match(entry.view.after,/15 分钟/);
 child.estimateMinutes=null;const unknown=plan(s,[{type:'estimate.add',payload:{taskId:'child',remainingMinutes:15}}]).entries[0];assert.match(unknown.view.before,/未设置|未估计/);
});
