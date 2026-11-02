import {test} from 'node:test';
import assert from 'node:assert/strict';
import {shutdownJournal} from '../electron/shutdown';

test('failed journal save leaves controllers alive, and a retry persists before cleanup',()=>{
 const calls:string[]=[],failures:string[]=[];let closed=false,fail=true;
 const shutdown=()=>shutdownJournal(()=>{calls.push('save');if(fail)throw Error('disk full');},()=>{closed=true;calls.push('closed');},[['api',()=>calls.push('api')],['tray',()=>calls.push('tray')]],name=>failures.push(name));
 assert.throws(shutdown,/disk full/);assert.equal(closed,false);assert.deepEqual(calls,['save']);
 fail=false;shutdown();assert.equal(closed,true);assert.deepEqual(calls,['save','save','closed','api','tray']);assert.deepEqual(failures,[]);
});
test('cleanup errors are reported independently and cannot leave the tray behind',()=>{
 const calls:string[]=[],errors:string[]=[];
 shutdownJournal(()=>calls.push('save'),()=>calls.push('closed'),[['ai',()=>{calls.push('ai');throw Error('failed');}],['usage',()=>{calls.push('usage');throw Error('failed');}],['tray',()=>calls.push('tray')]],name=>{errors.push(name);if(name==='ai')throw Error('logging failed');});
 assert.deepEqual(calls,['save','closed','ai','usage','tray']);assert.deepEqual(errors,['ai','usage']);
});
import {JournalService} from '../core/service';
import {emptyState,type JournalState} from '../core/types';

test('a real running timer survives a failed save and pauses durably on retry',()=>{
 class Store{path='isolated shutdown test';state=emptyState();fail=false;closed=false;load(){return structuredClone(this.state);}save(value:JournalState){if(this.fail)throw Error('disk full');this.state=structuredClone(value);}close(){this.closed=true;}}
 const store=new Store(),clock={now:()=>Date.parse('2026-11-02T10:00:00Z'),monotonic:()=>0},service=new JournalService(store,clock);
 service.execute({type:'focus.start-unassigned'});let disposed=false,closed=false;
 const quit=()=>shutdownJournal(()=>service.shutdown(),()=>{closed=true;},[['controller',()=>{disposed=true;}]],()=>{});
 store.fail=true;assert.throws(quit,/disk full/);assert.equal(disposed,false);assert.equal(closed,false);assert.equal(store.closed,false);assert.equal(service.snapshot().timers[0].paused,false);
 store.fail=false;quit();assert.equal(disposed,true);assert.equal(closed,true);assert.equal(store.closed,true);assert.equal(store.state.sessions[0].status,'paused');
});
