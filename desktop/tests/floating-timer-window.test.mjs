import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync,readFileSync} from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {build} from 'esbuild';
import {JournalService} from '../core/service.ts';
import {emptyState} from '../core/types.ts';
const folder=path.resolve('qa-evidence/release-0.21.0/dom');mkdirSync(folder,{recursive:true});const output=path.join(folder,'floating-window.cjs');
await build({stdin:{contents:"export {FloatingTimerWindow} from './electron/floating-timer-window';export {harness,BrowserWindow,screen} from './tests/fixtures/floating-electron.mjs';",resolveDir:process.cwd(),loader:'ts'},outfile:output,bundle:true,platform:'node',format:'cjs',alias:{electron:path.resolve('tests/fixtures/floating-electron.mjs')},logLevel:'silent'});
const {FloatingTimerWindow,harness,BrowserWindow,screen}=createRequire(import.meta.url)(output);
class Store{path='floating desktop tests';state=emptyState();load(){return structuredClone(this.state);}save(s){this.state=structuredClone(s);}close(){}}
const flush=()=>new Promise(r=>setImmediate(r));
function setup(){const service=new JournalService(new Store()),main=new BrowserWindow(),opened=[],file=path.join(folder,`position-${crypto.randomUUID()}.json`);let alert=false,manager;
 manager=new FloatingTimerWindow(service,main,()=>manager.sync(),()=>alert,'icon.png',file,()=>{opened.push('main');main.restore();},id=>opened.push(id),()=>{});
 return {service,main,manager,opened,file,alert:v=>{alert=v;manager.sync();},win:()=>harness.windows.at(-1),dispose:()=>{manager.dispose();main.destroy();}};
}
const invoke=(win,action,id)=>harness.handlers.get('floating-timer:action')({sender:win.webContents,senderFrame:win.webContents.mainFrame},action,id);
const state=win=>harness.handlers.get('floating-timer:snapshot')({sender:win.webContents,senderFrame:win.webContents.mainFrame});
test('minimize/tray shows a non-focus-stealing strip, restore hides and a deliberate hide survives state changes',async()=>{
 const c=setup();try{c.main.show();c.service.execute({type:'focus.start-unassigned'});c.manager.sync();await flush();assert.equal(harness.windows.at(-1),c.main);
 c.main.minimize();await flush();const w=c.win();assert.equal(w.visible,true);assert.equal(w.focused,false);assert.equal(w.options.skipTaskbar,true);assert.equal(w.query.panel,'floating-timer');assert.equal(w.bounds.height,64);
 invoke(w,'expand');await flush();assert.ok(w.bounds.height>64);invoke(w,'hide');await flush();assert.equal(w.visible,false);c.manager.sync();await flush();assert.equal(w.visible,false);
 c.main.restore();c.main.minimize();await flush();assert.equal(w.visible,false);c.manager.open();await flush();assert.equal(w.visible,true);assert.equal(state(w).expanded,false);
 c.main.restore();await flush();assert.equal(w.visible,false);c.main.hide();await flush();assert.equal(w.visible,true);
 }finally{c.dispose();}assert.equal(harness.windows.filter(w=>!w.destroyed).length,0);assert.equal(harness.handlers.size,0);
});
test('loading races cannot show a restored, hidden or disposed timer window',async()=>{
 const c=setup();let finish;harness.gate=new Promise(r=>finish=r);
 try{c.service.execute({type:'focus.start-unassigned'});c.manager.sync();c.main.show();finish();await flush();assert.equal(c.win().visible,false);
 }finally{harness.gate=null;c.dispose();}
 const d=setup();harness.gate=new Promise(r=>finish=r);d.service.execute({type:'focus.start-unassigned'});d.manager.sync();const w=d.win();d.dispose();finish();harness.gate=null;await flush();assert.equal(w.visible,false);assert.equal(w.destroyed,true);
});
test('reminders suppress the strip until handled without clearing the user hidden state',async()=>{
 const c=setup();try{c.service.execute({type:'focus.start-unassigned'});c.manager.sync();await flush();const w=c.win();c.alert(true);await flush();assert.equal(w.visible,false);c.alert(false);await flush();assert.equal(w.visible,true);
 invoke(w,'hide');c.alert(true);c.alert(false);await flush();assert.equal(w.visible,false);assert.equal(c.service.snapshot().timers.length,1);
 }finally{c.dispose();}
});
test('per-session commands and explicit selection preserve other timers and reject stale/foreign commands',async()=>{
 const c=setup();try{const a=c.service.execute({type:'focus.start-unassigned'}).timer.sessionId;const task=c.service.execute({type:'task.save',payload:{title:'另一项'}}).state.tasks.at(-1).id;c.service.execute({type:'focus.start',payload:{taskId:task}});const b=c.service.snapshot().timers.find(t=>t.taskId===task).sessionId;c.manager.sync();await flush();const w=c.win();
 invoke(w,'select',b);assert.equal(state(w).selectedId,b);invoke(w,'pause',b);assert.equal(c.service.snapshot().timers.find(t=>t.sessionId===a).paused,false);assert.equal(c.service.snapshot().timers.find(t=>t.sessionId===b).paused,true);
 assert.throws(()=>invoke(w,'pause',b),/状态已变化/);invoke(w,'resume',b);assert.throws(()=>invoke(w,'stop-rest',a),/请先/);assert.equal(c.service.snapshot().timers.length,2);
 invoke(w,'pause',b);invoke(w,'stop-rest',a);assert.equal(c.service.snapshot().timer.sessionId,b);assert.equal(c.service.snapshot().timer.paused,true);assert.equal(c.service.snapshot().state.settings.rest.phase,'running');
 }finally{c.dispose();}
});
test('ending into rest stays in the floating workflow, review opens the original record and IPC stays scoped',async()=>{
 const c=setup();try{const id=c.service.execute({type:'focus.start-unassigned'}).timer.sessionId;c.manager.sync();await flush();const w=c.win();
 invoke(w,'stop',id);assert.equal(c.opened.length,0);const rest=state(w).rest,key=`rest:${rest.id}`;assert.equal(rest.phase,'offered');invoke(w,'review',key);assert.deepEqual(c.opened,[id]);invoke(w,'rest-start',key);assert.equal(c.service.snapshot().state.settings.rest.phase,'running');assert.equal(c.service.snapshot().timers.length,0);
 assert.throws(()=>invoke(w,'rest-stop',key),/状态已变化/);assert.throws(()=>invoke(w,'task.delete',id),/无效/);assert.throws(()=>invoke(w,'stop',id),/已经结束/);
 assert.throws(()=>harness.handlers.get('floating-timer:action')({sender:c.main.webContents,senderFrame:c.main.webContents.mainFrame},'pause',id),/无效/);
 assert.throws(()=>harness.handlers.get('floating-timer:snapshot')({sender:w.webContents,senderFrame:{} }),/无效/);
 }finally{c.dispose();}
});
test('drag position is remembered, expanded bounds fit the display, and display listeners are cleaned up',async()=>{
 const c=setup();try{c.service.execute({type:'focus.start-unassigned'});c.manager.sync();await flush();const w=c.win();w.bounds={...w.bounds,x:-900,y:900};w.emit('move');await new Promise(r=>setTimeout(r,180));assert.deepEqual(JSON.parse(readFileSync(c.file,'utf8')),{x:-900,y:900});
 invoke(w,'expand');await flush();assert.ok(w.bounds.y+w.bounds.height<=1040);invoke(w,'collapse');await flush();assert.equal(w.bounds.y,900);screen.emit('display-removed');await flush();assert.ok(w.bounds.x<0);
 }finally{c.dispose();}assert.equal(screen.listenerCount('display-removed'),0);
});
