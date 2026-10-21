import {test} from 'node:test';
import assert from 'node:assert/strict';
import {appDom} from './app-dom.mjs';

test('calendar effort deletion is confirmed, updates totals, and can be restored with its identity and summary',async()=>{
 const h=await appDom();try{
  const id=h.add('可以恢复的投入');h.service.execute({type:'calendar.save',payload:{taskId:id,mode:'effort',start:'2026-10-19T09:00',end:'2026-10-19T09:01',summary:'完成一个验证'}});
  const record=h.service.snapshot().state.sessions[0];await h.mount();await h.click(h.label('日历'));
  const block=h.query(`.calendar-event[data-session-id="${record.id}"]`);assert.ok(block.classList.contains('calendar-tiny'));assert.equal(Number.parseFloat(block.style.height),1);
  await h.context(block);await h.click(h.button('删除投入记录'));assert.equal(h.service.snapshot().state.sessions.length,1);await h.click(h.button('确认删除投入'));
  assert.equal(h.service.snapshot().state.sessions.length,0);assert.equal(h.get(id).startedAt,null);assert.equal(document.querySelector('[data-session-id]'),null);
  await h.click(h.button('已删除投入 (1)'));await h.click(h.label('恢复投入 可以恢复的投入'));assert.equal(h.service.snapshot().state.sessions[0].id,record.id);assert.equal(h.service.snapshot().state.sessions[0].summary,record.summary);assert.equal(h.service.snapshot().state.deletedSessions.length,0);
  await h.click(h.label('关闭',h.query('dialog')));await h.click(h.label('今日'));assert.match(h.query(`[data-progress-id="${id}"]`).textContent,/1 分钟/);
 }finally{await h.close();}
});
test('calendar reminder is removable without deleting its item; recurring event deletion clearly affects the series',async()=>{
 const h=await appDom();try{
  const id=h.add('提醒事项');h.service.execute({type:'item-reminder.set',payload:{id,at:'2026-10-19T15:00'}});
  h.service.execute({type:'calendar.save',payload:{mode:'event',title:'重复事件',start:'2026-10-19T16:00',end:'2026-10-19T17:00'}});const event=h.service.snapshot().state.tasks.at(-1).id;
  h.service.execute({type:'recurrence.set',payload:{id:event,rule:{mode:'calendar',unit:'day',interval:1,anchor:'2026-10-19',weekdays:[],until:null}}});
  await h.mount();await h.click(h.label('日历'));await h.key(h.query(`.calendar-reminder[data-item-id="${id}"]`),'F10',{shiftKey:true});await h.click(h.button('移除提醒'));assert.equal(h.get(id).reminder,null);assert.equal(h.get(id).deletedAt,null);
  await h.context(h.query(`.calendar-scheduled-event[data-item-id="${event}"]`));assert.match(h.query('dialog').textContent,/整个系列/);await h.click(h.button('删除整个重复系列'));assert.equal(h.query('dialog').getAttribute('aria-label'),'移入回收站');
  await h.click(h.button('确认移入回收站',h.query('dialog')));assert.ok(h.get(event).deletedAt);assert.equal(document.querySelector(`[data-item-id="${event}"]`),null);assert.equal(h.service.snapshot().state.sessions.length,0);
 }finally{await h.close();}
});
test('Today execution comes before history; focus selection starts work directly and progress groups sessions once',async()=>{
 const h=await appDom();try{
  const id=h.add('今天推进'),other=h.add('另一件待做');for(const [start,end] of [['09:00','09:10'],['09:20','09:30']])h.service.execute({type:'calendar.save',payload:{mode:'effort',taskId:id,start:`2026-10-19T${start}`,end:`2026-10-19T${end}`}});
  await h.mount();assert.ok(h.query('.today-execution-grid').compareDocumentPosition(h.query('.today-history'))&window.Node.DOCUMENT_POSITION_FOLLOWING);assert.equal(document.querySelectorAll(`[data-progress-id="${id}"]`).length,1);assert.match(h.query(`[data-progress-id="${id}"]`).textContent,/20 分钟/);assert.equal(document.querySelectorAll('.session-entry').length,2);
  await h.click(h.button('选择重点'));await h.click(h.label('加入今日重点 今天推进',h.query('.today-focus-picker')));await h.click(h.label('开始计时 今天推进',h.query('.today-focus-list')));assert.equal(h.service.snapshot().timers[0].taskId,id);
  await h.command({type:'focus.pause',payload:{taskId:id}});await h.click(h.label('恢复计时 今天推进',h.query('.today-focus-list')));assert.equal(h.service.snapshot().timers[0].paused,false);
  await h.command({type:'focus.stop',payload:{taskId:id,complete:true}});assert.match(h.query(`[data-progress-id="${id}"]`).textContent,/已完成/);await h.click(h.label('事项'));assert.equal(document.querySelector(`[data-outline-id="${id}"]`),null);assert.ok(h.query(`[data-outline-id="${other}"]`));
 }finally{await h.close();}
});
test('completed default migration preserves explicit saved views and later deliberate show-completed choice',async()=>{
 const h=await appDom();try{
  const id=h.add('完成事项');h.service.execute({type:'task.status',payload:{id,status:'done'}});
  const {readTree}=await import('../src/workspace-state.ts'),{emptyFilter}=await import('../core/filters.ts');const state=h.service.snapshot().state;
  const old={filter:{...emptyFilter(),showDone:true},activeView:'',selected:id,collapsed:[]};window.localStorage.setItem('test-tree',JSON.stringify(old));assert.equal(readTree('test-tree',state).filter.showDone,false);
  window.localStorage.setItem('test-tree',JSON.stringify({...old,completedDefaultVersion:1}));assert.equal(readTree('test-tree',state).filter.showDone,true);
  state.views.push({id:'saved',name:'全部截止',filter:old.filter});window.localStorage.setItem('test-tree',JSON.stringify({...old,activeView:'saved'}));assert.equal(readTree('test-tree',state).filter.showDone,true);
  await h.mount();await h.click(h.label('事项'));assert.equal(h.label('显示已完成').checked,false);await h.click(h.label('显示已完成'));assert.ok(h.query(`[data-outline-id="${id}"]`));await h.click(h.label('今日'));await h.click(h.label('事项'));assert.equal(h.label('显示已完成').checked,true);assert.ok(h.query(`[data-outline-id="${id}"]`));
 }finally{await h.close();}
});
