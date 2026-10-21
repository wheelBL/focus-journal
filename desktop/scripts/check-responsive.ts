import {migrateOutline} from '../core/outline';
import {app,BrowserWindow,ipcMain} from 'electron';
import path from 'node:path';
import {mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import {JournalService} from '../core/service';
import {emptyState,localDate,type JournalState} from '../core/types';

// An isolated renderer integration test: no user profile, tray, network or visible windows.
const root=process.cwd(),version=JSON.parse(readFileSync('package.json','utf8')).version;
const output=path.resolve(process.env.JOURNAL_QA_OUTPUT??path.join(root,`qa-evidence/release-${version}/responsive`));mkdirSync(output,{recursive:true});
app.setPath('userData',path.join(root,'qa-data',`responsive-${version}`));
app.disableHardwareAcceleration();
class Store{path='responsive renderer fixture';state=emptyState();load(){return structuredClone(this.state);}save(s:JournalState){this.state=structuredClone(s);}close(){}}
const time=Date.parse('2026-10-19T14:00:00+08:00');let clockTime=time,clockMono=0;
const service=new JournalService(new Store(),{now:()=>clockTime,monotonic:()=>clockMono},true);
service.seedTreeDemo();
const fixture=JSON.parse(service.exportJson()),removed=new Set(['knowledge-review','write-summary','link-notes','tree-drag','release-plan','release-notes','backup-check']);fixture.state.tasks=fixture.state.tasks.filter((t:{id:string})=>!removed.has(t.id));service.importJson(JSON.stringify(fixture));
const rootTask=service.snapshot().state.tasks.find(t=>t.isProject&&t.id!=='inbox')!;
service.execute({type:'item-review.configure',payload:{id:rootTask.id,enabled:true,nextDate:localDate(time),interval:{unit:'weeks',count:1}}});
service.execute({type:'item-reminder.set',payload:{id:rootTask.id,at:new Date(time+3600000).toISOString()}});
// Populate a comparable, realistic source state while keeping behavioral QA isolated.
for(const [id,tag] of [['design','写作'],['input-types','整理'],['error-flow','技术'],['duplicates','技术'],['same-name','技术'],['confirm-copy','写作'],['missing-file','技术'],['outline-api','技术'],['later-0','整理'],['later-1','技术'],['tree-everything','产品'],['tree-nesting','产品'],['tree-inline','产品'],['tree-start','产品'],['read-types','学习'],['practice-types','学习'],['weekly-plan','生活']])service.execute({type:'tag.attach',payload:{id,name:tag}});
for(const t of service.snapshot().state.tasks)if(!t.isProject)service.execute({type:'outline.patch',payload:{id:t.id,field:'dueAt',value:['design','inbox-one','tree-start','weekly-plan'].includes(t.id)?'2026-10-23':'2026-10-22'}});
service.execute({type:'outline.patch',payload:{id:'design',field:'description',value:'主要流程已经列出，接下来细化异常分支。审视安排。'}});
const weekly={view:'all',query:'',showDone:true,scopeId:null,tagIds:[],tagMode:'all',planned:'any',completed:'any',due:'any',projectsOnly:false,sort:'smart',rules:{kind:'group',mode:'all',children:[{kind:'condition',field:'status',op:'is',value:'open'},{kind:'condition',field:'dueAt',op:'before',value:{kind:'relative',anchor:'next-week'}}]}};
service.execute({type:'view.save',payload:{name:'本周需完成',filter:weekly}});
const stable=service.exportJson();
let win:BrowserWindow;
const failures:string[]=[],results:unknown[]=[],errors:string[]=[];
const run=(code:string)=>win.webContents.executeJavaScript(code);
async function settle(){await run('document.fonts.ready');await run('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');}
async function until(selector:string){for(let i=0;i<100;i++){if(await run(`!!document.querySelector(${JSON.stringify(selector)})`)){await settle();return;}await new Promise(r=>setTimeout(r,30));}throw new Error(`Missing ${selector}`);}
const click=(selector:string)=>run(`document.querySelector(${JSON.stringify(selector)}).click()`);
async function capture(){for(let attempt=0;attempt<3;attempt++){try{return (await win.webContents.capturePage()).toPNG();}catch(e){if(attempt===2)throw e;await new Promise(r=>setTimeout(r,250));await settle();}}throw Error('No screenshot');}
const sizes=[[1487,1058,1],[900,640,1],[1060,720,1],[1440,920,1],[1920,1080,1],[2560,1392,1],[900,640,1.25],[1060,720,1.5]];
async function main(){try{
 await app.whenReady();
 ipcMain.handle('journal:clock',()=>service.clockSnapshot());ipcMain.handle('journal:capture-preferences',()=>({shortcut:'',registered:false}));
 ipcMain.handle('journal:snapshot',()=>service.snapshot());ipcMain.handle('journal:command',(_e,c)=>service.execute(c));ipcMain.handle('journal:window',()=>{});
 ipcMain.handle('sync:status',()=>({configured:false,phase:'idle'}));
 ipcMain.handle('local-api:status',()=>({enabled:false,port:17642,access:'read',running:false,baseUrl:null,hasToken:false,error:null}));
 win=new BrowserWindow({show:false,width:1060,height:720,frame:false,webPreferences:{preload:path.join(root,'dist-electron/preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true,offscreen:true,backgroundThrottling:false}});
 win.webContents.on('console-message',(_e,level,message)=>{if(level>=3)errors.push(message);});
 await win.webContents.session.clearStorageData({storages:['localstorage']});
 await win.loadFile(path.join(root,'dist/client/index.html'));await until('.today-page');
 if(!process.env.JOURNAL_QA_CALENDAR_ONLY){
 for(const [page,selector] of [['今日','.today-page'],['事项','.tree-page'],['日历','.calendar-page'],['回顾','.item-review-workspace'],['设置','.settings-page']]){
  await click(`.nav-item[aria-label="${page}"]`);await until(selector);
  if(page==='事项'){await run(`document.querySelector('.outline-row[data-outline-id="design"]')?.click()`);await settle();}
  for(const [width,height,zoom] of sizes){
   win.setContentSize(width,height);win.webContents.setZoomFactor(zoom);await new Promise(r=>setTimeout(r,100));await settle();
   const metrics=await run(`(()=>{const rect=e=>{if(!e)return null;const r=e.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height,right:r.right,bottom:r.bottom,scroll:e.scrollWidth,client:e.clientWidth}};const main=document.querySelector('.main');return {viewport:[innerWidth,innerHeight],document:document.documentElement.scrollWidth,main:rect(main),page:rect(document.querySelector(${JSON.stringify(selector)})),calendar:rect(document.querySelector('.calendar-scroll')),inspector:rect(document.querySelector('.task-inspector')),outline:rect(document.querySelector('.outline-workspace')),layout:getComputedStyle(document.querySelector('.today-layout')||main).gridTemplateColumns,rows:document.querySelectorAll('.outline-row').length}})()`);
   const name=`${page}-${width}x${height}-${zoom}`;
   if(metrics.document>metrics.viewport[0]+1)failures.push(`${name}: document overflow`);
   if(metrics.page.right>metrics.main.right+1||metrics.page.w<metrics.main.w-20)failures.push(`${name}: page not filling available width`);
   if(metrics.inspector?.right>metrics.main.right+1)failures.push(`${name}: inspector clipped`);
   if(metrics.outline&&metrics.outline.w<130)failures.push(`${name}: task list too narrow`);
   if(metrics.calendar&&height>=920&&zoom===1&&metrics.calendar.h<metrics.main.h*.6)failures.push(`${name}: calendar wasting height`);
   // Shared tree columns must stay aligned in both Items and Review, at every container width.
   const columns=await run(`(()=>{
    const header=document.querySelector('.tree-columns'),row=document.querySelector('.outline-row');if(!header||!row)return [];
    const pairs=[['.col-name','.tree-name'],['.col-status','.tree-status'],['.col-tags','.tree-tags'],['.col-estimate','.tree-estimate'],['.col-effort','.tree-effort'],['.col-planned','.tree-date.planned'],['.col-deadline','.tree-deadline'],['.col-actions','.tree-row-actions']];
    return pairs.map(([a,b])=>{const h=header.querySelector(a),c=row.querySelector(b),hr=h.getBoundingClientRect(),cr=c.getBoundingClientRect();return {name:a,headerVisible:getComputedStyle(h).display!=='none',cellVisible:getComputedStyle(c).display!=='none',headerX:hr.x,cellX:cr.x,headerWidth:hr.width,cellWidth:cr.width};});
   })()`);
   for(const col of columns){if(col.headerVisible!==col.cellVisible)failures.push(`${name}: ${col.name} visibility differs from its cells`);else if(col.headerVisible&&(Math.abs(col.headerX-col.cellX)>1||Math.abs(col.headerWidth-col.cellWidth)>1))failures.push(`${name}: ${col.name} header and cells misaligned`);}
   metrics.columns=columns;
   results.push({name,...metrics});
   if(zoom!==1||width===1060||width===1487||width===2560)writeFileSync(path.join(output,`${name}.png`),await capture());
  }
 }
 // Source-state capture: same item, hierarchy and density as selected concept 3.
 await click('.nav-item[aria-label="事项"]');await until('.tree-page');win.setContentSize(1487,1058);win.webContents.setZoomFactor(1);await settle();
 await run(`(()=>{const e=document.querySelector('[aria-label="视图排序"]');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(e,'manual');e.dispatchEvent(new Event('change',{bubbles:true}));document.querySelector('[data-outline-id="design"]').click();})()`);await settle();
 await run(`document.querySelector('.outline-scroll').scrollTop=0`);await settle();
 writeFileSync(path.join(output,'source-state.png'),await capture());
 for(const [label,file] of [['投入','inspector-effort'],['复盘','inspector-review']]){await run(`Array.from(document.querySelectorAll('.inspector-tabs button')).find(b=>b.textContent.startsWith('${label}')).click()`);await settle();writeFileSync(path.join(output,`${file}.png`),await capture());}
 await run(`Array.from(document.querySelectorAll('.inspector-tabs button')).find(b=>b.textContent==='内容').click()`);await settle();

 // Use actual Chromium input to exercise note capture and indentation, not just React dispatch.
 await click('[data-outline-id="design"]');win.webContents.sendInputEvent({type:'keyDown',keyCode:'Insert'});win.webContents.sendInputEvent({type:'keyUp',keyCode:'Insert'});await until('[aria-label="新事项名称"]');
 await win.webContents.insertText('- 键盘记录的参考信息');win.webContents.sendInputEvent({type:'keyDown',keyCode:'Tab'});win.webContents.sendInputEvent({type:'keyUp',keyCode:'Tab'});await settle();
 writeFileSync(path.join(output,'keyboard-capture.png'),await capture());
 win.webContents.sendInputEvent({type:'keyDown',keyCode:'Enter',modifiers:['control']});win.webContents.sendInputEvent({type:'keyUp',keyCode:'Enter',modifiers:['control']});await until('.note-content');
 const note=service.snapshot().state.tasks.at(-1)!;if(note.itemType!=='note'||note.parentId!=='design')failures.push('Native keyboard note/indent/save did not persist correct kind and parent');
 writeFileSync(path.join(output,'note-inspector.png'),await capture());
 await run(`document.querySelector('.shortcut-link').click()`);await until('.shortcut-groups');writeFileSync(path.join(output,'keyboard-help.png'),await capture());await click('dialog [aria-label="关闭"]');
 // Finish one real renderer/IPC timer cycle without touching the Windows desktop or user profile.
 await click('[data-outline-id="design"]');await settle();
 const chord=async(modifiers:string[])=>{win.webContents.sendInputEvent({type:'keyDown',keyCode:'Enter',modifiers});win.webContents.sendInputEvent({type:'keyUp',keyCode:'Enter',modifiers});await settle();};
 await chord(['control']);await until('.compact-timer');
 const sessionId=service.snapshot().timers.find(t=>t.taskId==='design')?.sessionId;if(!sessionId)throw new Error('Keyboard start did not create a timer');
 clockTime+=65000;clockMono+=65000;await chord(['control']);
 if(!service.snapshot().timers.find(t=>t.sessionId===sessionId)?.paused)throw new Error('Keyboard pause failed');
 await chord(['control']);if(service.snapshot().timers.find(t=>t.sessionId===sessionId)?.paused)throw new Error('Keyboard resume failed');
 clockTime+=10000;clockMono+=10000;await chord(['control','shift']);await until('dialog');
 const recorded=service.snapshot().state.sessions.find(s=>s.id===sessionId);if(recorded?.status!=='ended'||recorded.durationMs!==75000)throw new Error('Keyboard stop did not retain the correct effort');
 writeFileSync(path.join(output,'keyboard-timer-summary.png'),await capture());
 clockTime=time;clockMono=0;
 service.importJson(stable);await win.webContents.reload();await until('.tree-page');
 await click('.nav-item[aria-label="事项"]');await until('.tree-page');win.setContentSize(900,640);win.webContents.setZoomFactor(1.25);await settle();
 await run(`Array.from(document.querySelectorAll('.filter-controls button')).find(b=>b.textContent==='筛选').click()`);await settle();
 await run(`Array.from(document.querySelectorAll('.filter-controls button')).find(b=>b.textContent==='保存视图').click()`);await settle();
 const nameInput=await run(`(()=>{const e=document.querySelector('[aria-label="常用视图名称"]'),r=e.getBoundingClientRect();return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)};})()`);
 const scale=win.webContents.getZoomFactor(),inputPoint={x:Math.round(nameInput.x*scale),y:Math.round(nameInput.y*scale)};win.webContents.sendInputEvent({type:'mouseDown',button:'left',clickCount:1,...inputPoint});win.webContents.sendInputEvent({type:'mouseUp',button:'left',clickCount:1,...inputPoint});await win.webContents.insertText('窗口验证视图');await settle();
 const saveButton=await run(`(()=>{const e=document.querySelector('.view-save-dialog button[type="submit"]'),r=e.getBoundingClientRect();return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2),hit:e.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))};})()`);
 if(!saveButton.hit)failures.push('Save view button is obscured');
 writeFileSync(path.join(output,'save-view-final.png'),await capture());
 const x=Math.round(saveButton.x*scale),y=Math.round(saveButton.y*scale);win.webContents.sendInputEvent({type:'mouseDown',button:'left',clickCount:1,x,y});win.webContents.sendInputEvent({type:'mouseUp',button:'left',clickCount:1,x,y});await settle();
 if(!service.snapshot().state.views.some(v=>v.name==='窗口验证视图'))failures.push('Actual mouse save did not persist view');
 await win.webContents.reload();await until('.tree-page');await click('.nav-item[aria-label="事项"]');await until('.tree-page');
 if(!await run(`Array.from(document.querySelector('[aria-label="常用视图"]').options).some(o=>o.textContent==='窗口验证视图')`))failures.push('Saved view missing after reload');
 const savedView=service.snapshot().state.views.find(v=>v.name==='窗口验证视图');if(savedView)service.execute({type:'view.delete',payload:{id:savedView.id}});
 if(service.exportJson()!==stable)failures.push('Resizing changed journal data');
 // New semantic preview, batch impact and persisted workspace, using the packaged renderer.
 win.setContentSize(1060,720);win.webContents.setZoomFactor(1);await click('.nav-item[aria-label="今日"]');await until('.today-page');
 await run(`document.querySelector('[aria-label="快速添加事项名称"]').focus()`);await win.webContents.insertText('. 写周报 %写作 明天开始 周五17:00截止 估计50分钟');await settle();
 writeFileSync(path.join(output,'semantic-preview.png'),await capture());
 await run(`document.querySelector('.semantic-capture').requestSubmit()`);await settle();
 const semantic=service.snapshot().state.tasks.at(-1)!;if(semantic.title!=='写周报'||semantic.estimateMinutes!==50||!semantic.dueAt)failures.push('Semantic renderer save failed');
 await run(`document.querySelector('[aria-label="快速添加事项名称"]').focus()`);await win.webContents.insertText('- 接口备忘 %参考\n正文保留 #标题 与 %原文。\n明天截止只是示例文字。');await settle();await run(`document.querySelector('.toast button')?.click();document.querySelector('.semantic-capture').scrollIntoView({block:'end'})`);await settle();writeFileSync(path.join(output,'multiline-capture.png'),await capture());
 await run(`document.querySelector('.semantic-capture').requestSubmit()`);await settle();
 await click('.nav-item[aria-label="事项"]');await until('.tree-page');await click('[data-outline-id="design"]');
 await run(`document.querySelector('[data-outline-id="error-flow"]').dispatchEvent(new MouseEvent('click',{bubbles:true,ctrlKey:true}))`);await settle();await run(`Array.from(document.querySelectorAll('.batch-toolbar button')).find(b=>b.textContent.includes('整理所选')).click()`);await settle();
 writeFileSync(path.join(output,'batch-impact.png'),await capture());await click('dialog [aria-label="关闭"]');
 await run(`document.querySelector('[aria-label="收起详情"]').click();document.querySelector('[aria-label="折叠设计异常处理"]').click()`);await settle();await win.webContents.reload();await until('.tree-page');
 const resumed=await run(`({details:!!document.querySelector('.task-inspector'),collapsed:document.querySelector('[data-outline-id="error-flow"]').getAttribute('aria-expanded'),selection:document.querySelector('[data-outline-id="error-flow"]').getAttribute('aria-selected')})`);
 if(!resumed.details||resumed.collapsed!=='false'||resumed.selection!=='true')failures.push('Workspace did not survive renderer restart');
 // A one-time large-outline measurement decides whether windowing is needed.
 const large=emptyState(),template=service.snapshot().state.tasks.find(t=>t.id==='later-0')!;
 for(let i=0;i<5000;i++)large.tasks.push({...structuredClone(template),id:`perf-${i}`,title:`性能验证事项 ${i}`,projectId:'inbox',parentId:'inbox',isProject:false,order:i,tagIds:[],reviewSchedule:null,reminder:null,focusDate:null,plannedDate:null,dueAt:null,createdAt:new Date(time+i).toISOString()});
 service.importJson(JSON.stringify({format:'focus-journal',version:13,state:migrateOutline(large)}));await run('localStorage.clear()');
 const perfStart=Date.now();await win.webContents.reload();await until('.today-page');const treeStart=Date.now();await click('.nav-item[aria-label="事项"]');await until('[data-outline-id="perf-0"]');
 const renderPerformance={items:5000,elapsedMs:Date.now()-perfStart,treeMs:Date.now()-treeStart,rows:await run("document.querySelectorAll('.outline-row').length")};writeFileSync(path.join(output,'large-outline.json'),JSON.stringify(renderPerformance,null,2));
 if(renderPerformance.rows>100)failures.push('Large tree mounted more than the visible row window');
 await click('[data-outline-id="inbox"]');win.webContents.sendInputEvent({type:'keyDown',keyCode:'End'});win.webContents.sendInputEvent({type:'keyUp',keyCode:'End'});await until('[data-outline-id="perf-4999"]');
 if(!await run(`document.activeElement?.getAttribute('data-outline-id')==='perf-4999'`))failures.push('End did not focus the last virtual row');
 win.webContents.sendInputEvent({type:'keyDown',keyCode:'Insert'});win.webContents.sendInputEvent({type:'keyUp',keyCode:'Insert'});await until('[aria-label="新事项名称"]');await win.webContents.insertText('- 大树中的记录 %检查');await settle();
 win.webContents.sendInputEvent({type:'keyDown',keyCode:'Tab'});win.webContents.sendInputEvent({type:'keyUp',keyCode:'Tab'});await settle();win.webContents.sendInputEvent({type:'keyDown',keyCode:'Enter',modifiers:['control']});win.webContents.sendInputEvent({type:'keyUp',keyCode:'Enter',modifiers:['control']});await settle();
 const largeNote=service.snapshot().state.tasks.at(-1)!;if(largeNote.title!=='大树中的记录'||largeNote.parentId!=='perf-4999'||largeNote.itemType!=='note')failures.push('Capture in a virtualized subtree lost its content or nesting');
 writeFileSync(path.join(output,'large-tree-last-row.png'),await capture());
 }
 // Current release scenarios: readable independent status/urgency, ordinary Inbox, recurrence and calendar.
 service.importJson(stable);
 service.execute({type:'outline.patch',payload:{id:'error-flow',field:'dueAt',value:'2026-10-19'}});
 service.execute({type:'item.change',payload:{id:'later-0',action:'pause'}});
 service.execute({type:'outline.patch',payload:{id:'inbox',field:'isProject',value:false}});
 const noteId=service.execute({type:'outline.create',payload:{parentId:'knowledge',title:'- 资料：接口约定与参考',kind:'note'}}).state.tasks.at(-1)!.id;
 const eventId=service.execute({type:'outline.create',payload:{parentId:'knowledge',title:'o 每周同步进展',kind:'event'}}).state.tasks.at(-1)!.id;
 service.execute({type:'event.save',payload:{id:eventId,at:'2026-10-19T09:00:00+08:00',end:'2026-10-19T09:30:00+08:00'}});
 const weeklyRule={mode:'calendar',unit:'week',interval:1,anchor:'2026-10-19',weekdays:[1,3],until:null};
 service.execute({type:'recurrence.set',payload:{id:eventId,rule:weeklyRule}});
 service.execute({type:'recurrence.set',payload:{id:'weekly-plan',rule:{...weeklyRule,unit:'day',mode:'completion',weekdays:[1]}}});
 service.execute({type:'focus.start',payload:{taskId:'design',skipEstimate:true}});
 await run('localStorage.clear()');await win.webContents.reload();await until('.today-page');
 await click('.nav-item[aria-label="事项"]');await until('.tree-page');win.setContentSize(1487,1058);win.webContents.setZoomFactor(1);await click('[data-outline-id="design"]');await settle();
 const statusState=await run(`({started:document.querySelector('[data-outline-id="design"] .tree-status').textContent,overdue:document.querySelector('[data-outline-id="error-flow"] .overdue-label').textContent,inboxProject:document.querySelector('[data-outline-id="inbox"]').classList.contains('project'),moveControl:!!document.querySelector('.move-control'),details:!!document.querySelector('.task-inspector')})`);
 if(statusState.started!=='正在计时'||statusState.overdue!=='逾期'||statusState.inboxProject||statusState.moveControl||!statusState.details)failures.push('Release item status/Inbox/details scenario failed');
 writeFileSync(path.join(output,'readability-source.png'),await capture());
 await click('[data-outline-id="weekly-plan"]');await click('.recurrence-heading button');await settle();
 for(const [width,height,zoom] of [[1487,1058,1],[900,640,1.25],[1060,720,1.5]]){
  win.setContentSize(width,height);win.webContents.setZoomFactor(zoom);await settle();
  const geometry=await run(`(()=>{const panel=document.querySelector('.task-inspector'),editor=document.querySelector('.recurrence-editor');return {overflow:document.documentElement.scrollWidth>innerWidth+1,panelOverflow:panel.scrollWidth>panel.clientWidth+1,editor:!!editor}})()`);
  if(geometry.overflow||geometry.panelOverflow||!geometry.editor)failures.push(`Recurrence editor clipped ${width}/${zoom}`);
  writeFileSync(path.join(output,`repeat-editor-${width}-${zoom}.png`),await capture());
 }
 win.setContentSize(1487,1058);win.webContents.setZoomFactor(1);await click('.nav-item[aria-label="日历"]');await until('.calendar-page');await settle();
 const eventCount=await run(`Array.from(document.querySelectorAll('.calendar-scheduled-event')).filter(e=>e.textContent.includes('每周同步进展')).length`);
 if(eventCount!==2)failures.push(`Expected two recurring calendar events, got ${eventCount}`);
 writeFileSync(path.join(output,'recurring-calendar.png'),await capture());
 // Real Chromium pointer selection, modal editing and atomic calendar/item persistence.
 await run(`Array.from(document.querySelectorAll('.context-nav button')).find(b=>b.textContent==='日视图').click()`);await settle();
 await run(`(()=>{const e=document.querySelector('[aria-label="查看日期"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,'2026-10-18');e.dispatchEvent(new Event('input',{bubbles:true}));})()`);await settle();
 await run(`document.querySelector('.calendar-scroll').scrollTop=6*48`);await settle();
 const dragPoints=await run(`(()=>{const r=document.querySelector('.day-column').getBoundingClientRect();return {x:Math.round(r.x+r.width*.7),start:Math.round(r.y+8*48),end:Math.round(r.y+9*48)};})()`);
 win.webContents.sendInputEvent({type:'mouseMove',x:dragPoints.x,y:dragPoints.start});win.webContents.sendInputEvent({type:'mouseDown',button:'left',clickCount:1,x:dragPoints.x,y:dragPoints.start});
 for(let i=1;i<=4;i++){win.webContents.sendInputEvent({type:'mouseMove',x:dragPoints.x,y:Math.round(dragPoints.start+(dragPoints.end-dragPoints.start)*i/4)});await settle();}
 await until('.calendar-selection');writeFileSync(path.join(output,'calendar-range-drag.png'),await capture());
 win.webContents.sendInputEvent({type:'mouseUp',button:'left',clickCount:1,x:dragPoints.x,y:dragPoints.end});await until('.calendar-create');
 await run(`Array.from(document.querySelectorAll('.calendar-create-modes button')).find(b=>b.textContent.startsWith('补记投入')).click()`);await settle();
 await run(`(()=>{const e=document.querySelector('dialog [aria-label="事项名称"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,'从日历补记的工作');e.dispatchEvent(new Event('input',{bubbles:true}));})()`);await settle();
 const rangeValues=await run(`({start:document.querySelector('[aria-label="实际开始"]').value,end:document.querySelector('[aria-label="实际结束"]').value})`);
 if(rangeValues.start!=='2026-10-18T08:00'||rangeValues.end!=='2026-10-18T09:00')failures.push('Calendar native pointer range time mismatch');
 for(const [width,height,zoom] of [[1487,1058,1],[900,640,1.25],[1060,720,1.5]]){
  win.setContentSize(width,height);win.webContents.setZoomFactor(zoom);await settle();
  const geometry=await run(`(()=>{const d=document.querySelector('dialog'),r=d.getBoundingClientRect();return {overflow:d.scrollWidth>d.clientWidth+1||document.documentElement.scrollWidth>innerWidth+1,visible:r.left>=0&&r.right<=innerWidth+1&&r.top>=0&&r.bottom<=innerHeight+1}})()`);
  if(geometry.overflow||!geometry.visible)failures.push(`Calendar creation dialog clipped ${width}/${zoom}`);
  writeFileSync(path.join(output,`calendar-range-editor-${width}-${zoom}.png`),await capture());
 }
 win.setContentSize(1487,1058);win.webContents.setZoomFactor(1);await new Promise(r=>setTimeout(r,150));await settle();win.webContents.focus();
 await run(`window.calendarClicks=[];document.addEventListener('click',e=>window.calendarClicks.push(e.target.textContent),{capture:true})`);
 const calendarSave=await run(`(()=>{const e=document.querySelector('.calendar-create button[type="submit"]'),r=e.getBoundingClientRect();return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)};})()`);
 win.webContents.sendInputEvent({type:'mouseMove',...calendarSave});await settle();
 win.webContents.sendInputEvent({type:'mouseDown',button:'left',clickCount:1,...calendarSave});win.webContents.sendInputEvent({type:'mouseUp',button:'left',clickCount:1,...calendarSave});await settle();
 for(let i=0;i<50&&await run(`!!document.querySelector('.calendar-create')`);i++)await new Promise(r=>setTimeout(r,50));
 writeFileSync(path.join(output,'calendar-native-click.json'),JSON.stringify({calendarSave,zoom:win.webContents.getZoomFactor(),clicks:await run('window.calendarClicks')},null,2));
 const calendarItem=service.snapshot().state.tasks.find(t=>t.title==='从日历补记的工作'),calendarRecord=service.snapshot().state.sessions.find(s=>s.taskId===calendarItem?.id);
 if(!calendarItem?.startedAt||calendarRecord?.durationMs!==3600000||calendarItem.status!=='open')failures.push('Calendar effort did not update item and session together');
 writeFileSync(path.join(output,'calendar-range-saved.png'),await capture());
 writeFileSync(path.join(output,'calendar-selection.json'),JSON.stringify({rangeValues,itemId:calendarItem?.id,startedAt:calendarItem?.startedAt,durationMs:calendarRecord?.durationMs},null,2));
 writeFileSync(path.join(output,'release-scenarios.json'),JSON.stringify({statusState,eventCount,noteId,eventId,effortRecords:service.snapshot().state.sessions.length},null,2));
 // Start-first timing: native pointer controls, deferred recovery and preserved evidence.
 for(const timer of service.snapshot().timers)service.execute({type:'focus.stop',payload:{sessionId:timer.sessionId}});
 clockTime=time;clockMono=0;service.importJson(stable);
 await run('localStorage.clear()');await win.webContents.reload();await until('.today-page');
 win.setContentSize(1060,720);win.webContents.setZoomFactor(1);await new Promise(r=>setTimeout(r,150));await settle();
 async function pointer(selector:string){
  const point=await run(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});e.scrollIntoView({block:'nearest'});const r=e.getBoundingClientRect();return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)}})()`);const z=win.webContents.getZoomFactor();point.x=Math.round(point.x*z);point.y=Math.round(point.y*z);win.webContents.focus();win.webContents.sendInputEvent({type:'mouseMove',...point});await settle();win.webContents.sendInputEvent({type:'mouseDown',button:'left',clickCount:1,...point});win.webContents.sendInputEvent({type:'mouseUp',button:'left',clickCount:1,...point});await settle();
 }
 await click('.nav-item[aria-label="事项"]');await until('.tree-page');await pointer('.quick-timer-start');await until('.unassigned-timer');
 const first=service.snapshot().timer!.sessionId;clockTime+=60000;clockMono+=60000;
 await click('.unassigned-timer .focus-actions .secondary:not(.stop-for-break)');
 await until('.unassigned-timer .focus-actions .secondary:not(.stop-for-break):not(:disabled)');
 if(service.snapshot().timer?.paused!==true)throw Error('Pause did not commit');
 clockTime+=30000;clockMono+=30000;await click('.unassigned-timer .focus-actions .secondary:not(.stop-for-break)');
 await until('.unassigned-timer .focus-actions .secondary:not(.stop-for-break):not(:disabled)');
 if(service.snapshot().timer?.paused!==false)throw Error('Resume did not commit');
 clockTime+=120000;clockMono+=120000;
 win.webContents.send('journal:changed');await settle();writeFileSync(path.join(output,'start-first-timer.png'),await capture());
 await pointer('.unassigned-timer .primary');await until('[aria-label="补充这段时间的事项"]');
 const original=structuredClone(service.snapshot().state.sessions.find(r=>r.id===first)!);
 for(const [width,height,zoom] of [[1487,1058,1],[900,640,1.25],[1060,720,1.5]]){
  win.setContentSize(width,height);win.webContents.setZoomFactor(zoom);await new Promise(r=>setTimeout(r,100));await settle();
  const geometry=await run(`(()=>{const d=document.querySelector('dialog'),r=d.getBoundingClientRect(),b=document.querySelector('.quick-timer-start').getBoundingClientRect();return {overflow:d.scrollWidth>d.clientWidth+1||document.documentElement.scrollWidth>innerWidth+1,visible:r.left>=0&&r.right<=innerWidth+1&&r.top>=0&&r.bottom<=innerHeight+1,entryVisible:b.left>=0&&b.right<=innerWidth}})()`);
  if(geometry.overflow||!geometry.visible||!geometry.entryVisible)failures.push(`Start-first UI clipped ${width}/${zoom}`);
  writeFileSync(path.join(output,`assign-session-${width}-${zoom}.png`),await capture());
 }
 win.setContentSize(1060,720);win.webContents.setZoomFactor(1);await new Promise(r=>setTimeout(r,150));await settle();await click('dialog .modal-actions .subtle');
 await win.webContents.reload();await until('.unassigned-queue');await click('.unassigned-queue summary');await click('.unassigned-queue button');await until('[aria-label="这段时间做了什么"]');
 await run(`(()=>{const e=document.querySelector('[aria-label="这段时间做了什么"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,'先计时后补充的工作');e.dispatchEvent(new Event('input',{bubbles:true}));})()`);await settle();await pointer('dialog button[type="submit"]');
 for(let i=0;i<60&&service.snapshot().state.sessions.find(r=>r.id===first)!.taskId===null;i++)await new Promise(r=>setTimeout(r,50));await settle();
 const assigned=service.snapshot().state.sessions.find(r=>r.id===first)!;
 if(assigned.taskId===null||assigned.durationMs!==180000||JSON.stringify(assigned.segments)!==JSON.stringify(original.segments)||assigned.manual)failures.push('Start-first native assignment lost timed evidence');
 if(service.snapshot().state.tasks.find(t=>t.id===assigned.taskId)?.title!=='先计时后补充的工作')failures.push('Start-first item creation failed');
 writeFileSync(path.join(output,'assigned-session-today.png'),await capture());
 await click('.nav-item[aria-label="日历"]');await until('.calendar-page');await settle();
 if(!await run(`Array.from(document.querySelectorAll('[data-session-id]')).some(b=>b.textContent.includes('先计时后补充的工作'))`))failures.push('Assigned session missing from calendar');
 writeFileSync(path.join(output,'start-first-validation.json'),JSON.stringify({sessionId:first,original,assigned,created:service.snapshot().state.tasks.find(t=>t.id===assigned.taskId)},null,2));
 if(errors.length)failures.push(...errors);
 writeFileSync(path.join(output,'results.json'),JSON.stringify({cases:results.length,failures,results},null,2));
 console.log(JSON.stringify({cases:results.length,failures,output}));
}catch(e){console.error(e);failures.push(String(e));}finally{win?.destroy();service.shutdown();app.exit(failures.length?1:0);}

}
void main();
