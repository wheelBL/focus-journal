import {test} from 'node:test';
import assert from 'node:assert/strict';
import {emptyState,sessionMsOnDate,type Task,type Session} from '../core/types';
import {searchIndex,searchMatches} from '../src/search-model';
import {calendarRange,calendarSessionDays,calendarBlocks,partition} from '../src/calendar-layout';
process.env.TZ='Asia/Shanghai';

function task(id:string,extra:Partial<Task>={}):Task{return {...emptyState().tasks[0],id,title:id,parentId:null,isProject:false,projectId:null,...extra};}
function record(id:string,start:string,end:string,extra:Partial<Session>={}):Session{const from=new Date(start).toISOString(),to=new Date(end).toISOString(),durationMs=Date.parse(to)-Date.parse(from);return {id,taskId:'work',date:start.slice(0,10),start:from,end:to,status:'ended',durationMs,segments:[{start:from,end:to,durationMs}],targetMinutes:25,manual:false,summary:'',reminded:false,recovered:false,updatedAt:to,...extra};}

test('shared search keeps path, tags, body and legacy notes while hiding unavailable ancestor branches by default',()=>{
 const state=emptyState();state.tasks=[task('project',{title:'产品设计',isProject:true}),task('work',{title:'整理界面',description:'检查深色模式',parentId:'project',tagIds:['tag']}),task('gone',{deletedAt:'2026-10-22T00:00:00.000Z'}),task('child',{title:'保留旧记录',parentId:'gone'}),task('archive',{archived:true})];state.tags=[{id:'tag',name:'体验'}];state.notes=[{id:'n',kind:'note',text:'旧版随手记',taskId:null,createdAt:'2026-10-22T00:00:00.000Z'},{id:'old',kind:'note',text:'旧版随手记',taskId:'child',createdAt:'2026-10-22T00:00:00.000Z'}];
 const index=searchIndex(state);
 for(const query of ['产品设计','深色模式','体验'])assert.ok(searchMatches(index,query).items.some(x=>x.task.id==='work'));
 assert.equal(index.items.find(x=>x.task.id==='work')!.path,'产品设计');
 assert.equal(searchMatches(index,'旧记录').items.length,0);assert.equal(searchMatches(index,'旧记录',true).items.length,1);
 assert.equal(searchMatches(index,'旧版随手记').notes.length,1);assert.equal(searchMatches(index,'旧版随手记',true).notes.length,2);
 assert.equal(searchMatches(index,'archive').items.length,0);
});

test('search rebuild reflects renamed projects, moved branches, reassigned effort and deleted effort',()=>{
 const state=emptyState();state.tasks=[task('a',{isProject:true,title:'旧项目'}),task('b',{isProject:true,title:'新项目'}),task('work',{parentId:'a'})];state.sessions=[record('s','2026-10-21T09:00','2026-10-21T10:00')];
 assert.equal(searchMatches(searchIndex(state),'旧项目').items.find(x=>x.task.id==='work')!.spentMs,3600000);
 state.tasks[2].parentId='b';state.sessions[0].taskId='b';
 assert.equal(searchMatches(searchIndex(state),'旧项目').items.some(x=>x.task.id==='work'),false);
 assert.equal(searchMatches(searchIndex(state),'新项目').items.find(x=>x.task.id==='work')!.spentMs,0);
 state.deletedSessions.push({...state.sessions[0],deletedAt:'2026-10-22T00:00:00.000Z'});state.sessions=[];
 assert.equal(searchIndex(state).items.find(x=>x.task.id==='b')!.spentMs,0);
});

test('range effort preserves cross-midnight proportional effort, missing geometry and zero-length legacy segments',()=>{
 const records=[record('cross','2026-10-18T23:30','2026-10-19T00:30'),record('a','2026-10-19T09:00','2026-10-19T10:00'),record('parallel','2026-10-19T09:30','2026-10-19T10:30'),record('unknown','2026-10-19T10:30','2026-10-19T11:00',{segments:[],durationMs:1800000}),record('legacy','2026-10-19T12:00','2026-10-19T12:00',{segments:[{start:'2026-10-19T04:00:00.000Z',end:'2026-10-19T04:00:00.000Z',durationMs:900000}],durationMs:900000})];
 const dates=['2026-10-18','2026-10-19','2026-10-20'],range=calendarSessionDays(records,dates);
 for(const date of dates){assert.equal(range.get(date)!.totalMs,records.reduce((sum,s)=>sum+sessionMsOnDate(s,date),0));const actual=partition(range.get(date)!.entries).map(e=>({id:e.kind==='effort'?e.session.id:'',top:e.top,height:e.height,lane:e.lane,lanes:e.lanes})),expected=calendarBlocks(records,date).map(e=>({id:e.session.id,top:e.top,height:e.height,lane:e.lane,lanes:e.lanes}));assert.deepEqual(actual,expected);}
 assert.equal(range.get('2026-10-19')!.unknown[0].id,'unknown');
 const summary=calendarSessionDays(records,dates,false);assert.equal(summary.get('2026-10-19')!.entries.length,0);assert.equal(summary.get('2026-10-19')!.totalMs,range.get('2026-10-19')!.totalMs);
});

test('one calendar range retains recurring and overnight events, reminder points, completed counts and layer semantics',()=>{
 const state=emptyState();state.tasks=[task('work',{reminder:{at:new Date('2026-10-19T08:00').toISOString(),state:'scheduled',snoozedUntil:null}}),task('completed',{status:'done',completedAt:new Date('2026-10-20T13:00').toISOString()}),task('event',{itemType:'event',eventAt:new Date('2026-10-19T23:30').toISOString(),eventEnd:new Date('2026-10-20T00:30').toISOString(),recurrence:{mode:'calendar',unit:'day',interval:1,anchor:'2026-10-19',weekdays:[],until:'2026-10-21'}})];state.sessions=[record('s','2026-10-19T09:00','2026-10-19T10:00')];
 const dates=['2026-10-19','2026-10-20','2026-10-21'],range=calendarRange(state,dates);
 assert.equal(range.get(dates[0])!.entries.filter(e=>e.kind==='reminder').length,1);assert.equal(range.get(dates[1])!.entries.filter(e=>e.kind==='event').length,2);assert.equal(range.get(dates[1])!.done,1);
 const month=calendarRange(state,dates,['effort','reminder','event'],false);assert.equal(month.get(dates[0])!.entries.length,0);assert.equal(month.get(dates[0])!.events.length,1);assert.equal(month.get(dates[0])!.totalMs,3600000);
 const hidden=calendarRange(state,dates,[]);assert.equal(hidden.get(dates[0])!.entries.length,0);assert.equal(hidden.get(dates[0])!.events.length,0);assert.equal(hidden.get(dates[0])!.reminders.length,0);assert.equal(hidden.get(dates[0])!.totalMs,3600000);
});

test('range allocation honors local days across a daylight-saving transition',()=>{
 const previous=process.env.TZ;process.env.TZ='America/New_York';
 try{const session=record('dst','2026-03-07T23:30','2026-03-09T00:30'),dates=['2026-03-07','2026-03-08','2026-03-09'],range=calendarSessionDays([session],dates);for(const date of dates)assert.equal(range.get(date)!.totalMs,sessionMsOnDate(session,date));assert.equal(range.get('2026-03-08')!.totalMs,23*3600000);assert.equal(range.get('2026-03-08')!.entries[0].height,1152);}finally{process.env.TZ=previous;}
});
