import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync,readFileSync} from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {build} from 'esbuild';
import {JournalService} from '../core/service.ts';
import {emptyState} from '../core/types.ts';
import {parseCapture} from '../core/capture.ts';
const folder=path.resolve('qa-evidence/release-0.12.0/dom');mkdirSync(folder,{recursive:true});const output=path.join(folder,'capture-window.cjs');
await build({stdin:{contents:"export {CaptureWindow} from './electron/capture-window';export {harness,shortcuts} from './tests/fixtures/reminder-electron.mjs';",resolveDir:process.cwd(),loader:'ts'},outfile:output,bundle:true,platform:'node',format:'cjs',alias:{electron:path.resolve('tests/fixtures/reminder-electron.mjs')},logLevel:'silent'});
const {CaptureWindow,harness,shortcuts}=createRequire(import.meta.url)(output);
class Store{path='capture window test';state=emptyState();load(){return structuredClone(this.state);}save(s){this.state=structuredClone(s);}close(){}}
test('capture desktop lifecycle isolates IPC, saves only records, retains the hidden window and unregisters on exit',()=>{
 const service=new JournalService(new Store());let changes=0;const config=path.join(folder,`capture-${Date.now()}.json`),window=new CaptureWindow(service,()=>changes++,'icon.png',config,true);
 try{
  assert.equal(window.preferences().registered,false);window.configure('Ctrl+Alt+F12');assert.equal(JSON.parse(readFileSync(config,'utf8')).shortcut,'Ctrl+Alt+F12');shortcuts.get('Ctrl+Alt+F12')();const win=harness.windows.at(-1),event={sender:win.webContents,senderFrame:win.webContents.mainFrame};
  assert.equal(win.query.panel,'capture');assert.equal(win.options.webPreferences.nodeIntegration,false);assert.equal(win.options.webPreferences.sandbox,true);assert.equal(win.visible,true);
  assert.throws(()=>harness.handlers.get('capture:snapshot')({sender:win.webContents,senderFrame:{}}),/无效/);
  assert.throws(()=>harness.handlers.get('capture:save')(event,{type:'task.status',payload:{id:'x',status:'done'}}),/只保存/);
  const draft=parseCapture('- Windows 笔记 %检查',new Date().toISOString()).draft;const saved=harness.handlers.get('capture:save')(event,{type:'capture.create',payload:{draft,parentId:'inbox'}});assert.equal(saved.state.tasks.filter(t=>t.id!=='inbox')[0].title,'Windows 笔记');assert.equal(saved.timers.length,0);assert.equal(changes,1);
  harness.handlers.get('capture:close')(event);assert.equal(win.visible,false);assert.equal(win.destroyed,false);window.open();assert.equal(win.visible,true);assert.ok(win.messages.some(m=>m.name==='capture:opened'));
 }finally{window.dispose();service.shutdown();}assert.equal(shortcuts.size,0);assert.equal(harness.windows.at(-1).destroyed,true);assert.equal(harness.handlers.has('capture:save'),false);
});
