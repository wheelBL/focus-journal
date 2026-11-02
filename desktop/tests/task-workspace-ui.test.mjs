import {test} from 'node:test';
import assert from 'node:assert/strict';
import {appDom} from './app-dom.mjs';

test('task workspace projects legacy mixed branches and previews related notes without losing work',async()=>{
 const h=await appDom(),{add,get,service,mount,click,key,input,label,query,button,action}=h;
 const typed=(title,parent,extra={})=>{const id=service.execute({type:'outline.create',payload:{title,parentId:parent,kind:extra.itemType??'task'}}).state.tasks.at(-1).id;if(extra.description)service.execute({type:'outline.patch',payload:{id,field:'description',value:extra.description}});return id;};
 const group=typed('MDE',null,{itemType:'group'}),other=typed('Other',null,{itemType:'group'}),task=add('执行任务',group),note=typed('相关资料',task,{itemType:'note',description:'保留笔记内容'}),deepNote=typed('旧信息父级',group,{itemType:'note'}),deepEvent=typed('旧事件父级',deepNote,{itemType:'event',eventAt:'2026-10-20T10:00:00.000Z'}),deepTask=add('跨类型深层任务',deepEvent),otherTask=add('另一范围任务',other);
 const reminder=add('独立纯提醒',group);service.execute({type:'reminder.convert',payload:{id:reminder,rule:null,at:'2026-10-20T10:00:00.000Z'}});
 const row=id=>query(`[data-outline-id="${id}"]`),groups=()=>query('[aria-label="共享分组"]');
 try{
  await mount();await click(label('任务'));assert.ok(row(deepTask));for(const id of [note,deepNote,deepEvent])assert.equal(document.querySelector(`[data-outline-id="${id}"]`),null);assert.match(row(deepTask).textContent,/MDE.*旧信息父级.*旧事件父级.*跨类型深层任务/);assert.equal(get(deepTask).parentId,deepEvent);await click(row(deepTask));await key(row(deepTask),'ArrowLeft');assert.equal(row(group).getAttribute('aria-selected'),'true');assert.equal(get(deepTask).parentId,deepEvent);
  await click(button('MDE',groups()));assert.equal(document.querySelector(`[data-outline-id="${otherTask}"]`),null);assert.match(query('.tree-page-header').textContent,/MDE/);
  await click(row(task));await click(label('开始执行任务'));const timerId=service.snapshot().timers.find(t=>t.taskId===task).sessionId;
  const scroll=query('.outline-scroll');await action(()=>{scroll.scrollTop=135;scroll.dispatchEvent(new Event('scroll',{bubbles:true}));});
  await click(query('.inspector-related .related-content-link'));
  assert.ok(query('[aria-label="关联内容详情"]'));assert.equal(label('笔记正文').value,'保留笔记内容');assert.equal(scroll.scrollTop,135);assert.equal(service.snapshot().timers.find(t=>t.taskId===task).sessionId,timerId);
  await click(button('← 返回原内容',query('[aria-label="关联内容详情"]')));assert.equal(document.querySelector('[aria-label="关联内容详情"]'),null);assert.equal(row(task).getAttribute('aria-selected'),'true');assert.equal(scroll.scrollTop,135);
  await click(button('新增事项'));await input(label('新事项名称'),'当前分组新任务');await key(label('新事项名称'),'Enter',{ctrlKey:true});assert.equal(service.snapshot().state.tasks.at(-1).parentId,group);
  await click(label('折叠MDE'));await click(button('Other',groups()));await click(button('MDE',groups()));assert.equal(document.querySelector(`[data-outline-id="${task}"]`),null);assert.ok(label('展开MDE'));await click(label('展开MDE'));
 }finally{await h.close();}
});

test('a group containing only information offers scoped task creation and explicit range clearing',async()=>{
 const h=await appDom(),{add,service,mount,click,key,input,label,query,button}=h;
 const group=service.execute({type:'outline.create',payload:{title:'资料分组',kind:'group',parentId:null}}).state.tasks.at(-1).id,note=service.execute({type:'outline.create',payload:{title:'只有笔记',kind:'note',parentId:group}}).state.tasks.at(-1).id,other=add('范围之外');
 try{
  await mount();await click(label('任务'));await click(button('资料分组',query('[aria-label="共享分组"]')));assert.match(query('.tree-empty').textContent,/没有符合条件的事项/);assert.ok(button('在此新增任务'));assert.ok(button('查看全部分组'));assert.equal(document.querySelector(`[data-outline-id="${note}"]`),null);assert.equal(document.querySelector(`[data-outline-id="${other}"]`),null);
  await click(button('在此新增任务'));await input(label('新事项名称'),'分组首个任务');await key(label('新事项名称'),'Enter',{ctrlKey:true});assert.equal(service.snapshot().state.tasks.at(-1).parentId,group);assert.equal(service.snapshot().state.tasks.find(t=>t.id===note).itemType,'note');
 }finally{await h.close();}
});

test('related note generation preserves source, creates linked group task and keeps failed draft',async()=>{
 const h=await appDom(),{add,get,service,mount,click,input,label,query,button}=h;
 const typed=(title,parent,extra={})=>{const id=service.execute({type:'outline.create',payload:{title,parentId:parent,kind:extra.itemType??'task'}}).state.tasks.at(-1).id;if(extra.description)service.execute({type:'outline.patch',payload:{id,field:'description',value:extra.description}});return id;};
 const group=typed('笔记分组',null,{itemType:'group'}),task=add('源任务',group),note=typed('源笔记',task,{itemType:'note',description:'原文继续保留'});
 try{await mount();await click(label('任务'));await click(query(`[data-outline-id="${task}"]`));await click(query('.inspector-related .related-content-link'));await click(button('生成任务',query('.content-note-actions')));await input(label('生成任务名称'),'提取后的任务');assert.equal(label('生成任务所属分组').value,group);
  const execute=window.journal.command;let fail=true;window.journal.command=async command=>{if(command.type==='note.create-task'&&fail){fail=false;throw Error('模拟保存失败');}return execute(command);};
  await click(button('生成任务',query('[aria-label="从笔记生成任务"]')));assert.equal(label('生成任务名称').value,'提取后的任务');assert.match(query('[aria-label="从笔记生成任务"]').textContent,/模拟保存失败/);assert.equal(service.snapshot().state.tasks.length,4);
  await click(button('返回笔记'));await click(button('生成任务',query('.content-note-actions')));assert.equal(label('生成任务名称').value,'提取后的任务');await click(button('生成任务',query('[aria-label="从笔记生成任务"]')));const created=service.snapshot().state.tasks.at(-1);assert.equal(created.title,'提取后的任务');assert.equal(created.parentId,group);assert.equal(get(note).description,'原文继续保留');assert.ok(get(note).relatedTaskIds.includes(created.id));assert.ok(button('继续写笔记'));assert.equal(document.querySelector('dialog[aria-label="从笔记生成任务"]'),null);assert.equal(query(`[data-outline-id="${task}"]`).getAttribute('aria-selected'),'true');assert.equal(query(`[data-outline-id="${created.id}"]`).getAttribute('aria-selected'),'false');await click(button('继续写笔记'));await click(button('生成任务',query('.content-note-actions')));assert.equal(label('生成任务名称').value,'');
 }finally{await h.close();}
});

test('group detail shows separate content counts and previews each type without leaving task scope',async()=>{
 const h=await appDom(),{add,service,mount,click,label,query,button}=h;
 const group=service.execute({type:'outline.create',payload:{title:'分组概况',kind:'group',parentId:null}}).state.tasks.at(-1).id,task=add('组内工作',group),note=service.execute({type:'outline.create',payload:{title:'组内资料',kind:'note',parentId:group}}).state.tasks.at(-1).id;
 service.execute({type:'reminder.create',payload:{title:'组内提醒',parentId:group,at:'2026-10-22T10:00:00.000Z',rule:null}});service.execute({type:'reminder.schedule',payload:{id:task,at:'2026-10-22T10:00:00.000Z',rule:null}});
 try{
  await mount();await click(label('任务'));await click(query(`[data-outline-id="${group}"]`));const summary=query('[aria-label="分组内容概况"]');assert.match(summary.textContent,/任务\s*1/);assert.match(summary.textContent,/笔记\s*1/);assert.match(summary.textContent,/提醒\s*2/);
  await click(label('查看笔记 组内资料',summary));assert.equal(label('笔记名称').value,'组内资料');assert.equal(label('任务').getAttribute('aria-current'),'page');await click(button('← 返回原内容'));assert.ok(query('[aria-label="分组内容概况"]'));
  await click(label('查看提醒 组内提醒'));assert.match(query('[aria-label="关联内容详情"]').textContent,/提醒/);await click(button('← 返回原内容'));assert.equal(query(`[data-outline-id="${group}"]`).getAttribute('aria-selected'),'true');
  await click(button('查看此分组全部笔记'));assert.equal(label('笔记').getAttribute('aria-current'),'page');assert.match(query('.content-scope').textContent,/分组概况/);assert.equal(label('笔记名称').value,'组内资料');
 }finally{await h.close();}
});

test('task scope restores selection, collapse and scroll after other scope and module visits',async()=>{
 const h=await appDom(),{add,service,mount,click,label,query,button,action}=h;
 const group=title=>service.execute({type:'outline.create',payload:{title,kind:'group',parentId:null}}).state.tasks.at(-1).id;
 const a=group('分组 A'),b=group('分组 B'),a1=add('A1',a),a2=add('A2',a),b1=add('B1',b),b2=add('B2',b),groups=()=>query('[aria-label="共享分组"]'),row=id=>query(`[data-outline-id="${id}"]`),scroll=()=>query('.outline-scroll');
 const position=top=>action(()=>{scroll().scrollTop=top;scroll().dispatchEvent(new Event('scroll',{bubbles:true}));});
 try{
  await mount();await click(label('任务'));await click(button('分组 A',groups()));await click(row(a2));await position(115);await click(label('折叠分组 A'));
  await click(button('分组 B',groups()));assert.equal(scroll().scrollTop,0);await click(row(b2));await position(225);await click(label('折叠分组 B'));
  await click(button('分组 A',groups()));assert.equal(scroll().scrollTop,115);assert.ok(label('展开分组 A'));assert.ok(label('详情名称：A2'));assert.equal(document.querySelector(`[data-outline-id="${a1}"]`),null);
  await click(label('笔记'));await click(button('分组 B',groups()));await click(label('任务'));assert.equal(scroll().scrollTop,225);assert.ok(label('展开分组 B'));assert.ok(label('详情名称：B2'));assert.equal(document.querySelector(`[data-outline-id="${b1}"]`),null);
  await click(button('可执行',query('[aria-label="事项视图"]')));assert.equal(scroll().scrollTop,0);await click(row(b1));await position(45);await click(button('全部任务',query('[aria-label="事项视图"]')));assert.equal(scroll().scrollTop,225);assert.ok(label('展开分组 B'));assert.ok(label('详情名称：B2'));
 }finally{await h.close();}
});

test('related detail Back preserves note draft, caret and reading position while task keeps timing',async()=>{
 const h=await appDom(),{add,get,service,mount,click,input,key,label,query,button,action}=h;
 const task=add('继续工作'),note=service.execute({type:'outline.create',payload:{title:'工作参考',kind:'note',parentId:task}}).state.tasks.at(-1).id;
 service.execute({type:'outline.patch',payload:{id:note,field:'description',value:'保存的正文'}});service.execute({type:'focus.start',payload:{taskId:task,skipEstimate:true}});
 const timer=service.snapshot().timers[0].sessionId;
 try{
  await mount();await click(label('任务'));await click(query(`[data-outline-id="${task}"]`));await click(query('.inspector-related .related-content-link'));
  await input(label('笔记正文'),'未保存的参考正文');const body=label('笔记正文');await action(()=>{body.focus();body.setSelectionRange(2,5);document.dispatchEvent(new Event('selectionchange',{bubbles:true}));body.scrollTop=70;body.dispatchEvent(new Event('scroll',{bubbles:true}));});
  await click(query('.content-related .task-link'));assert.equal(document.querySelectorAll('[aria-label="关联内容详情"]').length,1);const nested=[...document.querySelectorAll('[aria-label="关联内容详情"]')].at(-1);await key(nested,'ArrowLeft',{altKey:true});
  assert.equal(label('笔记正文').value,'未保存的参考正文');assert.equal(body.selectionStart,2);assert.equal(body.selectionEnd,5);assert.equal(body.scrollTop,70);assert.equal(get(note).description,'保存的正文');assert.equal(service.snapshot().timers[0].sessionId,timer);
  await key(body,'ArrowLeft',{altKey:true});assert.equal(document.querySelector('[aria-label="关联内容详情"]'),null);assert.equal(query(`[data-outline-id="${task}"]`).getAttribute('aria-selected'),'true');
  await click(label('笔记'));assert.equal(label('笔记正文').value,'未保存的参考正文');assert.equal(label('笔记正文').selectionStart,2);assert.equal(label('笔记正文').selectionEnd,5);assert.equal(label('笔记正文').scrollTop,70);assert.equal(service.snapshot().timers[0].sessionId,timer);
 }finally{await h.close();}
});

test('attached task reminder time and recurrence edit directly without changing task or timer',async()=>{
 const h=await appDom(),{add,get,service,mount,click,input,label,query,button}=h;
 const task=add('需要提醒的工作');service.execute({type:'reminder.schedule',payload:{id:task,at:'2026-10-20T10:00:00.000Z',rule:null}});service.execute({type:'focus.start',payload:{taskId:task,skipEstimate:true}});const timer=service.snapshot().timers[0].sessionId,count=service.snapshot().state.tasks.length;
 try{
  await mount();await click(label('任务'));await click(query(`[data-outline-id="${task}"]`));await click(label('编辑任务提醒'));assert.ok(query('form[aria-label="编辑提醒安排"]'));assert.equal(document.querySelector('dialog'),null);
  await input(label('提醒时间'),'2026-10-22T09:30');await click(label('重复提醒'));await click(button('保存提醒安排'));assert.equal(document.querySelector('form[aria-label="编辑提醒安排"]'),null);assert.equal(get(task).status,'open');assert.equal(get(task).reminder.at,new Date('2026-10-22T09:30').toISOString());assert.equal(get(task).reminderRecurrence.unit,'day');assert.equal(get(task).recurrence??null,null);assert.equal(service.snapshot().timers[0].sessionId,timer);assert.equal(service.snapshot().state.tasks.length,count);
 }finally{await h.close();}
});
