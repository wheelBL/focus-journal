import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {build} from 'esbuild';
import {JournalService} from '../core/service.ts';
import {emptyState} from '../core/types.ts';
const folder=path.resolve('qa-evidence/release-0.8.0/dom');mkdirSync(folder,{recursive:true});const output=path.join(folder,'reminder-window.cjs');
await build({stdin:{contents:"export {ReminderWindow} from './electron/reminder-window';export {harness} from './tests/fixtures/reminder-electron.mjs';",resolveDir:process.cwd(),loader:'ts'},outfile:output,bundle:true,platform:'node',format:'cjs',alias:{electron:path.resolve('tests/fixtures/reminder-electron.mjs')},logLevel:'silent'});
const {ReminderWindow,harness}=createRequire(import.meta.url)(output);
class Store{path='reminder desktop tests';state=emptyState();load(){return structuredClone(this.state);}save(s){this.state=structuredClone(s);}close(){}}
class Clock{time=Date.now();mono=0;now(){return this.time;}monotonic(){return this.mono;}advance(ms){this.time+=ms;this.mono+=ms;}}
const flush=()=>new Promise(r=>setImmediate(r));
const setup=()=>{const clock=new Clock(),service=new JournalService(new Store(),clock),logs=[];const manager=new ReminderWindow(service,()=>manager.sync(),'test.png',(event,detail)=>logs.push({event,detail}));return {clock,service,manager,logs};};
const event=win=>({sender:win.webContents,senderFrame:win.webContents.mainFrame});
const invoke=(name,win,...args)=>harness.handlers.get(name)(event(win),...args);
const due=({clock,service},titles=['写作','阅读'])=>{for(const title of titles){const taskId=service.execute({type:'task.save',payload:{title,estimateMinutes:25}}).state.tasks.at(-1).id;service.execute({type:'focus.start',payload:{taskId,targetMinutes:1}});}clock.advance(60000);service.tick();};
const prefs={sound:true,volume:65,repeatSeconds:30};

test('scheduled item card uses the same native window and opening it never starts a timer',async()=>{
 const clock=new Clock(),service=new JournalService(new Store(),clock),opened=[];let manager;
 manager=new ReminderWindow(service,()=>manager.sync(),'test.png',()=>{},id=>opened.push(id));
 try{
  const id=service.execute({type:'task.save',payload:{title:'开会提醒',remindAt:new Date(clock.time).toISOString()}}).state.tasks.at(-1).id;
  service.tick();manager.sync();await flush();const win=harness.windows.at(-1);const state=invoke('reminder:snapshot',win);assert.equal(state.alerts[0].kind,'task');assert.equal(win.focused,false);assert.equal(win.top,true);
  assert.throws(()=>invoke('reminder:action',win,'stop',state.alerts[0].sessionId),/不是/);
  await invoke('reminder:action',win,'open',state.alerts[0].sessionId);await flush();assert.deepEqual(opened,[id]);assert.equal(win.visible,false);assert.equal(service.snapshot().timers.length,0);assert.equal(service.snapshot().state.sessions.length,0);
 }finally{manager.dispose();}
});

test('desktop preview and audition are isolated from records and use a non-focus-stealing window',async()=>{
 const {service,manager,logs}=setup();const before=service.exportJson();
 try{
  await manager.preview(prefs,'sound');const win=harness.windows.at(-1);assert.equal(win.isVisible(),false);assert.equal(service.exportJson(),before);assert.ok(logs.some(l=>l.event==='reminder-audio-playing'));
  for(const action of ['stop','snooze','dismiss','close-preview']){await manager.preview(prefs,'card');assert.equal(win.isVisible(),true);assert.equal(win.focused,false);assert.equal(win.top,true);assert.ok(win.bounds.x<0);assert.equal(win.options.skipTaskbar,true);assert.equal(win.query.panel,'reminder');await invoke('reminder:action',win,action,'preview');assert.equal(service.exportJson(),before);assert.equal(win.isVisible(),false);}
  assert.throws(()=>harness.handlers.get('reminder:snapshot')({sender:{},senderFrame:{}}),/无效/);
 }finally{manager.dispose();assert.equal(harness.windows.at(-1).isDestroyed(),true);}
});

test('real due sessions replace preview and per-item actions hide only the handled reminder',async()=>{
 const context=setup(),{service,manager,clock}=context;
 try{
  await manager.preview({...prefs,sound:false},'card');const win=harness.windows.at(-1);due(context);manager.sync();await flush();
  let state=invoke('reminder:snapshot',win);assert.equal(state.preview,false);assert.equal(state.alerts.length,2);assert.equal(harness.windows.filter(w=>!w.destroyed).length,1);
  await assert.rejects(manager.preview(prefs,'card'),/先处理/);
  const [a,b]=state.alerts;await invoke('reminder:action',win,'snooze',a.sessionId);await flush();assert.equal(invoke('reminder:snapshot',win).alerts.length,1);assert.equal(service.snapshot().timers.length,2);
  await invoke('reminder:action',win,'dismiss',b.sessionId);await flush();assert.equal(win.visible,false);clock.advance(300000);service.tick();manager.sync();await flush();state=invoke('reminder:snapshot',win);assert.equal(state.alerts.length,1);assert.equal(state.alerts[0].sessionId,a.sessionId);
  await invoke('reminder:action',win,'stop',a.sessionId);await flush();assert.equal(win.visible,false);assert.equal(service.snapshot().timers.length,1);assert.equal(service.snapshot().timers[0].sessionId,b.sessionId);
  assert.throws(()=>invoke('reminder:action',win,'stop',a.sessionId),/已经处理/);
 }finally{manager.dispose();}
});

test('closing a real card snoozes pending sessions, while app quit destroys even an unhandled card',async()=>{
 const context=setup(),{manager,service,clock}=context;due(context);manager.sync();await flush();const win=harness.windows.at(-1);let prevented=false;
 win.emit('close',{preventDefault(){prevented=true;}});await flush();assert.equal(prevented,true);assert.equal(win.visible,false);assert.equal(service.snapshot().timers.length,2);
 clock.advance(300000);service.tick();manager.sync();await flush();assert.equal(win.visible,true);
 manager.dispose();assert.equal(win.destroyed,true);manager.sync();await flush();assert.equal(harness.windows.filter(w=>!w.destroyed).length,0);
});


test('stopping an unassigned reminder opens its preserved session for assignment',async()=>{
 const clock=new Clock(),service=new JournalService(new Store(),clock),opened=[];let manager;
 manager=new ReminderWindow(service,()=>manager.sync(),'test.png',()=>{},()=>{},id=>opened.push(id));
 try{const id=service.execute({type:'focus.start-unassigned',payload:{targetMinutes:1}}).timer.sessionId;clock.advance(60000);service.tick();manager.sync();await flush();const win=harness.windows.at(-1);
  assert.equal(invoke('reminder:snapshot',win).alerts[0].title,'未关联事项');assert.equal(win.focused,false);
  await invoke('reminder:action',win,'stop',id);assert.deepEqual(opened,[id]);assert.equal(service.snapshot().state.sessions[0].taskId,null);assert.equal(service.snapshot().state.sessions[0].durationMs,60000);assert.equal(service.snapshot().timers.length,0);
 }finally{manager.dispose();}
});


test('native target card ends work into rest and welcomes back with sound without automatically starting',async()=>{
 const clock=new Clock(),service=new JournalService(new Store(),clock),opened=[];let manager;
 manager=new ReminderWindow(service,()=>manager.sync(),'test.png',()=>{},()=>{},id=>opened.push(id),()=>opened.push('workbench'));
 try{
  const id=service.execute({type:'focus.start-unassigned',payload:{targetMinutes:25}}).timer.sessionId;clock.advance(25*60000);service.tick();manager.sync();await flush();const win=harness.windows.at(-1);
  assert.equal(invoke('reminder:snapshot',win).alerts[0].canRest,true);await invoke('reminder:action',win,'stop-rest',id);await flush();assert.equal(win.visible,false);assert.deepEqual(opened,['workbench']);assert.equal(service.snapshot().state.settings.rest.phase,'running');
  clock.advance(300000);service.tick();await new Promise(r=>setTimeout(r,3100));manager.sync();await flush();const state=invoke('reminder:snapshot',win);assert.equal(state.alerts[0].kind,'break');assert.ok(state.cue);assert.equal(win.visible,true);assert.equal(win.focused,false);assert.equal(win.top,true);assert.equal(service.snapshot().timers.length,0);
  await invoke('reminder:action',win,'continue',state.alerts[0].sessionId);await flush();assert.equal(win.visible,false);assert.equal(service.snapshot().timer.taskId,null);assert.equal(service.snapshot().timer.durationMs,0);assert.equal(service.snapshot().state.sessions[0].durationMs,25*60000);assert.deepEqual(opened,['workbench','workbench']);
 }finally{manager.dispose();}
});
test('native rest card can extend or dismiss while retaining the main welcome state',async()=>{
 const {service,manager,clock}=setup();try{
  service.execute({type:'break.start'});clock.advance(300000);service.tick();manager.sync();await flush();const win=harness.windows.at(-1);let state=invoke('reminder:snapshot',win);
  await invoke('reminder:action',win,'restart-break',state.alerts[0].sessionId);await flush();assert.equal(win.visible,false);assert.equal(service.snapshot().state.settings.rest.phase,'running');
  clock.advance(300000);service.tick();manager.sync();await flush();state=invoke('reminder:snapshot',win);await invoke('reminder:action',win,'dismiss',state.alerts[0].sessionId);await flush();assert.equal(win.visible,false);assert.equal(service.snapshot().state.settings.rest.phase,'ready');assert.equal(service.snapshot().timers.length,0);
 }finally{manager.dispose();}
});
