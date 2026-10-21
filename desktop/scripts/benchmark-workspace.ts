import {performance} from 'node:perf_hooks';
import {mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import {JournalService} from '../core/service';
import {emptyState,type JournalState,type Task} from '../core/types';
import {outlineIndex,migrateOutline} from '../core/outline';
import {itemOrdering} from '../core/item-order';
import {emptyFilter,filterOutline} from '../core/filters';
const state=emptyState(),at='2026-10-20T00:00:00.000Z';
for(let i=0;i<5000;i++)state.tasks.push({id:`t${i}`,projectId:'inbox',parentId:i%100===0?'inbox':`t${Math.floor(i/100)*100}`,order:i,title:`工作 ${i}`,outcome:'',nextAction:'',status:'open',createdAt:at,startedAt:null,completedAt:null,plannedDate:i%4===0?'2026-10-20':null,dueAt:null,estimateMinutes:null});
for(let i=0;i<20000;i++)state.sessions.push({id:`s${i}`,taskId:`t${i%5000}`,date:'2026-10-19',start:null,end:null,status:'ended',targetMinutes:25,segments:[],durationMs:60000,manual:true,summary:'',reminded:false,recovered:false,updatedAt:at});
class Store{path='performance fixture';state=migrateOutline(state);load(){return structuredClone(this.state);}save(s:JournalState){this.state=structuredClone(s);}close(){}}
const service=new JournalService(new Store(),{now:()=>Date.parse(at),monotonic:()=>0});service.execute({type:'focus.start',payload:{taskId:'t1'}});
const measure=(fn:()=>unknown,n:number)=>{const times=[];for(let i=0;i<n;i++){const start=performance.now();fn();times.push(performance.now()-start);}times.sort((a,b)=>a-b);return {medianMs:+times[Math.floor(n/2)].toFixed(2),maxMs:+times.at(-1)!.toFixed(2)};};
const snapshot=service.snapshot(),result={items:5000,records:20000,fullSnapshot:measure(()=>service.snapshot(),12),clockOnly:measure(()=>service.clockSnapshot(),50),idleReminder:measure(()=>service.reminderSnapshot(),20),indexFilterSort:measure(()=>{const index=outlineIndex(snapshot.state),order=itemOrdering(index,'smart',snapshot.now);filterOutline(snapshot.state,emptyFilter(),snapshot.now);for(const children of index.children.values())order.sorted(children);},12),fullPayloadBytes:Buffer.byteLength(JSON.stringify(snapshot)),clockPayloadBytes:Buffer.byteLength(JSON.stringify(service.clockSnapshot())),checkedAt:new Date().toISOString()};
const version=JSON.parse(readFileSync('package.json','utf8')).version,out=`qa-evidence/release-${version}`;mkdirSync(out,{recursive:true});writeFileSync(`${out}/performance.json`,JSON.stringify(result,null,2));console.log(JSON.stringify(result));service.shutdown();
