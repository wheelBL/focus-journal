import {test} from 'node:test';
import assert from 'node:assert/strict';
import {JournalService} from '../core/service';
import {emptyState,type JournalState} from '../core/types';
import {FloatingVisibility,floatingReadout,floatingTime,selectFloatingTimer,restKey} from '../core/floating-timer';
import {parseTimerPosition,timerBounds} from '../electron/floating-timer-bounds';
class Store {path='floating test';state=emptyState();load(){return structuredClone(this.state);}save(s:JournalState){this.state=structuredClone(s);}close(){}}
function setup(){let time=Date.parse('2026-10-21T10:00:00+08:00');const service=new JournalService(new Store(),{now:()=>time,monotonic:()=>time});return {service,advance:(ms:number)=>{time+=ms;service.tick();}};}
test('floating clock shares effort, preserves pause and clearly labels overtime',()=>{
 const {service,advance}=setup();const id=service.execute({type:'focus.start-unassigned'}).timer!.sessionId;
 advance(17*60000+42000);const source=service.floatingTimerSnapshot();let display=floatingReadout({...source,selectedId:id,expanded:false});
 assert.equal(display.title,'未关联事项');assert.equal(display.label,'剩余');assert.equal(floatingTime(display.ms,display.roundUp),'07:18');
 service.execute({type:'focus.pause',payload:{sessionId:id}});advance(30000);display=floatingReadout({...service.floatingTimerSnapshot(),selectedId:id,expanded:false});assert.equal(display.label,'暂停');assert.equal(floatingTime(display.ms,true),'07:18');
 service.execute({type:'focus.resume',payload:{sessionId:id}});advance(8*60000);display=floatingReadout({...service.floatingTimerSnapshot(),selectedId:id,expanded:false});assert.equal(display.label,'超时');assert.equal(floatingTime(display.ms),'00:42');assert.equal(service.snapshot().state.sessions.length,1);assert.equal(service.snapshot().timer!.paused,false);
});
test('explicit selection is stable while another session starts; ended selection falls back to rest',()=>{
 const {service}=setup();const first=service.execute({type:'focus.start-unassigned'}).timer!.sessionId;
 const task=service.execute({type:'task.save',payload:{title:'第二件'}}).state.tasks.at(-1)!.id;service.execute({type:'focus.start',payload:{taskId:task}});
 assert.equal(selectFloatingTimer(service.floatingTimerSnapshot(),first),first);
 for(const t of service.snapshot().timers)service.execute({type:'focus.stop',payload:{sessionId:t.sessionId}});
 const source=service.floatingTimerSnapshot();assert.equal(selectFloatingTimer(source,first),restKey(source.rest!));assert.equal(source.rest!.phase,'offered');
 service.execute({type:'break.start'});assert.equal(service.floatingTimerSnapshot().rest!.remainingMs,300000);assert.equal(service.snapshot().timers.length,0);
});
test('hidden sessions stay hidden across resume, other completion, main restore and reminders',()=>{
 const policy=new FloatingVisibility(),{service}=setup();const a=service.execute({type:'focus.start-unassigned'}).timer!.sessionId;
 const task=service.execute({type:'task.save',payload:{title:'第二件'}}).state.tasks.at(-1)!.id;service.execute({type:'focus.start',payload:{taskId:task}});
 const source=service.floatingTimerSnapshot();assert.equal(policy.visible(source,true,false),false);assert.equal(policy.visible(source,false,false),true);assert.equal(policy.visible(source,false,true),false);
 policy.hide(source);assert.equal(policy.visible(source,false,false),false);assert.equal(policy.visible({...source,timers:source.timers.filter(t=>t.sessionId===a)},false,false),false);
 policy.mainChanged();assert.equal(policy.visible({...source,timers:source.timers.filter(t=>t.sessionId===a)},false,false),false);policy.open();assert.equal(policy.visible(source,true,false),true);assert.equal(policy.visible(source,true,true),false);
 policy.mainChanged();assert.equal(policy.visible(source,true,false),false);
 policy.hide(source);assert.equal(policy.visible({...source,timers:[{...source.timers[0],sessionId:'new'}]},false,false),true);
});
test('rest is never effort, welcome waits for an explicit continue',()=>{
 const {service,advance}=setup();const id=service.execute({type:'focus.start-unassigned'}).timer!.sessionId;advance(25*60000);
 service.execute({type:'focus.stop',payload:{sessionId:id,rest:true}});advance(2*60000);let source=service.floatingTimerSnapshot();assert.equal(source.rest!.remainingMs,180000);assert.equal(source.timers.length,0);
 advance(3*60000);source=service.floatingTimerSnapshot();assert.equal(source.rest!.phase,'ready');assert.equal(source.timers.length,0);assert.equal(service.snapshot().state.sessions[0].durationMs,25*60000);
 service.execute({type:'break.acknowledge'});assert.equal(service.floatingTimerSnapshot().rest!.phase,'ready');service.execute({type:'break.continue'});assert.equal(service.floatingTimerSnapshot().timers.length,1);
});
test('window bounds survive negative monitors, disconnected displays and bottom-edge expansion',()=>{
 const area={x:-1920,y:0,width:1920,height:1040};assert.deepEqual(timerBounds(area,null),{x:-328,y:291,width:320,height:64});
 assert.deepEqual(timerBounds(area,{x:99999,y:99999},480),{x:-320,y:560,width:320,height:480});
 assert.equal(parseTimerPosition({x:'2',y:3}),null);assert.equal(parseTimerPosition({x:Infinity,y:3}),null);assert.deepEqual(parseTimerPosition({x:-600.4,y:80.2}),{x:-600,y:80});
 assert.equal(timerBounds({x:0,y:0,width:1000,height:700},{x:-300,y:400}).x,0);
 assert.equal(floatingTime(1,true),'00:01');assert.equal(floatingTime(1),'00:00');
});
