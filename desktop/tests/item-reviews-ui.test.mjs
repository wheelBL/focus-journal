import {test} from 'node:test';
import assert from 'node:assert/strict';
import {appDom} from './app-dom.mjs';

test('full review flow isolates scope, distinguishes browsing from review, and preserves work context',async t=>{
 const h=await appDom(),{service:s,clock,add,get,query,label,button,click,input,key,context,command}=h;
 const parent=add('要审视的项目',null),child=add('正在推进的子项',parent),paused=add('暂时不执行的子项',parent),done=add('以前完成的子项',parent),deep=add('更深一层',child),other=add('工作视图只看我',null);
 s.execute({type:'outline.patch',payload:{id:parent,field:'isProject',value:true}});s.execute({type:'task.status',payload:{id:done,status:'done'}});s.execute({type:'item.change',payload:{id:paused,action:'pause'}});
 const configure=id=>s.execute({type:'item-review.configure',payload:{id,enabled:true,nextDate:'2026-10-19',interval:{unit:'weeks',count:1}}});configure(parent);configure(child);configure(other);
 s.execute({type:'tag.attach',payload:{id:child,name:'工作'}});
 await h.mount();
 try{
  await t.test('an existing work search stays separate from a complete, expanded review subtree',async()=>{
   await click(label('事项'));await input(label('在事项树中搜索'),'工作视图只看我');assert.ok(label('工作视图只看我',query('[role=tree]')));assert.equal(document.querySelector(`[data-outline-id="${parent}"]`),null);
   await click(label('回顾'));assert.equal(query('[role=tab][aria-selected=true]').textContent,'事项审视 · 3');
   const tree=query('[role=tree]');for(const name of ['要审视的项目','正在推进的子项','暂时不执行的子项','更深一层'])assert.ok(label(name,tree));assert.equal(tree.querySelector(`[data-outline-id="${done}"]`),null);assert.equal(tree.querySelector(`[data-outline-id="${other}"]`),null);
   assert.equal(label('开始暂时不执行的子项',tree).disabled,true);await click(label('暂时不执行的子项',tree));assert.match(query('.task-inspector').textContent,/此事项已暂停/);
   await click(query('.outline-tools input[type=checkbox]'));assert.ok(label('以前完成的子项，已完成',tree));await click(query('.row-tag',label('正在推进的子项',tree)));assert.ok(label('暂时不执行的子项',tree));assert.equal(s.snapshot().state.itemReviews.length,0);
  });
  await t.test('inline edit, context child creation and timer start retain the reviewing root without auto-marking',async()=>{
   await click(label('正在推进的子项',query('[role=tree]')));await key(label('正在推进的子项',query('[role=tree]')),'F2');await input(label('名称 正在推进的子项'), '正在推进的子项（已澄清）');await key(label('名称 正在推进的子项'),'Enter');assert.equal(get(child).title,'正在推进的子项（已澄清）');assert.match(query('.review-current-top').textContent,/要审视的项目/);
   await key(label('更深一层',query('[role=tree]')),'Insert',{ctrlKey:true});await input(label('新事项名称'),'审视时拆出的小步骤');await h.action(()=>query('.inline-creator').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));await key(label('新事项名称'),'Escape');assert.equal(s.snapshot().state.tasks.at(-1).parentId,deep);assert.equal(query('[role=tree]').querySelector(`[data-outline-id="inbox"]`),null);
   await click(label('开始正在推进的子项（已澄清）',query('[role=tree]')));clock.advance(60000);await command({type:'focus.pause',payload:{taskId:child}});assert.equal(s.snapshot().state.itemReviews.length,0);assert.equal(get(parent).reviewSchedule.lastReviewedAt,null);
  });
  await t.test('skip and returning later preserve position; defer does not count as reviewed',async()=>{
   await click(button('跳过，先看下一项'));assert.match(query('.review-current-top').textContent,/正在推进的子项/);assert.equal(s.snapshot().state.itemReviews.length,0);
   await click(label('今日'));await click(label('回顾'));assert.match(query('.review-current-top').textContent,/正在推进的子项/);
   await click(button('稍后审视'));await click(button('明天再看'));assert.equal(get(child).reviewSchedule.nextDate,'2026-10-20');assert.equal(get(child).reviewSchedule.lastReviewedAt,null);assert.match(query('.item-review-heading').textContent,/本轮已审视 0/);assert.equal(s.snapshot().state.itemReviews.length,0);
   await click(button('重新查看本轮跳过项'));assert.match(query('.review-current-top').textContent,/要审视的项目/);
  });
  await t.test('marking a parent leaves children independent; undo restores its prior schedule',async()=>{
   await click(button('已审视，查看下一项'));assert.equal(s.snapshot().state.itemReviews.length,1);assert.equal(get(parent).reviewSchedule.nextDate,'2026-10-26');assert.equal(get(child).reviewSchedule.lastReviewedAt,null);assert.equal(get(child).reviewSchedule.nextDate,'2026-10-20');
   await click(button('撤销刚才的已审视'));assert.equal(get(parent).reviewSchedule.nextDate,'2026-10-19');assert.equal(get(parent).reviewSchedule.lastReviewedAt,null);assert.ok(s.snapshot().state.itemReviews[0].undoneAt);assert.match(query('.review-current-top').textContent,/要审视的项目/);
  });
  await t.test('explicit child selection marks one batch and a single undo restores all selected schedules',async()=>{
   await command({type:'item-review.defer',payload:{id:child,nextDate:'2026-10-19'}});await click(query('.review-optional summary'));const box=query('.review-optional fieldset input');assert.equal(box.checked,false);await click(box);await input(label('审视说明'),'拆分已明确，下周继续');await click(button('已审视，查看下一项'));
   const logs=s.snapshot().state.itemReviews.filter(r=>!r.undoneAt);assert.equal(logs.length,2);assert.equal(logs[0].batchId,logs[1].batchId);assert.equal(logs[0].note,'拆分已明确，下周继续');assert.equal(get(child).reviewSchedule.nextDate,'2026-10-26');
   await click(button('撤销刚才的已审视'));assert.equal(get(parent).reviewSchedule.nextDate,'2026-10-19');assert.equal(get(child).reviewSchedule.nextDate,'2026-10-19');assert.equal(s.snapshot().state.itemReviews.filter(r=>!r.undoneAt).length,0);
  });
  await t.test('review settings are contextual and collapsed; put aside pauses independently without marking',async()=>{
   const tree=query('[role=tree]');await context(label('要审视的项目',tree));await click(button('定期审视…',query('[role=menu]')));let dialog=query('dialog');await input(label('审视频率',dialog),'months');await input(label('审视间隔',dialog),'1');assert.match(dialog.textContent,/目标月份没有同一日/);await click(label('同时暂停事项',dialog));await click(button('暂停并保存审视',dialog));assert.equal(get(parent).availability,'paused');assert.equal(get(child).availability,'active');assert.equal(s.snapshot().state.itemReviews.filter(r=>!r.undoneAt).length,0);
   await click(query('.review-decision-actions details summary'));await click(button('暂时放下，下次再看…'));dialog=query('dialog');assert.equal(label('开启定期审视',dialog).checked,true);assert.equal(label('同时暂停事项',dialog).checked,true);await click(button('暂停并保存审视',dialog));
   await click(label('正在推进的子项（已澄清）',tree));assert.match(query('.task-inspector').textContent,/父级.*暂停/);assert.equal(query('.regular-review-settings').open,false);
   await click(label('事项'));assert.equal(label('在事项树中搜索').value,'工作视图只看我');assert.equal(document.querySelector(`[data-outline-id="${parent}"]`),null);
  });
  await t.test('upcoming/all views advance after a mark or deferral and effort review remains separate',async()=>{
   await click(label('回顾'));await input(label('审视队列范围'),'all');await click(button('已审视，查看下一项'));assert.equal(get(parent).availability,'paused');assert.equal(get(parent).reviewSchedule.nextDate,'2026-11-19');assert.match(query('.review-current-top').textContent,/正在推进的子项/);
   await click(button('稍后审视'));await click(button('一周后再看'));assert.match(query('.review-current-top').textContent,/工作视图只看我/);assert.equal(get(child).reviewSchedule.nextDate,'2026-10-26');
   await click(button('投入复盘'));assert.ok(label('回顾开始日期'));assert.equal(document.querySelector('.review-queue'),null);assert.match(query('.review-summary').textContent,/累计记录时长.*去重时间覆盖/);
  });
 }finally{await h.close();}
});
