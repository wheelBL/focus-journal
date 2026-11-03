import {test} from 'node:test';
import assert from 'node:assert/strict';
import {JournalService,parseJournalBackup} from '../core/service';
import {emptyState,type JournalState} from '../core/types';
import {semanticOperation,operationFailure,designedRoute} from '../core/usage-types';
import {AiError} from '../core/ai-types';
class Store{path='synthetic telemetry test';state=emptyState();fail=false;load(){return structuredClone(this.state);}save(s:JournalState){if(this.fail)throw Object.assign(new Error('private file path'),{code:'ENOSPC'});this.state=structuredClone(s);}close(){}}
const clock={now:()=>Date.parse('2026-02-27T10:00:00Z'),monotonic:()=>0};
const create=(s:JournalService,title:string)=>s.execute({type:'task.save',payload:{title,parentId:null}}).state.tasks.at(-1)!.id;
test('activity captures type conversion, links and reminder recurrence only on real changes',()=>{
 const s=new JournalService(new Store(),clock),group=create(s,'group'),note=create(s,'- note'),task=create(s,'task');
 const exec=(type:string,payload:Record<string,unknown>)=>s.execute({type,payload});
 exec('outline.patch',{id:group,field:'itemType',value:'group'});let a=s.snapshot().state.activities!.at(-1)!;assert.ok(a.changes.some(c=>c.entityId===group&&c.field==='itemType'&&c.after==='group'));
 exec('note.link-task',{id:note,taskId:task});a=s.snapshot().state.activities!.at(-1)!;assert.ok(a.changes.some(c=>c.entityId===note&&c.field==='relatedTaskIds'));
 const n=s.snapshot().state.activities!.length;exec('note.link-task',{id:note,taskId:task});assert.equal(s.snapshot().state.activities!.length,n);
 const rule={mode:'calendar',unit:'day',interval:1,anchor:'2026-02-27',weekdays:[],until:null};exec('reminder.schedule',{id:task,at:'2026-02-27T11:00:00Z',rule});a=s.snapshot().state.activities!.at(-1)!;assert.ok(a.changes.some(c=>c.entityId===task&&c.field==='reminderRecurrence'));
 assert.deepEqual(parseJournalBackup(s.exportJson()).activities,s.snapshot().state.activities);s.shutdown();
});
test('semantic events are bounded and failure classifications never inspect messages',()=>{
 assert.equal(semanticOperation({type:'outline.patch',payload:{field:'title',value:'secret'}}),'item.rename');assert.equal(semanticOperation({type:'outline.patch',payload:{field:'dueAt',value:null}}),'item.deadline.clear');assert.equal(semanticOperation({type:'outline.patch',payload:{field:'itemType',value:'group'}}),'item.type.group');assert.equal(semanticOperation({type:'outline.patch',payload:{field:'private-secret',value:'private-secret'}}),'outline.patch');assert.equal(semanticOperation({type:'private-secret'}),'unknown.command');
 assert.equal(operationFailure(Object.assign(new Error('secret'),{code:'ENOSPC'})),'failed.storage');assert.equal(operationFailure(new Error('disk full validation conflict')),'failed');assert.equal(operationFailure(new AiError('connection','secret')),'failed.network');
 const store=new Store(),s=new JournalService(store,clock),id=create(s,'private title'),records:unknown[]=[];s.setOperationRecorder((operation,entry,result)=>records.push({operation,entry,result}));
 s.execute({type:'outline.patch',payload:{id,field:'title',value:'new secret'},meta:{entry:'items.keyboard.rename'}});store.fail=true;assert.throws(()=>s.execute({type:'outline.patch',payload:{id,field:'title',value:'failed secret'},meta:{entry:'items.keyboard.rename'}}));assert.deepEqual(records,[{operation:'item.rename',entry:'items.keyboard.rename',result:'success'},{operation:'item.rename',entry:'items.keyboard.rename',result:'failed.storage'}]);assert.equal(JSON.stringify(records).includes('secret'),false);
 store.fail=false;assert.throws(()=>s.execute({type:'outline.patch',payload:{id,field:'dueAt',value:'not-a-date'},meta:{entry:'items.inspector'}}));assert.deepEqual(records.at(-1),{operation:'item.deadline.set',entry:'items.inspector',result:'failed.validation'});s.setOperationRecorder(()=>{throw Error('telemetry unavailable');});assert.doesNotThrow(()=>s.execute({type:'outline.patch',payload:{id,field:'title',value:'safe'}}));s.shutdown();
});
test('designed route is a release-specific catalog, not an inferred click count',()=>{
 assert.equal(designedRoute('item.rename','items.keyboard.rename','0.35.0')?.steps,2);assert.equal(designedRoute('item.rename','items.context.rename','0.35.0')?.steps,3);assert.equal(designedRoute('focus.start','items.row.timer','0.35.0')?.steps,1);assert.equal(designedRoute('item.rename','items.keyboard.rename','0.34.0'),null);assert.equal(designedRoute('item.rename','items.keyboard.rename','0.36.0')?.steps,2);assert.equal(designedRoute('item.rename','items.keyboard.rename','0.37.0'),null);assert.equal(designedRoute('item.rename','workspace','0.35.0'),null);
});

test('node sqlite storage codes classify only known numeric primary or extended failures',()=>{
 for(const errcode of [8,10,13,8+256,10+256*3,13+256])assert.equal(operationFailure(Object.assign(new Error('private'),{code:'ERR_SQLITE_ERROR',errcode})),'failed.storage');
 for(const errcode of [1,5,19,-1,undefined,'13'])assert.equal(operationFailure(Object.assign(new Error('secret'),{code:'ERR_SQLITE_ERROR',errcode})),'failed');
 assert.equal(operationFailure({code:'OTHER',errcode:13}),'failed');
});
