import {UsageStore} from '../electron/usage-store';
import {checkOwnershipRecords} from './check-ownership-records';
import {app,BrowserWindow,ipcMain} from 'electron';
import path from 'node:path';
import {mkdirSync,writeFileSync} from 'node:fs';
import {JournalService} from '../core/service';
import {emptyState,type JournalState} from '../core/types';
import {seed} from '../design-prototypes/things-3/seed';
import {AppearanceController} from '../electron/appearance';
import {checkProductionTheme} from './check-appearance-themes';
import {AiController} from '../electron/ai-controller';
import {checkAiUi} from './check-ai-ui';
import {checkWorkflowPolish} from './check-workflow-polish';
import {checkWorkspaceContinuity} from './check-workspace-continuity';
import {checkSimplification} from './check-simplification';
import {checkOperationFlows} from './check-operation-flows';

const root=process.cwd(),dir=root,output=path.resolve(process.env.JOURNAL_QA_OUTPUT??'qa-evidence/release-0.23.0/appearance');mkdirSync(output,{recursive:true});
app.setPath('userData',path.resolve(process.env.JOURNAL_QA_DATA??'qa-data/appearance-0.23.0'));app.disableHardwareAcceleration();
class Store{path='things-interaction-qa';state=emptyState();load(){return structuredClone(this.state);}save(s:JournalState){this.state=structuredClone(s);}close(){}}
const service=new JournalService(new Store(),undefined,true);seed(service);
const id=(name:string)=>service.snapshot().state.tasks.find(t=>t.title===name)!.id;
const row=(name:string)=>`[data-outline-id="${id(name)}"]`;
const results:string[]=[],errors:string[]=[];let win:BrowserWindow,appearance:AppearanceController,ai:AiController,usage:UsageStore;
const delay=(ms:number)=>new Promise(r=>setTimeout(r,ms));
const js=(s:string)=>win.webContents.executeJavaScript(s);
async function until(s:string){for(let i=0;i<100;i++){if(await js(s))return;await delay(80);}throw Error('Timed out: '+s);}
async function settle(){await js('document.fonts.ready');await delay(260);}
async function click(selector:string,clickCount=1,button:'left'|'right'='left'){
 await until(`!!document.querySelector(${JSON.stringify(selector)})`);
 await js(`document.querySelector(${JSON.stringify(selector)}).scrollIntoView({block:'nearest'})`);await delay(25);
 const p=await js(`(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)};})()`);
 win.webContents.sendInputEvent({type:'mouseMove',...p});
 for(const type of ['mouseDown','mouseUp'] as const)win.webContents.sendInputEvent({type,button,clickCount,...p});
 await delay(100);
}
async function button(text:string,scope=''){
 const s=await js(`(()=>{const els=[...document.querySelectorAll(${JSON.stringify((scope?scope+' ':'')+'button')})],el=els.find(e=>e.textContent.trim()===${JSON.stringify(text)});if(!el)throw Error('Missing button '+${JSON.stringify(text)});el.dataset.qa='target';return '[data-qa=target]';})()`);
 await click(s);await js(`document.querySelector('[data-qa=target]')?.removeAttribute('data-qa')`);
}
async function key(keyCode:string,modifiers:string[]=[]){win.webContents.sendInputEvent({type:'keyDown',keyCode,modifiers});win.webContents.sendInputEvent({type:'keyUp',keyCode,modifiers});await delay(70);}
async function input(selector:string,value:string){await click(selector);await key('A',['control']);await win.webContents.insertText(value);await delay(40);}
async function capture(name:string){await settle();writeFileSync(path.join(output,name+'.png'),(await win.webContents.capturePage()).toPNG());}
function check(ok:unknown,label:string){if(!ok)throw Error(label);results.push(label);console.log(label);}
async function main(){try{
 await app.whenReady();
 appearance=new AppearanceController(path.join(app.getPath('userData'),'appearance.json'),path.join(root,'dist/client/index.html'));
 usage=new UsageStore(path.join(app.getPath('userData'),'usage-records.json'),'0.29.1');service.setOperationRecorder((operation,entry,result)=>usage.record({operation,entry,result,version:'0.29.1'}));
 ipcMain.handle('usage:record',(_e,value)=>usage.record(value));ipcMain.handle('usage:snapshot',()=>usage.snapshot());ipcMain.handle('usage:configure',(_e,v)=>usage.configure(v));ipcMain.handle('usage:clear',(_e,k)=>usage.clear(k));
 ipcMain.handle('journal:capture-preferences',()=>({shortcut:'',registered:false}));ipcMain.handle('journal:window',()=>{});
 ipcMain.handle('sync:status',()=>({configured:false,phase:'idle'}));ipcMain.handle('local-api:status',()=>({enabled:false,port:17642,access:'read',running:false,baseUrl:null,hasToken:false,error:null}));
 ipcMain.handle('journal:snapshot',()=>service.snapshot());ipcMain.handle('journal:clock',()=>service.clockSnapshot());
 ipcMain.handle('journal:command',(_e,c)=>{const data=service.execute(c);return data;});
 win=new BrowserWindow({width:1440,height:940,titleBarStyle:'hidden',titleBarOverlay:{color:'#fff',symbolColor:'#222',height:44},show:false,webPreferences:{preload:path.join(root,'dist-electron/preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true,offscreen:true,backgroundThrottling:false}});
 appearance.setMain(win);
 ai=new AiController(path.join(app.getPath('userData'),'ai-config.json'),win,path.join(root,'dist/client/index.html'),service,()=>win.webContents.send('journal:changed'),usage);
 win.webContents.on('console-message',(_event,level,message)=>{if(level>=3&&!message.includes('Content Security Policy'))errors.push(message);});
 await win.webContents.session.clearStorageData({storages:['localstorage']});
 await win.loadFile(path.join(root,'dist/client/index.html'));await until(`!!document.querySelector('.today-page')`);await click('.top-navigation [aria-label=事项]');await until(`document.querySelectorAll('[data-outline-id]').length>20`);await settle();
 if(process.env.JOURNAL_QA_SIMPLIFY_ONLY==='1'){
  await js(`window.journalAppearance.set({theme:'light',motion:'reduce'})`);await capture('01-items');
  await click('.top-navigation [aria-label="今日"]');await capture('01b-today');
  await js(`window.journalAppearance.set({theme:'dark',motion:'reduce'})`);await click('.top-navigation [aria-label="事项"]');await capture('08-dark-items');
  await click('[aria-label=设置]');await until(`!!document.querySelector('#settings-appearance')`);await capture('10-dark-settings');
  await click('.top-navigation [aria-label="日历"]');await until(`!!document.querySelector('.calendar-page')`);await capture('12-dark-calendar');
  await js(`window.journalAppearance.set({theme:'light',motion:'reduce'})`);
 }
 if(process.env.JOURNAL_QA_AI_ONLY!=='1'&&process.env.JOURNAL_QA_SIMPLIFY_ONLY!=='1'){
 await js(`window.journalAppearance.set({theme:'light',motion:'full'})`);await settle();
 await js(`(()=>{window.__thingsMotion={layout:0,enter:0,exit:0,detail:0};const original=Element.prototype.animate;Element.prototype.animate=function(frames,options){const m=window.__thingsMotion;if(this.classList.contains('motion-completed-ghost'))m.exit++;else if(this.matches('.task-inspector,.inspector-scroll'))m.detail++;else if(frames[0].opacity!==undefined)m.enter++;else m.layout++;return original.call(this,frames,options);};})()`);
 check(await js(`document.querySelector('.task-inspector')&&Array.from(document.querySelectorAll('.outline-row')).every(e=>Math.abs(e.getBoundingClientRect().height-32)<1)`),'默认展示任务树与详情，所有任务行保持 32px');
 if(process.env.JOURNAL_QA_SIMPLIFY==='1'){
  check(await js(`getComputedStyle(document.querySelector('.timer-dock')).display==='none'`),'所选事项详情已显示唯一计时器时，不重复显示底部计时条');
  await click(row('统一颜色与状态提示')+' .tree-title>.editable-value');await settle();
  check(await js(`getComputedStyle(document.querySelector('.timer-dock')).display!=='none'`),'选择其他事项后立即恢复全局计时条');
  await click(row('梳理任务树与详情的操作动线')+' .tree-title>.editable-value');await settle();
 }
 await capture('01-items');
 await capture('00-baseline-items');
 await click('.top-navigation [aria-label="今日"]');await until(`!!document.querySelector('.today-page')`);await capture('01b-today');
 const captureInput='[aria-label="快速添加事项名称"]';
 check(await js(`document.querySelector(${JSON.stringify(captureInput)}).getBoundingClientRect().height<=40`),'今日空白快速记录保持紧凑');
 await click(captureInput);check(await js(`document.querySelector(${JSON.stringify(captureInput)}).getBoundingClientRect().height>=60&&getComputedStyle(document.querySelector('.semantic-capture .capture-toolbar')).display!=='none'`),'输入时展开快速记录并显示保存操作');await click('.today-page h1');
 await js(`document.querySelector('.today-history').scrollIntoView({block:'end'})`);await capture('01c-timeline');
 await click('.top-navigation [aria-label="事项"]');await settle();
 const branch=row('打磨事项工作区');
 await click(branch+' .tree-chevron');await until(`document.querySelector(${JSON.stringify(branch)}).getAttribute('aria-expanded')==='false'`);
 await click(branch+' .tree-chevron');await settle();
 check(await js(`window.__thingsMotion.layout>0&&window.__thingsMotion.enter>0`),'展开与折叠触发局部布局动效 '+await js('JSON.stringify(window.__thingsMotion)'));
 const rename=row('整理交付说明');await click(rename+' .tree-title>.editable-value',2);
 await until(`!!document.querySelector(${JSON.stringify(rename+' .inline-editor input')})`);await input(rename+' .inline-editor input','整理交付说明 · 已核对');await key('Enter');
 await until(`!document.querySelector(${JSON.stringify(rename+' .inline-editor')})`);
 check(service.snapshot().state.tasks.some(t=>t.title==='整理交付说明 · 已核对'),'双击行内编辑保存到同一事项');
 await click(rename+' .tree-title>.editable-value',1,'right');await until(`!!document.querySelector('[role=menu]')`);await capture('02-context-menu');await key('Escape');
 await click(rename+' .tree-name>input');await settle();
 check(service.snapshot().state.tasks.find(t=>t.title==='整理交付说明 · 已核对')!.status==='done','完成后隐藏已完成行');
 check(await js('window.__thingsMotion.exit>0'),'完成行有淡出反馈，周围行平顺补位');
 await button('撤销状态调整');await settle();check(service.snapshot().state.tasks.find(t=>t.title==='整理交付说明 · 已核对')!.status==='open','撤销完成恢复事项');
 await click(row('核对拖拽后的归属')+' .tree-title>.editable-value');await key('N',['control']);
 await until(`!!document.querySelector('[aria-label="新事项名称"]')`);await input('[aria-label="新事项名称"]','交互验证：新事项');await key('Tab');
 check(await js(`document.querySelector('.inline-creator').textContent.includes('在「核对拖拽后的归属」下新增')&&document.activeElement.getAttribute('aria-label')==='新事项名称'`),'Tab 缩进保留输入文字与焦点');
 await key('Tab',['shift']);check(await js(`document.querySelector('.inline-creator').textContent.includes('在「打磨事项工作区」下新增')`),'Shift+Tab 提升新事项一级');
 await key('Tab');await key('Enter',['control']);await settle();
 check(service.snapshot().state.tasks.find(t=>t.title==='交互验证：新事项')?.parentId===id('核对拖拽后的归属'),'快捷创建保留层级');
 const source=row('交互验证：新事项'),target=row('完成 Windows 试用检查');
 await js(`document.querySelector(${JSON.stringify(source)}).scrollIntoView({block:'center'})`);await settle();
 const coords=await js(`(()=>{const a=document.querySelector(${JSON.stringify(source+' .drag-grip')}).getBoundingClientRect(),b=document.querySelector(${JSON.stringify(target)}).getBoundingClientRect();return {a:{x:Math.round(a.x+a.width/2),y:Math.round(a.y+a.height/2)},b:{x:Math.round(b.x+100),y:Math.round(b.y+b.height/2)}};})()`);
 win.webContents.sendInputEvent({type:'mouseMove',...coords.a});win.webContents.sendInputEvent({type:'mouseDown',button:'left',clickCount:1,...coords.a});
 for(let i=1;i<=8;i++){win.webContents.sendInputEvent({type:'mouseMove',modifiers:['leftButtonDown'],x:Math.round(coords.a.x+(coords.b.x-coords.a.x)*i/8),y:Math.round(coords.a.y+(coords.b.y-coords.a.y)*i/8)});await delay(30);}
 await capture('03-drag-target');win.webContents.sendInputEvent({type:'mouseUp',button:'left',clickCount:1,...coords.b});await settle();
 check(service.snapshot().state.tasks.find(t=>t.title==='交互验证：新事项')?.parentId===id('完成 Windows 试用检查'),'实际指针拖拽变更所属分支');
 await click(row('摘录两个值得实践的方法')+' .row-start');await settle();
 check(service.snapshot().timers.length===2,'列表直接开始第二计时器，保留原计时器');
 await click('.top-navigation [aria-label="今日"]');await until(`!!document.querySelector('.today-page')`);await capture('04-today');
 check(await js(`document.querySelector('.today-history')&&document.querySelector('.today-plan')&&document.querySelectorAll('.today-timer').length===2`),'今日保留重点、并行计时、进展与时间线');
 await button('暂停','.today-timer');check(service.snapshot().timers.some(t=>t.paused),'今日暂停计时立即生效');
 await button('恢复专注','.today-timer');check(service.snapshot().timers.every(t=>!t.paused),'今日恢复计时立即生效');
 await click('.top-navigation [aria-label="事项"]');await settle();
 await click(row('梳理任务树与详情的操作动线')+' .tree-title>.editable-value');await button('投入 2','.task-inspector');await capture('05-effort-details');
 check(await js(`!!document.querySelector('.inspector-records')`),'详情可查看累计投入与记录');await button('内容','.task-inspector');
 check(await js('window.__thingsMotion.detail>0'),'切换详情有局部内容动效');
 await settle();const idle=await js('JSON.stringify(window.__thingsMotion)');await delay(2100);
 check(idle===await js('JSON.stringify(window.__thingsMotion)'),'计时刷新不重复播放布局或详情动效');
 await input('[aria-label="在事项树中搜索"]','阅读');await settle();check(await js(`document.querySelectorAll('[data-outline-id]').length<15`),'搜索缩小事项结果');await click('[aria-label="清除搜索"]');await settle();
 await button('本周需完成','.context-nav');await settle();check(await js(`document.querySelector('.tree-page-header').textContent.includes('本周需完成')`),'保存的本周视图可切换');await button('全部事项','.context-nav');await settle();
 if(await js(`!!document.querySelector('[aria-label="关闭提示"]')`))await click('[aria-label="关闭提示"]');
 for(const [w,h] of [[1920,1080],[1280,800],[1000,720],[800,700]]){
   win.setContentSize(w,h);await settle();
   const geometry=await js(`(()=>{const r=document.querySelector('.task-inspector').getBoundingClientRect();return {overflow:document.documentElement.scrollWidth>innerWidth+1,detail:r.width,right:r.right,rows:[...document.querySelectorAll('.outline-row')].map(e=>e.getBoundingClientRect().height)};})()`);
   check(!geometry.overflow&&geometry.right<=w+1&&geometry.rows.every((n:number)=>Math.abs(n-32)<1),`${w}×${h} 无页面横向溢出，详情可见，密度不变`);await capture(`06-items-${w}`);
 }
 win.setContentSize(1440,940);await settle();
 await js(`window.journalAppearance.set({theme:'light',motion:'reduce'})`);await settle();
 const before=await js('JSON.stringify(window.__thingsMotion)');await click(branch+' .tree-chevron');await settle();
 check(before===await js('JSON.stringify(window.__thingsMotion)'),'减少动效模式仍可操作且不产生新动画');
 await click(branch+' .tree-chevron');await settle();
 await checkProductionTheme({win,js,click,button,key,input,capture,check,settle,until,service});
 }
 if(process.env.JOURNAL_QA_AI==='1')await checkAiUi({win,js,click,button,key,input,capture,check,settle,until,service});
 if(process.env.JOURNAL_QA_POLISH==='1')await checkWorkflowPolish({win,js,click,button,key,input,capture,check,settle,until,service});
 if(process.env.JOURNAL_QA_CONTINUITY==='1')await checkWorkspaceContinuity({win,js,click,button,key,input,capture,check,settle,until,service});
 if(process.env.JOURNAL_QA_SIMPLIFY==='1')await checkSimplification({win,js,click,button,key,input,capture,check,settle,until,service});
 if(process.env.JOURNAL_QA_OPERATIONS==='1')await checkOperationFlows({win,js,click,button,key,input,capture,check,settle,until,service});
 if(process.env.JOURNAL_QA_OWNERSHIP==='1')await checkOwnershipRecords({win,js,click,button,key,input,capture,check,settle,until,service,usage});
 check(errors.length===0,'渲染过程无控制台错误');
 }catch(e){errors.push(String(e));console.error(e);if(win)await capture('failure').catch(()=>{});}finally{
 writeFileSync(path.join(output,'results.json'),JSON.stringify({checks:results,errors},null,2));ai?.dispose();usage?.dispose();win?.destroy();appearance?.dispose();service.shutdown();app.exit(errors.length?1:0);
 }}
void main();
