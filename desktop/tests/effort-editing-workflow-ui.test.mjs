import {test} from 'node:test';
import assert from 'node:assert/strict';
import {appDom} from './app-dom.mjs';

async function freeRecord(h){await h.mount();await h.click(h.button('先计时'));h.clock.advance(60000);await h.click(h.button('结束并补充事项'));return h.service.snapshot().state.sessions.at(-1);}
async function reopenAssignment(h){await h.click(h.query('.unassigned-queue summary'));await h.click(h.button('补充事项',h.query('.unassigned-queue')));}
const closeDialog=h=>h.click(h.label('关闭',h.query('dialog')));

test('postponed assignment retains its name, parent, mode, selection and rest choice without creating an item',async()=>{
 const h=await appDom();try{
  const parent=h.add('用于归属的项目',null),existing=h.add('需要关联的事项',parent),record=await freeRecord(h),count=h.service.snapshot().state.tasks.length;
  await h.input(h.label('这段时间做了什么'),'稍后再整理的名称');await h.input(h.label('新事项归属'),parent);await h.click(h.query('.assignment-rest-choice input'));
  await h.click(h.button('关联已有事项',h.query('dialog')));await h.input(h.label('查找已有事项'),'需要关联');await h.click(h.query('.assignment-candidates button'));
  await h.click(h.button('稍后补充'));assert.equal(h.service.snapshot().state.tasks.length,count);assert.equal(h.service.snapshot().state.sessions.find(s=>s.id===record.id).taskId,null);
  await h.click(h.label('日历'));await h.click(h.label('今日'));await reopenAssignment(h);
  assert.equal(h.label('查找已有事项').value,'需要关联');assert.equal(h.query('.assignment-candidates button').getAttribute('aria-pressed'),'true');assert.equal(h.query('.assignment-rest-choice input').checked,true);
  await h.click(h.button('新建事项',h.query('dialog')));assert.equal(h.label('这段时间做了什么').value,'稍后再整理的名称');assert.equal(h.label('新事项归属').value,parent);
  await h.click(h.button('关联已有事项',h.query('dialog')));await h.click(h.query('.assignment-rest-choice input'));await h.click(h.button('保存并关联'));
  assert.equal(h.service.snapshot().state.sessions.find(s=>s.id===record.id).taskId,existing);assert.equal(h.service.snapshot().state.tasks.length,count);assert.equal(document.querySelector('.unassigned-queue'),null);
 }finally{await h.close();}
});

test('assignment save failure and closing retain the full name and progress draft',async()=>{
 const h=await appDom();try{
  const record=await freeRecord(h);await h.input(h.label('这段时间做了什么'),'不会丢的名称');await h.input(h.query('dialog textarea'),'已经写下的成果');
  const real=window.journal.command;window.journal.command=async command=>{if(command.type==='session.assign')throw Error('写入失败');return real(command);};
  await h.click(h.button('保存并关联'));assert.match(h.query('dialog [role=alert]').textContent,/写入失败/);
  await closeDialog(h);assert.equal(h.service.snapshot().state.sessions.find(s=>s.id===record.id).summary,'已经写下的成果');await reopenAssignment(h);assert.equal(h.label('这段时间做了什么').value,'不会丢的名称');assert.equal(h.query('dialog textarea').value,'已经写下的成果');
  window.journal.command=real;await h.click(h.button('保存并关联'));assert.equal(h.service.snapshot().state.tasks.at(-1).title,'不会丢的名称');
 }finally{await h.close();}
});

test('correction starts in preserve mode; changing progress keeps paused segments and explicit time editing is available',async()=>{
 const h=await appDom();try{
  const id=h.add('包含暂停的投入');h.service.execute({type:'focus.start',payload:{taskId:id}});h.clock.advance(600000);h.service.execute({type:'focus.pause',payload:{taskId:id}});h.clock.advance(300000);h.service.execute({type:'focus.resume',payload:{taskId:id}});h.clock.advance(600000);h.service.execute({type:'focus.stop',payload:{taskId:id}});
  const original=h.service.snapshot().state.sessions[0];await h.mount();await h.click(h.button('校正',h.query('.session-entry')));
  assert.equal(h.button('保留原始时段').getAttribute('aria-pressed'),'true');assert.equal(document.querySelector('dialog input[type=datetime-local]'),null);assert.match(h.query('dialog').textContent,/2 段投入，已扣除暂停/);
  await h.input(h.label('这段时间的进展'),'补充结果');await h.input(h.label('校正原因'),'补写成果');await h.click(h.button('保存记录',h.query('dialog')));
  let record=h.service.snapshot().state.sessions[0];assert.deepEqual(record.segments,original.segments);assert.equal(record.durationMs,original.durationMs);assert.equal(record.start,original.start);assert.equal(record.manual,false);assert.equal(record.summary,'补充结果');
  await h.click(h.button('校正',h.query('.session-entry')));await h.click(h.button('修改日期和时长'));assert.match(h.query('dialog').textContent,/时间未指定/);await h.input(h.label('实际投入（分钟）'),'18');assert.match(h.query('.manual-duration-preview').textContent,/将记录 18 分钟/);await h.input(h.label('校正原因'),'明确扣除遗漏休息');await h.click(h.button('保存记录',h.query('dialog')));
  record=h.service.snapshot().state.sessions[0];assert.equal(record.durationMs,18*60000);assert.deepEqual(record.segments,[]);
 }finally{await h.close();}
});

test('manual entry does not guess Inbox without context and searches item paths without losing a selection',async()=>{
 const h=await appDom();try{
  const parent=h.add('查找路径',null);for(let i=0;i<48;i++)h.add(`备选工作 ${i}`);const target=h.add('准确归属',parent),backup=JSON.parse(h.service.exportJson());backup.state.settings.selectedTaskId=null;h.service.importJson(JSON.stringify(backup));
  await h.mount();await h.click(h.button('补记时间'));const picker=h.label('这段时间推进了哪个任务');assert.equal(picker.value,'');assert.equal(h.button('保存记录',h.query('dialog')).disabled,true);
  await h.input(h.label('查找补记事项'),'查找路径');assert.ok([...picker.options].some(option=>option.value===target));await h.input(picker,target);await h.input(h.label('查找补记事项'),'不存在的搜索');assert.equal(picker.value,target);
  await h.input(h.label('实际开始'),'2026-10-19T09:00');await h.input(h.label('实际结束'),'2026-10-19T09:40');assert.match(h.query('.manual-duration-preview').textContent,/将记录 40 分钟/);
  await h.click(h.button('保存记录',h.query('dialog')));assert.equal(h.service.snapshot().state.sessions[0].taskId,target);assert.equal(h.service.snapshot().state.sessions[0].durationMs,40*60000);
 }finally{await h.close();}
});

test('a zero-second ended record can still be corrected without inventing time',async()=>{
 const h=await appDom();try{
  const taskId=h.add('零时长成果');h.service.execute({type:'focus.start',payload:{taskId}});h.service.execute({type:'focus.stop',payload:{taskId}});const original=h.service.snapshot().state.sessions[0];assert.equal(original.durationMs,0);
  await h.mount();await h.click(h.label('事项'));await h.click(h.query(`[data-outline-id="${taskId}"]`));await h.click(h.query('[data-inspector-tab="records"]'));await h.click(h.button('校正',h.query('.task-inspector')));await h.input(h.label('这段时间的进展'),'只补充记录说明');await h.input(h.label('校正原因'),'补写说明');assert.equal(h.button('保存记录',h.query('dialog')).disabled,false);await h.click(h.button('保存记录',h.query('dialog')));
  const saved=h.service.snapshot().state.sessions[0];assert.equal(document.querySelector('dialog'),null);assert.equal(saved.summary,'只补充记录说明');assert.equal(saved.durationMs,0);assert.deepEqual(saved.segments,original.segments);
 }finally{await h.close();}
});

test('summary and assignment explain why parallel timers prevent rest; save-and-rest is explicit and atomic',async()=>{
 const h=await appDom();try{
  const first=h.add('先结束的事项'),other=h.add('仍在推进的事项');h.service.execute({type:'focus.start',payload:{taskId:first}});h.service.execute({type:'focus.start',payload:{taskId:other}});h.clock.advance(60000);
  await h.mount();await h.click(h.button('结束本次',h.query('.today-timer')));assert.equal(h.button('保存并休息 5 分钟',h.query('dialog')).disabled,true);assert.match(h.query('dialog [role=status]').textContent,/还有 1 个计时器在运行/);
  await h.command({type:'focus.pause',payload:{taskId:other}});await h.input(h.label('本次推进了什么'),'保存后去休息');await h.click(h.button('保存并休息 5 分钟',h.query('dialog')));
  assert.equal(h.service.snapshot().state.sessions.find(session=>session.taskId===first).summary,'保存后去休息');assert.equal(h.service.snapshot().state.settings.rest.phase,'running');assert.equal(h.service.snapshot().timers[0].paused,true);
  await h.click(h.button('先计时'));h.clock.advance(60000);await h.command({type:'focus.resume',payload:{taskId:other}});await h.click(h.button('结束并补充事项'));
  assert.equal(h.query('.assignment-rest-choice input').disabled,true);assert.match(h.query('dialog [role=status]').textContent,/还有 1 个计时器在运行/);
 }finally{await h.close();}
});
