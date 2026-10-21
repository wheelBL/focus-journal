import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';
import {JournalService} from '../core/service.ts';
import {emptyState} from '../core/types.ts';
import {ReminderAudio} from '../src/reminder-audio.ts';

const dom=new JSDOM('<!doctype html><div id="root"></div>',{url:'http://localhost',pretendToBeVisual:true});
for(const key of ['window','document','HTMLElement','HTMLInputElement','HTMLSelectElement','HTMLTextAreaElement','Event','MouseEvent','KeyboardEvent','CustomEvent'])globalThis[key]=dom.window[key];
globalThis.IS_REACT_ACT_ENVIRONMENT=true;globalThis.requestAnimationFrame=cb=>setTimeout(cb,0);globalThis.cancelAnimationFrame=clearTimeout;
dom.window.HTMLElement.prototype.scrollIntoView=function(){};dom.window.HTMLElement.prototype.scrollBy=function(){};
class Store{path='reminder UI tests';state=emptyState();load(){return structuredClone(this.state);}save(s){this.state=structuredClone(s);}close(){}}
const service=new JournalService(new Store()),previews=[];
window.journal={snapshot:async()=>service.snapshot(),command:async c=>service.execute(c),onChanged:()=>()=>{},exportData:async()=>null,importData:async()=>null,openDataFolder:async()=>{},windowAction:async()=>{},previewReminder:async(settings,mode)=>previews.push({settings:structuredClone(settings),mode})};
const contexts=[];
class FakeAudioContext{
 state='suspended';currentTime=10;destination={};tones=[];gains=[];
 constructor(){contexts.push(this);}
 async resume(){this.state='running';}async close(){this.state='closed';}
 createOscillator(){const tone={frequency:{value:0},connect(){},start(at){this.startAt=at;},stop(at){this.stopAt=at;}};this.tones.push(tone);return tone;}
 createGain(){const levels=[];const gain={levels,gain:{setValueAtTime(v,t){levels.push([v,t]);},linearRampToValueAtTime(v,t){levels.push([v,t]);},exponentialRampToValueAtTime(v,t){levels.push([v,t]);}},connect(){}};this.gains.push(gain);return gain;}
}
globalThis.AudioContext=FakeAudioContext;
const {default:React,act}=await import('react'),{createRoot}=await import('react-dom/client');
const folder=path.resolve('qa-evidence/release-0.8.0/dom');mkdirSync(folder,{recursive:true});
for(const name of ['App','ReminderPanel'])await build({entryPoints:[`src/${name}.tsx`],outfile:path.join(folder,`${name}-reminders.mjs`),bundle:true,platform:'node',format:'esm',packages:'external',jsx:'automatic',loader:{'.css':'empty'},logLevel:'silent'});
const {default:App}=await import(pathToFileURL(path.join(folder,'App-reminders.mjs')).href),{default:ReminderPanel}=await import(pathToFileURL(path.join(folder,'ReminderPanel-reminders.mjs')).href);
const query=(s,root=document)=>{const e=root.querySelector(s);assert.ok(e,`Missing ${s}`);return e;};
const button=(text,root=document)=>{const e=[...root.querySelectorAll('button')].find(b=>b.textContent.trim()===text);assert.ok(e,`Missing button ${text}`);return e;};
const action=async fn=>act(async()=>{await fn();await new Promise(r=>setTimeout(r,5));});
const click=e=>action(()=>e.click());

test('reminder settings audition unsaved options without writing settings or effort',async()=>{
 const root=createRoot(query('#root'));await action(()=>root.render(React.createElement(App)));
 try{
  await click(query('[aria-label="设置"]'));const before=service.snapshot().state;
  const select=query('[aria-label="重复提醒间隔"]');await action(()=>{select.value='60';select.dispatchEvent(new Event('change',{bubbles:true}));});
  await click(button('试听声音'));await click(button('预览提醒'));
  assert.deepEqual(previews.map(p=>p.mode),['sound','card']);assert.equal(previews[0].settings.repeatSeconds,60);assert.deepEqual(service.snapshot().state,before);
  const section=button('试听声音').closest('section');await click(query('input[type=checkbox]',section));
  assert.equal(button('试听声音').disabled,true);assert.equal(button('预览提醒').disabled,false);await click(button('预览提醒'));assert.equal(previews.at(-1).settings.sound,false);
  await click(button('保存提醒设置'));assert.deepEqual(service.snapshot().state.settings.reminders,{sound:false,volume:60,repeatSeconds:60});assert.equal(service.snapshot().state.sessions.length,0);
 }finally{await action(()=>root.unmount());}
});

test('persistent card routes each action, updates elapsed time and stops sound on unmount',async()=>{
 const root=createRoot(query('#root')),actions=[],audioResults=[];let update=()=>{};
 const state={alerts:[{sessionId:'a',taskId:'ta',title:'写作',durationMs:27*60000,targetMinutes:25},{sessionId:'b',taskId:'tb',title:'阅读',durationMs:26*60000,targetMinutes:25}],settings:{sound:true,volume:50,repeatSeconds:30},preview:false,cue:null};
 window.reminder={snapshot:async()=>structuredClone(state),onChanged:fn=>{update=fn;return()=>{update=()=>{};};},action:async(...args)=>actions.push(args),audioResult:(...args)=>audioResults.push(args)};
 await action(()=>root.render(React.createElement(ReminderPanel)));
 try{
  assert.equal(document.querySelectorAll('.reminder-item').length,2);assert.match(query('.reminder-intro').textContent,/计时仍在继续/);
  for(const [title,label,kind] of [['写作','5 分钟后再提醒','snooze'],['阅读','继续，本次不再提醒','dismiss'],['写作','仅结束本次','stop']])await click(button(label,query(`[aria-label="${title}的到时提醒"]`)));
  assert.deepEqual(actions,[['snooze','a'],['dismiss','b'],['stop','a']]);
  state.cue={id:1,volume:50};await action(()=>update(structuredClone(state)));assert.deepEqual(audioResults,[[1]]);assert.equal(contexts.at(-1).tones.length,3);const playing=contexts.at(-1),count=contexts.length;
  state.alerts[0].durationMs+=1000;await action(()=>update(structuredClone(state)));assert.equal(contexts.length,count);assert.match(query('.reminder-time').textContent,/27:01/);
  state.cue=null;await action(()=>update(structuredClone(state)));assert.equal(playing.state,'closed');
  state.preview=true;state.alerts=state.alerts.slice(0,1);state.cue={id:2,volume:60};await action(()=>update(structuredClone(state)));
  assert.match(query('.reminder-heading').textContent,/提醒效果预览/);assert.match(query('.reminder-intro').textContent,/不会修改/);await click(query('[aria-label="关闭预览"]'));assert.equal(actions.at(-1)[0],'close-preview');
  await action(()=>root.unmount());assert.equal(contexts.at(-1).state,'closed');assert.equal(document.body.classList.contains('reminder-body'),false);
 }catch(e){await action(()=>root.unmount());throw e;}
});

test('audio failures remain visible on the card and report a failed audition',async()=>{
 const root=createRoot(query('#root')),results=[];globalThis.AudioContext=class extends FakeAudioContext{async resume(){throw new Error('测试输出设备不可用');}};
 window.reminder={snapshot:async()=>({alerts:[],settings:{sound:true,volume:50,repeatSeconds:30},preview:true,cue:{id:77,volume:50}}),onChanged:()=>()=>{},action:async()=>{},audioResult:(...args)=>results.push(args)};
 try{await action(()=>root.render(React.createElement(ReminderPanel)));assert.match(query('[role=alert]').textContent,/输出设备不可用/);assert.deepEqual(results,[[77,'测试输出设备不可用']]);}
 finally{await action(()=>root.unmount());globalThis.AudioContext=FakeAudioContext;}
});

test('local chime respects volume and cancels previous or pending playback',async()=>{
 const player=new ReminderAudio();await player.play(50);const first=contexts.at(-1);
 assert.deepEqual(first.tones.map(t=>t.frequency.value),[660,880,1100]);assert.equal(first.gains[0].levels[1][0],.15);
 await player.play(100);assert.equal(first.state,'closed');assert.equal(contexts.at(-1).gains[0].levels[1][0],.3);player.stop();assert.equal(contexts.at(-1).state,'closed');
 const count=contexts.length;await player.play(0);assert.equal(contexts.length,count);
 let resume;globalThis.AudioContext=class extends FakeAudioContext{resume(){return new Promise(resolve=>{resume=resolve;});}};
 const pending=player.play(60),late=contexts.at(-1);player.stop();resume();await pending;assert.equal(late.tones.length,0);assert.equal(late.state,'closed');globalThis.AudioContext=FakeAudioContext;
});

test('scheduled reminder card labels its time and offers open, snooze and acknowledge',async()=>{
 const root=createRoot(query('#root')),actions=[];
 window.reminder={snapshot:async()=>({alerts:[{kind:'task',sessionId:'item:meeting',taskId:'meeting',title:'参加会议',remindAt:'2026-10-19T07:30:00.000Z',durationMs:0,targetMinutes:0}],settings:{sound:false,volume:50,repeatSeconds:30},preview:false,cue:null}),onChanged:()=>()=>{},action:async(...args)=>actions.push(args),audioResult:()=>{}};
 try{await action(()=>root.render(React.createElement(ReminderPanel)));assert.match(query('.reminder-intro').textContent,/不会启动计时/);assert.equal(document.querySelector('.big-timer'),null);assert.ok(!document.body.textContent.includes('结束本次'));
  for(const label of ['查看事项','5 分钟后再提醒','知道了'])await click(button(label));assert.deepEqual(actions,[['open','item:meeting'],['snooze','item:meeting'],['dismiss','item:meeting']]);
 }finally{await action(()=>root.unmount());}
});


test('welcome card presents explicit continue, extend and later choices without auto-start',async()=>{
 const root=createRoot(query('#root')),actions=[];const state={alerts:[{kind:'break',sessionId:'break:one',taskId:null,title:'欢迎回来，准备继续了吗？',durationMs:0,targetMinutes:25,breakMinutes:5,continuationTitle:'整理设计'}],settings:{sound:false,volume:60,repeatSeconds:30},preview:false,cue:null};
 window.reminder={snapshot:async()=>state,onChanged:()=>()=>{},action:async(...args)=>actions.push(args),audioResult:()=>{}};
 await action(()=>root.render(React.createElement(ReminderPanel)));
 try{assert.match(query('.reminder-heading').textContent,/休息结束/);assert.match(query('.reminder-intro').textContent,/欢迎回来/);assert.deepEqual(actions,[]);
  for(const label of ['继续专注','再休息 5 分钟','回到工作台选择事项','暂不开始'])await click(button(label));
  assert.deepEqual(actions,[['continue','break:one'],['restart-break','break:one'],['choose','break:one'],['dismiss','break:one']]);
 }finally{await action(()=>root.unmount());}
});
