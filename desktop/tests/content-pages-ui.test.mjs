import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {randomUUID} from 'node:crypto';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';
import {JournalService} from '../core/service.ts';
import {emptyState} from '../core/types.ts';

async function harness(){
 const dom=new JSDOM('<!doctype html><div id="workspace-sidebar"></div><div id="root"></div>',{url:'http://localhost',pretendToBeVisual:true});
 for(const key of ['window','document','HTMLElement','HTMLInputElement','HTMLSelectElement','HTMLTextAreaElement','Event','MouseEvent','KeyboardEvent','CustomEvent'])globalThis[key]=dom.window[key];
 globalThis.localStorage=dom.window.localStorage;globalThis.IS_REACT_ACT_ENVIRONMENT=true;globalThis.requestAnimationFrame=cb=>setTimeout(cb,0);globalThis.cancelAnimationFrame=clearTimeout;
 dom.window.HTMLElement.prototype.scrollIntoView=function(){};
 dom.window.HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','');};dom.window.HTMLDialogElement.prototype.close=function(){this.removeAttribute('open');};
 class Store{path=`content UI ${randomUUID()}`;state=emptyState();load(){return structuredClone(this.state);}save(s){this.state=structuredClone(s);}close(){}}
 const clock={time:Date.parse('2026-11-02T10:00:00'),now(){return this.time;},monotonic(){return 0;}},service=new JournalService(new Store(),clock);
 const {default:React,act}=await import('react'),{createRoot}=await import('react-dom/client'),folder=path.resolve('qa-evidence/content-pages/dom');mkdirSync(folder,{recursive:true});const output=path.join(folder,`${randomUUID()}.mjs`);
 await build({stdin:{contents:`export {Notes} from './src/Notes';export {Reminders} from './src/Reminders';export {Inbox} from './src/Inbox';export {normalizeReminderRule} from './src/ReminderScheduleEditor';export {AppContext} from './src/ui';export {setContentScope} from './src/content-navigation';`,resolveDir:process.cwd(),loader:'tsx'},outfile:output,bundle:true,platform:'node',format:'esm',packages:'external',jsx:'automatic',loader:{'.css':'empty'},logLevel:'silent'});
 const components=await import(pathToFileURL(output).href),root=createRoot(document.querySelector('#root'));let setSnapshot,mode='Notes',setMode,intercept=null;const commands=[],dialogs=[];
 function Host(){const [snapshot,update]=React.useState(service.snapshot()),[page,change]=React.useState(mode);setSnapshot=update;setMode=change;const Page=components[page];const run=async command=>{commands.push(command);if(intercept)await intercept(command);const result=service.execute(command);update(result);return result;};return React.createElement(components.AppContext.Provider,{value:{data:snapshot,run,dialog:spec=>dialogs.push(spec),notify:()=>{},busy:false,date:'2026-11-02',setDate:()=>{},navigate:()=>{}}},React.createElement(Page));}
 const action=async fn=>act(async()=>{await fn();await new Promise(resolve=>setTimeout(resolve,5));});
 const query=(selector,parent=document)=>{const el=parent.querySelector(selector);assert.ok(el,`Missing ${selector}`);return el;},label=(name,parent=document)=>query(`[aria-label="${name}"]`,parent),button=(name,parent=document)=>{const el=[...parent.querySelectorAll('button')].find(el=>el.textContent.trim()===name);assert.ok(el,`Missing button ${name}`);return el;};
 const click=el=>action(()=>el.click()),input=(el,value)=>action(()=>{const proto=el instanceof HTMLSelectElement?HTMLSelectElement.prototype:el instanceof HTMLTextAreaElement?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,'value').set.call(el,value);el.dispatchEvent(new Event(el instanceof HTMLSelectElement?'change':'input',{bubbles:true}));});
 const execute=command=>service.execute(command),add=(title,parentId='inbox',itemType='task',description='')=>execute({type:'capture.create',payload:{parentId,draft:{title,description,itemType,parentQuery:null,tagNames:[],plannedDate:null,dueAt:null,estimateMinutes:null,remindAt:null,eventAt:null,eventEnd:null}}}).state.tasks.at(-1).id;
 const group=(title,parentId=null)=>execute({type:'outline.create',payload:{title,parentId,kind:'group'}}).state.tasks.at(-1).id;
 return {components,clock,service,commands,dialogs,query,label,button,click,input,action,add,group,execute,get:id=>service.snapshot().state.tasks.find(t=>t.id===id),intercept:fn=>{intercept=fn;},refresh:()=>action(()=>setSnapshot(service.snapshot())),scope:id=>action(()=>components.setContentScope(service.snapshot().dataPath,id)),mount:page=>action(()=>{mode=page;root.render(React.createElement(Host));}),show:page=>action(()=>setMode(page)),close:async()=>{await action(()=>root.unmount());service.shutdown();dom.window.close();}};
}

test('notes retain body, cursor and per-scope query across modules; generation preserves the source and links a new task',async()=>{
 const h=await harness(),{add,group,click,input,label,button,query}=h,area=group('MDE'),other=group('其他'),note=add('接口笔记',area,'note','原始正文'),second=add('另一篇',area,'note','第二篇'),foreign=add('别处笔记',other,'note','别处');
 try{await h.mount('Notes');await h.scope(area);await click(button('接口笔记原始正文MDE'));await input(label('笔记正文'),'保留草稿\n下一步实现接口');await input(label('搜索笔记'),'接口');await h.show('Reminders');await h.show('Notes');assert.equal(label('笔记正文').value,'保留草稿\n下一步实现接口');assert.equal(label('搜索笔记').value,'接口');await h.scope(other);assert.equal(label('搜索笔记').value,'');assert.match(query('[aria-label="笔记列表"]').textContent,/别处笔记/);await h.scope(area);assert.equal(label('搜索笔记').value,'接口');await click(button('保存笔记'));assert.equal(h.get(note).description,'保留草稿\n下一步实现接口');await click(button('生成任务'));await input(label('生成任务名称'),'实现接口');await click(button('生成任务',label('从笔记生成任务')));const created=h.service.snapshot().state.tasks.find(t=>t.title==='实现接口');assert.ok(created);assert.equal(created.parentId,area);assert.deepEqual(h.get(note).relatedTaskIds,[created.id]);assert.equal(h.get(note).itemType,'note');assert.equal(h.get(note).description,'保留草稿\n下一步实现接口');await click(button('继续写笔记'));assert.equal(label('笔记正文').value,'保留草稿\n下一步实现接口');assert.ok(h.get(second)&&h.get(foreign));}finally{await h.close();}
});

test('reminders aggregate original sources once, acknowledge without task completion and create standalone reminders directly',async()=>{
 const h=await harness(),{group,add,execute,click,input,label,button,query}=h,g=group('MDE'),task=add('附带提醒',g),now=h.service.snapshot().now;
 execute({type:'reminder.schedule',payload:{id:task,at:now,rule:null}});const pure=execute({type:'reminder.create',payload:{title:'独立提醒',parentId:g,at:now,rule:{mode:'calendar',unit:'day',interval:1,anchor:'2026-11-02',weekdays:[],until:null}}}).state.tasks.at(-1).id;
 h.service.tick();try{await h.mount('Reminders');assert.equal(document.querySelectorAll('.content-reminder-row').length,2);await click(button('确认本次',label('附带提醒的提醒')));assert.equal(h.get(task).status,'open');assert.equal(h.get(task).reminder.state,'dismissed');assert.equal(h.service.snapshot().state.sessions.length,0);await click(button('新增提醒'));await input(label('提醒名称'),'喝水');await input(label('提醒时间'),'2026-11-03T09:00');await click(button('保存提醒'));const created=h.service.snapshot().state.tasks.find(t=>t.title==='喝水');assert.ok(created);assert.equal(created.itemType,'reminder');assert.equal(created.parentId,null);assert.equal(h.commands.filter(c=>c.type==='reminder.create').length,1);assert.equal(h.commands.filter(c=>c.type==='task.save'||c.type==='reminder.convert').length,0);await click(query('.content-reminder-select',label('独立提醒的提醒')));await click(button('停止提醒'));assert.equal(h.get(pure).reminder.state,'dismissed');await input(label('提醒状态筛选'),'stopped');assert.match(label('提醒列表').textContent,/独立提醒/);assert.equal(h.get(pure).status,'open');}finally{await h.close();}
});

test('inbox organization is atomic, failures keep the selected draft, skip keeps contents and save chooses the next item',async()=>{
 const h=await harness(),{group,add,input,click,label,button,query}=h,a=group('产品'),b=group('平台',a),g=group('三级分组',b),first=add('捕获一'),second=add('捕获二','inbox','note','保留说明');let fail=true;
 h.intercept(command=>{if(command.type==='inbox.organize'&&fail){fail=false;throw Error('模拟保存失败');}});
 try{await h.mount('Inbox');await input(label('收件箱条目名称'),'整理后的标题');await input(label('收件箱条目正文'),'完整说明');await input(label('整理内容类型'),'note');await input(label('搜索完整分组路径'),'产品 / 平台 / 三级');await input(label('归属分组'),g);await click(button('保存并下一条'));assert.match(query('[role="alert"]').textContent,/模拟保存失败/);assert.equal(label('收件箱条目名称').value,'整理后的标题');assert.equal(h.get(first).parentId,'inbox');assert.equal(h.get(first).itemType,'task');await click(button('保存并下一条'));assert.equal(h.get(first).parentId,g);assert.equal(h.get(first).title,'整理后的标题');assert.equal(h.get(first).description,'完整说明');assert.equal(h.get(first).itemType,'note');assert.equal(label('收件箱条目名称').value,'捕获二');await click(button('跳过，下一条'));assert.equal(h.get(second).parentId,'inbox');await click(button('保存并下一条'));assert.equal(h.get(second).parentId,null);assert.match(label('收件箱内容').textContent,/没有待澄清内容/);assert.equal(h.service.snapshot().state.tasks.filter(t=>t.id==='inbox').length,1);}finally{await h.close();}
});

test('inbox reminder save guards duplicate writes and keeps the submitted fields until the atomic result',async()=>{
 const h=await harness(),{add,input,click,label,button,action}=h,id=add('到时取件');let release,entered=false;
 h.intercept(command=>{if(command.type==='inbox.organize'){entered=true;return new Promise(resolve=>{release=resolve;});}});
 try{await h.mount('Inbox');await input(label('整理内容类型'),'reminder');await input(label('提醒时间'),'2026-11-03T11:00');await click(button('保存并下一条'));assert.ok(entered);assert.equal(h.get(id).parentId,'inbox');assert.equal(label('收件箱条目名称').matches(':disabled'),true);assert.equal(button('跳过，下一条').disabled,true);await action(()=>button('正在保存…').click());assert.equal(h.commands.filter(c=>c.type==='inbox.organize').length,1);await action(()=>release());assert.equal(h.get(id).itemType,'reminder');assert.equal(h.get(id).parentId,null);assert.equal(h.get(id).status,'open');assert.match(document.body.textContent,/没有待澄清内容/);}finally{await h.close();}
});

test('explicit content locate previews a filtered note without clearing its query',async()=>{
 const h=await harness(),id=h.add('目标笔记',null,'note','目标正文');try{await h.mount('Notes');await h.input(h.label('搜索笔记'),'不匹配');await h.show('Inbox');window.sessionStorage.setItem('journal-content-locate',JSON.stringify({id,module:'notes'}));await h.show('Notes');assert.equal(h.label('笔记正文').value,'目标正文');assert.equal(h.label('搜索笔记').value,'不匹配');assert.match(document.body.textContent,/当前笔记已不符合筛选/);assert.equal(window.sessionStorage.getItem('journal-content-locate'),null);}finally{await h.close();}
});

test('saved note caches follow external edits while conflicting unsaved fields survive across scopes',async()=>{
 const h=await harness(),g=h.group('MDE'),id=h.add('初始标题',g,'note','初始正文');
 try{await h.mount('Notes');await h.input(h.label('笔记正文'),'第一次保存');await h.click(h.button('保存笔记'));await h.show('Inbox');h.execute({type:'note.update',payload:{id,title:'外部标题',description:'外部正文'}});await h.refresh();await h.show('Notes');assert.equal(h.label('笔记正文').value,'外部正文');assert.equal(h.label('笔记名称').value,'外部标题');assert.equal(h.button('保存笔记').disabled,true);
 await h.input(h.label('笔记正文'),'保留未保存内容');h.execute({type:'note.update',payload:{id,title:'较新的标题',description:'另一个窗口的正文'}});await h.refresh();assert.equal(h.label('笔记正文').value,'保留未保存内容');assert.equal(h.label('笔记名称').value,'较新的标题');assert.match(document.body.textContent,/已在别处修改/);await h.scope(g);assert.equal(h.label('笔记正文').value,'保留未保存内容');await h.click(h.button('保存笔记'));assert.equal(h.get(id).description,'保留未保存内容');assert.equal(h.get(id).title,'较新的标题');assert.equal(document.body.textContent.includes('已在别处修改'),false);
 }finally{await h.close();}
});

test('a late note save updates the journal but keeps a newer draft opened while waiting',async()=>{
 const h=await harness(),id=h.add('异步笔记',null,'note','起始');let release;
 h.intercept(command=>command.type==='note.update'?new Promise(resolve=>{release=resolve;}):undefined);
 try{await h.mount('Notes');await h.input(h.label('笔记正文'),'已提交文本');await h.click(h.button('保存笔记'));await h.show('Inbox');await h.show('Notes');await h.input(h.label('笔记正文'),'返回后的新草稿');await h.action(()=>release());assert.equal(h.get(id).description,'已提交文本');assert.equal(h.label('笔记正文').value,'返回后的新草稿');await h.show('Inbox');await h.show('Notes');assert.equal(h.label('笔记正文').value,'返回后的新草稿');
 }finally{await h.close();}
});

test('recurring reminder editors follow each next occurrence and preserve task completion recurrence',async()=>{
 const h=await harness(),id=h.add('重复附带提醒',null),rule={mode:'calendar',unit:'day',interval:1,anchor:'2026-11-02',weekdays:[],until:null},completion={...rule,mode:'completion',interval:3};
 h.execute({type:'recurrence.set',payload:{id,rule:completion}});h.execute({type:'reminder.schedule',payload:{id,at:h.service.snapshot().now,rule}});h.service.tick();
 try{await h.mount('Reminders');assert.equal(h.label('提醒时间').value,'2026-11-02T10:00');await h.click(h.button('确认本次',h.label('重复附带提醒的提醒')));assert.equal(h.label('提醒时间').value,'2026-11-03T10:00');assert.deepEqual(h.get(id).recurrence,completion);await h.input(h.label('提醒时间'),'2026-11-04T08:00');await h.click(h.button('保存提醒安排'));assert.deepEqual(h.get(id).recurrence,completion);assert.equal(h.get(id).reminderRecurrence.anchor,'2026-11-04');assert.equal(h.get(id).reminderRecurrence.mode,'calendar');assert.equal(h.get(id).status,'open');
 }finally{await h.close();}
});

test('standalone reminder schedules advance without resurrecting an old editor draft',async()=>{
 const h=await harness(),rule={mode:'calendar',unit:'day',interval:1,anchor:'2026-11-02',weekdays:[],until:null};h.execute({type:'reminder.create',payload:{title:'每日提醒',parentId:null,at:h.service.snapshot().now,rule}});h.service.tick();
 try{await h.mount('Reminders');await h.click(h.button('确认本次',h.label('每日提醒的提醒')));assert.equal(h.label('提醒时间').value,'2026-11-03T10:00');await h.show('Inbox');await h.show('Reminders');assert.equal(h.label('提醒时间').value,'2026-11-03T10:00');await h.input(h.label('提醒说明'),'未保存的提醒草稿');const id=h.service.snapshot().state.tasks.find(t=>t.title==='每日提醒').id;h.execute({type:'reminder.update',payload:{id,title:'改名后的提醒',at:new Date('2026-11-05T10:00').toISOString(),rule:{...rule,anchor:'2026-11-05'}}});await h.refresh();assert.equal(h.label('提醒名称').value,'改名后的提醒');assert.equal(h.label('提醒时间').value,'2026-11-05T10:00');assert.equal(h.label('提醒说明').value,'未保存的提醒草稿');
 }finally{await h.close();}
});

test('event recurrence anchors use the local date across the UTC midnight boundary',async()=>{
 const previousZone=process.env.TZ;process.env.TZ='Asia/Shanghai';const h=await harness();try{const instant=new Date('2026-11-03T00:30:00').toISOString(),rule={mode:'calendar',unit:'day',interval:1,anchor:'2026-11-01',weekdays:[],until:null};assert.equal(instant.slice(0,10),'2026-11-02');assert.equal(h.components.normalizeReminderRule(rule,instant).anchor,'2026-11-03');assert.equal(h.components.normalizeReminderRule(rule,'2026-11-03').anchor,'2026-11-03');}finally{await h.close();if(previousZone===undefined)delete process.env.TZ;else process.env.TZ=previousZone;}
});

test('editing an advanced monthly reminder preserves its original calendar anchor',async()=>{
 const h=await harness(),rule={mode:'calendar',unit:'month',interval:1,anchor:'2026-01-31',weekdays:[],until:null},id=h.execute({type:'reminder.create',payload:{title:'每月月底',parentId:null,at:new Date('2026-11-30T09:00').toISOString(),rule}}).state.tasks.at(-1).id;
 try{await h.mount('Reminders');await h.input(h.label('提醒名称'),'月底复查');await h.click(h.button('保存提醒'));assert.equal(h.get(id).recurrence.anchor,'2026-01-31');h.clock.time=Date.parse('2026-11-30T09:00');h.service.tick();h.execute({type:'item-reminder.dismiss',payload:{id}});await h.refresh();assert.equal(h.label('提醒时间').value,'2026-12-31T09:00');assert.equal(h.get(id).status,'open');}finally{await h.close();}
});

test('each module restores its unfinished creation form and scope when returning',async()=>{
 const h=await harness(),g=h.group('MDE'),other=h.group('其他');try{
 await h.mount('Notes');await h.scope(g);await h.click(h.button('新增笔记'));await h.input(h.label('笔记名称'),'未完成笔记');await h.input(h.label('笔记正文'),'未完成正文');await h.scope(other);assert.equal(document.querySelector('form[aria-label="新增笔记"]'),null);await h.scope(g);assert.equal(h.label('笔记名称').value,'未完成笔记');
 await h.show('Reminders');await h.action(()=>window.dispatchEvent(new CustomEvent('journal:new-item')));await h.input(h.label('提醒名称'),'未完成提醒');await h.input(h.label('提醒时间'),'2026-11-04T09:00');await h.show('Inbox');await h.click(h.button('记录到收件箱'));await h.input(h.label('捕获内容名称'),'未完成捕获');await h.show('Notes');assert.equal(h.label('笔记名称').value,'未完成笔记');assert.equal(h.label('笔记正文').value,'未完成正文');await h.show('Reminders');assert.equal(h.label('提醒名称').value,'未完成提醒');assert.equal(h.label('提醒时间').value,'2026-11-04T09:00');await h.show('Inbox');assert.equal(h.label('捕获内容名称').value,'未完成捕获');
 }finally{await h.close();}
});

test('a late creation result clears its saved form but preserves a newer creation draft',async()=>{
 const h=await harness();let release;h.intercept(command=>command.type==='capture.create'?new Promise(resolve=>{release=resolve;}):undefined);
 try{await h.mount('Notes');await h.click(h.button('新增笔记'));await h.input(h.label('笔记名称'),'后台完成笔记');await h.click(h.button('保存笔记'));await h.show('Inbox');await h.action(()=>release());await h.show('Notes');assert.equal(document.querySelector('form[aria-label="新增笔记"]'),null);assert.equal(h.label('笔记名称').value,'后台完成笔记');
 await h.click(h.button('新增笔记'));await h.input(h.label('笔记名称'),'第二次提交');await h.click(h.button('保存笔记'));await h.show('Inbox');await h.show('Notes');await h.input(h.label('笔记名称'),'更晚的新草稿');await h.action(()=>release());assert.ok(document.querySelector('form[aria-label="新增笔记"]'));assert.equal(h.label('笔记名称').value,'更晚的新草稿');assert.equal(h.service.snapshot().state.tasks.filter(t=>t.title==='第二次提交').length,1);
 }finally{await h.close();}
});

test('secondary note and reminder actions retain existing deletion confirmation and conversion guards',async()=>{
 const h=await harness(),id=h.add('有任务关联的笔记',null,'note','保留正文'),task=h.add('关联任务',null);h.execute({type:'note.link-task',payload:{id,taskId:task}});
 try{await h.mount('Notes');await h.input(h.label('笔记正文'),'保留草稿');await h.click(h.button('笔记更多操作'));assert.equal(h.button('转为任务').disabled,true);assert.equal(h.button('转为任务').title,'先保存笔记再转换');await h.click(h.button('笔记更多操作'));await h.click(h.button('保存笔记'));await h.click(h.button('笔记更多操作'));await h.click(h.button('转为任务'));assert.equal(h.get(id).itemType,'note');assert.equal(h.label('笔记正文').value,'保留草稿');assert.match(h.query('[role="alert"]').textContent,/关联/);await h.click(h.button('笔记更多操作'));await h.click(h.button('移入回收站'));assert.deepEqual(h.dialogs.at(-1),{type:'state',id,action:'delete'});assert.equal(h.get(id).deletedAt,null);
 const reminder=h.execute({type:'reminder.create',payload:{title:'次要删除提醒',parentId:null,at:new Date('2026-11-04T09:00').toISOString(),rule:null}}).state.tasks.at(-1).id;await h.refresh();await h.show('Reminders');await h.click(h.button('提醒更多操作'));await h.click(h.button('移入回收站'));assert.deepEqual(h.dialogs.at(-1),{type:'state',id:reminder,action:'delete'});assert.equal(h.get(reminder).deletedAt,null);
 }finally{await h.close();}
});

test('rapid navigation snapshots the actual note caret before a delayed selection event',async()=>{
 const h=await harness(),id=h.add('快速返回笔记',null,'note','保存后的笔记正文');try{await h.mount('Notes');await h.input(h.label('笔记正文'),'更新后保存的笔记正文');await h.click(h.button('保存笔记'));await h.action(()=>{const body=h.label('笔记正文');body.focus();body.setSelectionRange(4,7);body.scrollTop=60;});await h.show('Reminders');await h.show('Notes');assert.equal(h.label('笔记正文').selectionStart,4);assert.equal(h.label('笔记正文').selectionEnd,7);assert.equal(h.label('笔记正文').scrollTop,60);assert.equal(h.label('笔记正文').value,'更新后保存的笔记正文');assert.equal(h.get(id).description,'更新后保存的笔记正文');}finally{await h.close();}
});

test('continue writing after task generation restores the note caret, focus and enclosing reading position',async()=>{
 const h=await harness(),id=h.add('接着写的笔记',null,'note','原始笔记正文');try{await h.mount('Notes');await h.input(h.label('笔记正文'),'正在编辑的笔记正文');const body=h.label('笔记正文'),pane=h.query('.content-detail-pane');await h.action(()=>{body.focus();body.setSelectionRange(3,5);body.scrollTop=55;pane.scrollTop=90;});await h.click([...pane.querySelectorAll('.content-note-actions button')].find(button=>button.textContent.endsWith('生成任务')));await h.input(h.label('生成任务名称'),'从资料产生的下一步');await h.action(()=>{pane.scrollTop=420;});await h.click(h.button('生成任务',h.label('从笔记生成任务')));await h.click(h.button('继续写笔记'));assert.equal(document.activeElement,body);assert.equal(body.selectionStart,3);assert.equal(body.selectionEnd,5);assert.equal(pane.scrollTop,90);assert.equal(body.scrollTop,55);assert.equal(body.value,'正在编辑的笔记正文');assert.equal(h.get(id).description,'原始笔记正文');assert.equal(h.service.snapshot().state.tasks.filter(t=>t.title==='从资料产生的下一步').length,1);}finally{await h.close();}
});
test('new note and reminder select the records from their own command receipt',async()=>{
 const h=await harness();try{
  await h.mount('Notes');await h.click(h.button('新增笔记'));await h.input(h.label('笔记名称'),'我的笔记');
  h.intercept(c=>{if(c.type==='capture.create'){h.intercept(null);h.add('并发笔记',null,'note','外部内容');}});
  await h.click(h.button('保存笔记'));assert.equal(h.label('笔记名称').value,'我的笔记');
  await h.show('Reminders');await h.click(h.button('新增提醒'));await h.input(h.label('提醒名称'),'我的提醒');await h.input(h.label('提醒时间'),'2026-11-03T09:00');
  h.intercept(c=>{if(c.type==='reminder.create'){h.intercept(null);h.execute({type:'reminder.create',payload:{title:'并发提醒',parentId:null,at:'2026-11-03T08:00:00.000Z',rule:null}});}});
  await h.click(h.button('保存提醒'));assert.equal(h.label('提醒名称').value,'我的提醒');
 }finally{await h.close();}
});
