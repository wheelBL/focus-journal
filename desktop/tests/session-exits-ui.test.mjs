import {test} from 'node:test';
import assert from 'node:assert/strict';
import {appDom} from './app-dom.mjs';

async function freeSession(h){
 await h.mount();await h.click(h.button('先计时'));h.clock.advance(60000);
 await h.click(h.button('暂停'));h.clock.advance(120000);await h.click(h.button('恢复专注'));h.clock.advance(60000);
 await h.click(h.button('结束并补充事项'));return h.service.snapshot().state.sessions.at(-1);
}
const escape=h=>h.action(()=>h.query('dialog').dispatchEvent(new Event('cancel',{cancelable:true})));

test('discard is separate from defer; cancelling keeps the draft; restore returns original evidence to the queue',async()=>{
 const h=await appDom();try{
  const record=await freeSession(h),tasks=h.service.snapshot().state.tasks.length;
  await h.input(h.label('这段时间做了什么'),'暂未关联的工作');await h.input(h.query('dialog textarea'),'完成问题定位');
  await h.click(h.button('放弃这段投入'));assert.equal(h.service.snapshot().state.deletedSessions.length,0);
  await escape(h);assert.equal(h.label('这段时间做了什么').value,'暂未关联的工作');assert.equal(h.query('dialog textarea').value,'完成问题定位');
  await h.click(h.button('放弃这段投入'));await h.click(h.button('确认放弃投入'));
  let state=h.service.snapshot().state;assert.equal(state.sessions.length,0);assert.equal(state.deletedSessions[0].summary,'完成问题定位');assert.equal(state.tasks.length,tasks);
  assert.equal(document.querySelector('.unassigned-queue'),null);assert.doesNotMatch(h.label('休息与下一次专注').textContent,/这一段已保存/);
  await h.click(h.button('已删除投入 (1)'));await h.click(h.button('恢复'));state=h.service.snapshot().state;
  assert.equal(state.sessions[0].id,record.id);assert.equal(state.sessions[0].taskId,null);assert.equal(state.sessions[0].durationMs,120000);assert.deepEqual(state.sessions[0].segments,record.segments);
  await h.click(h.button('关闭'));assert.match(h.query('.unassigned-queue').textContent,/完成问题定位/);assert.match(h.query('.today-progress-stats').textContent,/2 分钟/);
 }finally{await h.close();}
});

test('the pending queue can discard prior-day effort and cancellation does not mutate it',async()=>{
 const h=await appDom();try{
  const record=await freeSession(h);await h.click(h.button('稍后补充'));await h.input(h.label('查看日期'),'2026-10-18');
  await h.click(h.query('.unassigned-queue summary'));await h.click(h.button('放弃投入'));await h.click(h.button('保留记录'));
  assert.equal(h.service.snapshot().state.sessions[0].id,record.id);
  await h.click(h.button('放弃投入'));await h.click(h.button('确认放弃投入'));assert.equal(h.service.snapshot().state.sessions.length,0);assert.ok(h.button('已删除投入 (1)'));
 }finally{await h.close();}
});

test('defer and Escape save current progress without requiring a title or creating a task',async()=>{
 const h=await appDom();try{
  const record=await freeSession(h),count=h.service.snapshot().state.tasks.length;
  await h.input(h.query('dialog textarea'),'尚未归类的进展');await h.click(h.button('保存进展，稍后补充'));assert.equal(h.service.snapshot().state.sessions[0].summary,'尚未归类的进展');
  await h.click(h.button('补充事项',h.query('.unassigned-queue')));await h.input(h.query('dialog textarea'),'继续补全的最新进展');await escape(h);
  assert.equal(document.querySelector('dialog'),null);assert.equal(h.service.snapshot().state.sessions[0].summary,'继续补全的最新进展');assert.equal(h.service.snapshot().state.tasks.length,count);assert.equal(h.service.snapshot().state.sessions[0].id,record.id);
 }finally{await h.close();}
});

test('failed defer preserves the draft; pending writes block Esc, close and duplicate submissions',async()=>{
 const h=await appDom();try{
  await freeSession(h);await h.input(h.query('dialog textarea'),'失败也保留');const real=window.journal.command;let reject,calls=0;
  window.journal.command=c=>c.type==='session.summary'?(calls++,new Promise((_,r)=>{reject=r;})):real(c);
  await h.click(h.button('保存进展，稍后补充'));await escape(h);await h.click(h.label('关闭',h.query('dialog')));
  assert.equal(h.query('dialog textarea').value,'失败也保留');assert.equal(calls,1);assert.equal(h.query('dialog').getAttribute('aria-busy'),'true');
  await h.action(()=>reject(Error('写入失败，请重试')));assert.match(h.query('dialog [role=alert]').textContent,/写入失败/);assert.equal(h.service.snapshot().state.sessions[0].summary,'');
  window.journal.command=real;await h.click(h.button('保存进展，稍后补充'));assert.equal(h.service.snapshot().state.sessions[0].summary,'失败也保留');
 }finally{await h.close();}
});

test('discard failure remains reviewable; restore failure remains visible and can be retried',async()=>{
 const h=await appDom();try{
  const record=await freeSession(h);await h.click(h.button('放弃这段投入'));const real=window.journal.command;
  window.journal.command=async c=>{if(c.type==='session.delete')throw Error('无法写入回收站');return real(c);};
  await h.click(h.button('确认放弃投入'));assert.match(h.query('dialog [role=alert]').textContent,/无法写入/);assert.equal(h.service.snapshot().state.sessions[0].id,record.id);
  window.journal.command=real;await h.click(h.button('确认放弃投入'));await h.click(h.button('已删除投入 (1)'));
  window.journal.command=async c=>{if(c.type==='session.restore')throw Error('与现有记录重叠');return real(c);};
  await h.click(h.button('恢复'));assert.match(h.query('dialog [role=alert]').textContent,/重叠/);assert.equal(h.service.snapshot().state.deletedSessions.length,1);
  window.journal.command=real;await h.click(h.button('恢复'));assert.equal(h.service.snapshot().state.deletedSessions.length,0);
 }finally{await h.close();}
});

test('manual entry excludes hidden ancestors, preserves finished tasks, and cancellation writes nothing',async()=>{
 const h=await appDom();try{
  const parent=h.add('已收起项目'),child=h.add('隐藏子项',parent),valid=h.add('已完成的正常事项');
  h.service.execute({type:'outline.patch',payload:{id:parent,field:'isProject',value:true}});h.service.execute({type:'task.status',payload:{id:child,status:'done'}});h.service.execute({type:'project.archive',payload:{id:parent}});h.service.execute({type:'task.status',payload:{id:valid,status:'done'}});
  await h.mount();await h.click(h.button('补记时间'));let picker=h.label('这段时间推进了哪个任务');
  assert.ok([...picker.options].some(o=>o.value===valid));assert.ok(![...picker.options].some(o=>o.value===child||o.value===parent));
  await h.input(h.label('这段时间的进展'),'不要保存的补记草稿');await h.click(h.button('取消'));assert.equal(h.service.snapshot().state.sessions.length,0);
  await h.click(h.label('日历'));await h.key(h.query('.day-column'),'Enter');await h.click(h.button('补记投入已经做过的事'));await h.click(h.button('关联已有事项'));
  picker=h.label('关联事项');assert.ok(![...picker.options].some(o=>o.value===child));assert.ok([...picker.options].some(o=>o.value===valid));
 }finally{await h.close();}
});

for(const flow of ['manual','calendar'])test(`${flow} saves keep the form open on errors and prevent closing during the write`,async()=>{
 const h=await appDom();try{
  h.add('已有事项');await h.mount();
  if(flow==='manual')await h.click(h.button('补记时间'));
  else{await h.click(h.label('日历'));await h.key(h.query('.day-column'),'Enter');await h.click(h.button('补记投入已经做过的事'));await h.input(h.label('事项名称'),'保留日历草稿');}
  const real=window.journal.command;let reject;window.journal.command=c=>['session.manual','calendar.save'].includes(c.type)?new Promise((_,r)=>{reject=r;}):real(c);
  await h.click(h.button(flow==='manual'?'保存记录':'保存投入',h.query('dialog')));assert.equal(h.query('dialog').getAttribute('aria-busy'),'true');assert.equal(typeof reject,'function');await escape(h);await h.click(h.button('取消',h.query('dialog')));assert.ok(h.query('dialog'));
  await h.action(()=>reject(Error('保存失败')));assert.match(h.query('dialog [role=alert]').textContent,/保存失败/);assert.equal(h.service.snapshot().state.sessions.length,0);await h.click(h.button('取消'));assert.equal(document.querySelector('dialog'),null);
 }finally{await h.close();}
});

test('named session summary retains edits on defer and survives external session deletion',async()=>{
 const h=await appDom();try{
  const taskId=h.add('已关联事项');await h.mount();await h.command({type:'focus.start',payload:{taskId}});h.clock.advance(60000);await h.click(h.button('结束本次',h.query('.task-card')));
  await h.input(h.label('本次推进了什么'),'已完成验证');await escape(h);assert.equal(h.service.snapshot().state.sessions[0].summary,'已完成验证');
  await h.command({type:'focus.start',payload:{taskId}});h.clock.advance(60000);await h.click(h.button('结束本次',h.query('.task-card')));
  const id=h.service.snapshot().state.sessions.at(-1).id;await h.command({type:'session.delete',payload:{id}});assert.match(h.query('dialog').textContent,/已更新/);await h.click(h.button('返回'));
 }finally{await h.close();}
});
