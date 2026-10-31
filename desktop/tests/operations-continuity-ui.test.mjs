import {test} from 'node:test';
import assert from 'node:assert/strict';
import {appDom} from './app-dom.mjs';

const category=(h,name)=>h.click(h.button(name,h.label('设置分区')));
const syncStatus=(repository='https://gitcode.com/test/confirmed.git')=>({phase:'idle',config:{repository,username:'tester',branch:'focus-journal',hasToken:true},lastSuccess:null,message:'已读取连接'});

test('search preserves settings draft identity, scroll, focus and a pending save completion',async()=>{
 const h=await appDom();let finish;try{
  await h.mount();await h.click(h.label('设置'));await category(h,'专注与休息');const focus=h.query('#settings-focus input');await h.input(focus,'45');await category(h,'到时提醒');const volume=h.label('提醒音量');await h.input(volume,'65');
  const real=window.journal.command;window.journal.command=command=>command.type==='reminder.settings'?new Promise(resolve=>{finish=()=>resolve(real(command));}):real(command);
  await h.click(h.button('保存提醒设置'));await category(h,'专注与休息');await h.action(()=>{focus.focus();h.query('#main-content').scrollTop=180;});await h.key(focus,'k',{ctrlKey:true});await h.input(h.label('搜索任务和笔记'),'查一下');
  assert.equal(h.query('.workspace-screen').hidden,true);assert.equal(h.query('.workspace-screen').hasAttribute('inert'),true);assert.equal(h.query('#workspace-sidebar').hidden,true);await h.action(()=>finish());
  await h.key(h.label('搜索任务和笔记'),'Escape');assert.equal(h.query('#settings-focus input'),focus);assert.equal(focus.value,'45');assert.equal(h.query('#main-content').scrollTop,180);assert.equal(document.activeElement,focus);await category(h,'到时提醒');assert.equal(h.label('提醒音量'),volume);assert.equal(volume.matches(':disabled'),false);assert.equal(h.service.snapshot().state.settings.reminders.volume,65);
 }finally{await h.close();}
});

test('search returns to the same review period and filters and hides its sidebar navigation',async()=>{
 const h=await appDom();try{
  await h.mount();await h.click(h.label('回顾'));await h.click(h.button('投入复盘',h.label('回顾方式侧栏')));await h.input(h.label('回顾开始日期'),'2026-09-01');await h.input(h.label('回顾事项名称'),'季度');const field=h.label('回顾事项名称');
  await h.input(h.label('搜索任务和笔记'),'临时查询');assert.ok(h.label('回顾方式侧栏').closest('[hidden]'));await h.click(h.label('关闭搜索'));assert.equal(h.label('回顾事项名称'),field);assert.equal(field.value,'季度');assert.equal(h.label('回顾开始日期').value,'2026-09-01');
 }finally{await h.close();}
});

test('sync loading protects inputs and ignores an old status after a newer event without replacing dirty drafts',async()=>{
 const h=await appDom(),reads=[],listeners=new Set();try{
  window.journal.sync={status:()=>new Promise(resolve=>reads.push(resolve)),onChanged:listener=>{listeners.add(listener);return()=>listeners.delete(listener);}};
  await h.mount();await h.click(h.label('一键同步'));assert.equal(h.label('GitCode 仓库地址').matches(':disabled'),true);assert.match(h.query('#settings-sync').textContent,/正在读取同步设置/);
  const newer=syncStatus('https://gitcode.com/test/new.git');await h.action(()=>listeners.forEach(listener=>listener(newer)));await h.input(h.label('GitCode 仓库地址'),'https://gitcode.com/test/draft.git');await h.input(h.label('GitCode 访问令牌'),'synthetic-draft');
  await h.action(()=>reads.forEach(resolve=>resolve(syncStatus())));assert.equal(h.label('GitCode 仓库地址').value,'https://gitcode.com/test/draft.git');assert.equal(h.label('GitCode 访问令牌').value,'synthetic-draft');assert.equal(h.button('立即同步').disabled,true);
  await h.action(()=>listeners.forEach(listener=>listener(syncStatus('https://gitcode.com/test/external.git'))));assert.equal(h.label('GitCode 仓库地址').value,'https://gitcode.com/test/draft.git');assert.equal(h.label('GitCode 访问令牌').value,'synthetic-draft');
 }finally{await h.close();}
});

test('sync initial failure is visible and retryable and API help opens the actual sync category',async()=>{
 const h=await appDom();let fail=true;try{
  window.journal.sync={status:async()=>{if(fail)throw Error('连接状态暂不可读');return syncStatus();},onChanged:()=>()=>{}};
  window.journal.localApi={status:async()=>({enabled:false,port:17642,access:'read',running:false,baseUrl:null,hasToken:false,error:null})};
  await h.mount();await h.click(h.label('设置'));await category(h,'本机控制 API');await h.click(h.button('打开同步设置'));assert.equal(h.query('#settings-category-sync').hidden,false);assert.match(h.query('#settings-sync [role=alert]').textContent,/连接状态暂不可读/);assert.equal(h.label('GitCode 仓库地址').matches(':disabled'),true);
  fail=false;await h.click(h.button('重试读取同步设置'));assert.equal(h.label('GitCode 仓库地址').value,syncStatus().config.repository);assert.equal(h.label('GitCode 仓库地址').matches(':disabled'),false);assert.equal(document.querySelector('#settings-sync [role=alert]'),null);
 }finally{await h.close();}
});

test('event edits lock all time controls while saving, retain failures and show successful retry',async()=>{
 const h=await appDom();let reject,finish;try{
  const id=h.add('o 周会');h.service.execute({type:'event.save',payload:{id,at:'2026-10-19T09:00:00+08:00',end:'2026-10-19T10:00:00+08:00'}});await h.mount();await h.click(h.label('日历'));await h.click(h.query(`[data-calendar-kind="event"][data-item-id="${id}"]`));
  const real=window.journal.command;window.journal.command=command=>command.type==='event.save'?new Promise((resolve,no)=>{reject=no;finish=()=>resolve(real(command));}):real(command);
  await h.input(h.label('事件日期或开始时刻'),'2026-10-19T11:00');await h.input(h.label('事件结束时刻'),'2026-10-19T12:00');await h.click(h.button('保存事件时间'));
  for(const control of [h.label('事件日期或开始时刻'),h.label('事件结束时刻'),h.button('只记录日期')])assert.equal(control.matches(':disabled'),true);
  await h.action(()=>reject(Error('磁盘暂不可写')));assert.equal(h.label('事件日期或开始时刻').value,'2026-10-19T11:00');assert.match(h.query('.event-information [role=alert]').textContent,/磁盘暂不可写/);
  await h.click(h.button('保存事件时间'));await h.action(()=>finish());assert.match(h.query('.event-information [role=status]').textContent,/事件时间已保存/);assert.equal(h.get(id).eventAt,new Date('2026-10-19T11:00').toISOString());
 }finally{await h.close();}
});

test('calendar creation shares modes without losing title or time and saves semantic ownership and estimates atomically',async()=>{
 const h=await appDom();try{
  const parent=h.add('工作项目');await h.mount();await h.click(h.label('日历'));await h.click(h.button('添加提醒'));assert.ok(h.label('添加内容'));
  await h.input(h.label('事项名称'),'写报告 #工作项目 %工作 明天开始 周五截止 估计50分钟');await h.input(h.label('提醒时间'),'2026-10-20T10:00');await h.click(h.button('添加事件保留一段安排'));assert.match(h.label('事件名称').value,/写报告/);await h.input(h.label('事件结束'),'2026-10-20T11:00');await h.click(h.button('补记投入已经做过的事'));assert.equal(h.label('实际开始').value,'2026-10-20T10:00');assert.equal(h.label('实际结束').value,'2026-10-20T11:00');await h.click(h.button('设置提醒到时提醒我'));assert.equal(h.label('提醒时间').value,'2026-10-20T10:00');
  await h.click(h.button('保存提醒'));assert.equal(document.querySelector('dialog[open]'),null);const task=h.service.snapshot().state.tasks.at(-1);assert.equal(task.title,'写报告');assert.equal(task.parentId,parent);assert.equal(task.estimateMinutes,50);assert.equal(task.plannedDate,'2026-10-20');assert.equal(task.dueAt,'2026-10-23');assert.equal(h.service.snapshot().state.tags.find(tag=>task.tagIds.includes(tag.id)).name,'工作');assert.equal(h.service.snapshot().state.sessions.length,0);
 }finally{await h.close();}
});

test('calendar reminder keeps save-and-start and a chosen parent without losing the future reminder',async()=>{
 const h=await appDom();try{
  const parent=h.add('普通归属');await h.mount();await h.click(h.label('日历'));await h.click(h.button('添加提醒'));await h.input(h.label('事项名称'),'现在开工');await h.input(h.label('放在何处'),parent);await h.input(h.label('提醒时间'),'2026-10-20T10:00');await h.click(h.button('保存并开始'));
  const state=h.service.snapshot(),task=state.state.tasks.at(-1);assert.equal(task.parentId,parent);assert.equal(state.timers[0].taskId,task.id);assert.equal(task.reminder.at,new Date('2026-10-20T10:00').toISOString());
 }finally{await h.close();}
});

test('semantic reminder time, manual correction and preview all agree with the saved calendar time',async()=>{
 const h=await appDom();try{
  await h.mount();await h.click(h.label('日历'));await h.click(h.button('添加提醒'));await h.input(h.label('事项名称'),'提交材料 明天16:00提醒');assert.equal(h.label('提醒时间').value,'2026-10-20T16:00');assert.match(h.query('.capture-preview').textContent,/2026-10-20 16:00/);
  await h.input(h.label('提醒时间'),'2026-10-20T17:30');assert.match(h.query('.capture-preview').textContent,/2026-10-20 17:30/);await h.click(h.button('添加事件保留一段安排'));await h.input(h.label('事件结束'),'2026-10-20T18:00');await h.click(h.button('设置提醒到时提醒我'));assert.equal(h.label('提醒时间').value,'2026-10-20T17:30');
  await h.click(h.button('保存提醒'));const task=h.service.snapshot().state.tasks.at(-1);assert.equal(task.title,'提交材料');assert.equal(task.reminder.at,new Date('2026-10-20T17:30').toISOString());
 }finally{await h.close();}
});
