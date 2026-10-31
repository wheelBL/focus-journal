import {test} from 'node:test';
import assert from 'node:assert/strict';
import {appDom} from './app-dom.mjs';

const buttons=(root=document)=>[...root.querySelectorAll('button')];
const trashButton=()=>buttons().find(button=>button.textContent.trim().startsWith('已删除投入'));
const effort=(h,taskId,start,end)=>h.service.execute({type:'calendar.save',payload:{mode:'effort',taskId,start:`2026-10-19T${start}`,end:`2026-10-19T${end}`}});

test('Today has one inline capture entry while Ctrl+N, manual effort and the timeline remain available',async()=>{
 const h=await appDom();try{
  await h.mount();assert.equal(buttons(h.query('.today-page .page-header')).some(button=>button.textContent==='新增事项'),false);
  const capture=h.label('快速添加事项名称');await h.input(capture,'直接记录的事项');await h.key(capture,'Enter');
  assert.ok(h.service.snapshot().state.tasks.some(task=>task.title==='直接记录的事项'));assert.equal(capture.value,'');
  await h.key(document.body,'n',{ctrlKey:true});assert.ok(h.query('dialog'));await h.click(h.label('关闭',h.query('dialog')));
  await h.click(h.button('补记时间'));assert.ok(h.query('dialog'));await h.click(h.button('取消',h.query('dialog')));
  assert.ok(h.query('.today-history'));assert.equal(h.service.snapshot().state.sessions.length,0);
 }finally{await h.close();}
});

test('deleted effort is discoverable on Today and Calendar only when recovery is possible',async()=>{
 const h=await appDom();try{
  const id=h.add('保留投入恢复能力');effort(h,id,'09:00','09:30');const session=h.service.snapshot().state.sessions[0];
  await h.mount();assert.equal(trashButton(),undefined);await h.click(h.label('日历'));assert.equal(trashButton(),undefined);
  await h.command({type:'session.delete',payload:{id:session.id}});assert.equal(trashButton().textContent.trim(),'已删除投入 (1)');
  await h.click(h.label('今日'));await h.click(trashButton());await h.click(h.button('恢复'));
  assert.equal(h.service.snapshot().state.sessions[0].id,session.id);assert.equal(h.service.snapshot().state.sessions[0].durationMs,session.durationMs);
  await h.click(h.button('关闭',h.query('dialog')));assert.equal(trashButton(),undefined);
  await h.click(h.label('日历'));assert.equal(trashButton(),undefined);assert.ok(h.query(`[data-session-id="${session.id}"]`));
 }finally{await h.close();}
});

test('Today omits identical time totals but keeps distinct overlap and untimed totals explained',async()=>{
 const h=await appDom();try{
  const first=h.add('第一件工作'),second=h.add('并行工作');effort(h,first,'09:00','09:30');
  await h.mount();assert.match(h.query('.today-progress-stats').textContent,/累计投入 30 分钟/);assert.doesNotMatch(h.query('.today-progress-stats').textContent,/去重覆盖/);
  await h.command({type:'calendar.save',payload:{mode:'effort',taskId:second,start:'2026-10-19T09:15',end:'2026-10-19T09:45'}});
  let stats=h.query('.today-progress-stats');assert.match(stats.textContent,/累计投入 60 分钟/);assert.match(stats.textContent,/去重覆盖 45 分钟/);
  assert.match([...stats.querySelectorAll('[title]')].find(el=>el.textContent.includes('累计投入')).title,/包含并行记录/);
  const overlap=h.service.snapshot().state.sessions.find(session=>session.taskId===second);await h.command({type:'session.delete',payload:{id:overlap.id}});
  assert.doesNotMatch(h.query('.today-progress-stats').textContent,/去重覆盖/);
  await h.command({type:'session.manual',payload:{taskId:second,date:'2026-10-19',minutes:20}});
  stats=h.query('.today-progress-stats');assert.match(stats.textContent,/累计投入 50 分钟/);assert.match(stats.textContent,/去重覆盖 30 分钟/);
  assert.match([...stats.querySelectorAll('[title]')].find(el=>el.textContent.includes('去重覆盖')).title,/合并重叠时段.*不包含未指定时间/);
 }finally{await h.close();}
});

test('Calendar keeps its legend and Now visible while operation instructions are available on demand',async()=>{
 const h=await appDom();try{
  await h.mount();await h.click(h.label('日历'));
  assert.equal(h.query('.calendar-page .page-header').querySelector('.eyebrow'),null);
  assert.equal(h.query('#workspace-sidebar').querySelector('.context-help'),null);
  const guide=h.query('.calendar-guide details');assert.equal(guide.open,false);
  const legend=h.label('日历图例');assert.match(legend.textContent,/实色.*实际投入.*虚线.*提醒.*○.*事件/);assert.equal(guide.contains(legend),false);
  await h.click(h.query('summary',guide));assert.equal(guide.open,true);assert.match(guide.textContent,/拖选.*右键.*Enter.*双击/s);assert.match(guide.textContent,/短记录与提醒/);
  await h.click(h.query('summary',guide));assert.equal(guide.open,false);
  await h.input(h.label('查看日期'),'2026-10-18');await h.click(h.label('定位当前时刻'));assert.equal(h.label('查看日期').value,'2026-10-19');
  await h.key(h.query('.day-column'),'Enter');assert.equal(h.query('dialog').getAttribute('aria-label'),'安排这段时间');await h.click(h.button('取消'));
  assert.equal(h.service.snapshot().state.sessions.length,0);
 }finally{await h.close();}
});

test('insignificant wall-clock and monotonic drift does not create identical displayed totals',async()=>{
 const h=await appDom();try{
  const id=h.add('钟表精度差异');h.service.execute({type:'focus.start',payload:{taskId:id,skipEstimate:true}});h.clock.advance(60000);h.clock.mono+=2;h.service.execute({type:'focus.stop',payload:{taskId:id}});
  await h.mount();assert.match(h.query('.today-progress-stats').textContent,/累计投入 1 分钟/);assert.doesNotMatch(h.query('.today-progress-stats').textContent,/去重覆盖/);
 }finally{await h.close();}
});
