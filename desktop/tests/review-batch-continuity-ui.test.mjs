import {test} from 'node:test';
import assert from 'node:assert/strict';
import {appDom} from './app-dom.mjs';

function holdCommand(type){
 const real=window.journal.command;let calls=0,finish,fail;const commands=[];
 window.journal.command=command=>command.type===type?(calls++,commands.push(command),new Promise((resolve,reject)=>{finish=()=>resolve(real(command));fail=reject;})):real(command);
 return {commands,get calls(){return calls;},finish:()=>finish(),fail:message=>fail(Error(message)),restore:()=>{window.journal.command=real;}};
}
function reviewItems(h){
 const first=h.add('需要再次想清楚的工作',null),child=h.add('明确选择的子项',first),second=h.add('另一项待审视工作',null);
 for(const id of [first,child,second])h.service.execute({type:'item-review.configure',payload:{id,enabled:true,nextDate:'2026-10-19',interval:{unit:'weeks',count:1}}});
 return {first,child,second};
}
function queueButton(h,title){return [...h.query('.review-queue').querySelectorAll('button')].find(button=>button.querySelector('strong')?.textContent===title);}
async function openBatch(h,first,second){
 await h.click(h.label('事项'));const row=id=>h.query(`[data-outline-id="${id}"]`);await h.click(row(first));await h.action(()=>row(second).dispatchEvent(new MouseEvent('click',{bubbles:true,ctrlKey:true})));await h.click(h.button('整理所选…'));
}
const positionKey=h=>`focus-journal-item-review-position.${encodeURIComponent(h.service.snapshot().dataPath)}`;

test('review drafts retain notes, selected children, deferred date and queue mode across item and page switches',async()=>{
 const h=await appDom();try{
  const {first,second}=reviewItems(h);await h.mount();await h.click(h.label('回顾'));await h.click(h.query('.review-optional summary'));await h.input(h.label('审视说明'),'先确认外部依赖，再决定是否继续');await h.click(h.query('.review-optional fieldset input'));await h.click(h.button('稍后审视'));await h.input(h.label('稍后审视日期'),'2026-10-29');
  await h.click(queueButton(h,'另一项待审视工作'));assert.equal(h.label('审视说明').value,'');await h.input(h.label('审视说明'),'第二项自己的说明');await h.click(queueButton(h,'需要再次想清楚的工作'));
  assert.equal(h.label('审视说明').value,'先确认外部依赖，再决定是否继续');assert.equal(h.query('.review-optional fieldset input').checked,true);assert.equal(h.label('稍后审视日期').value,'2026-10-29');
  await h.input(h.label('审视队列范围'),'all');await h.click(h.label('今日'));await h.click(h.label('回顾'));assert.equal(h.label('审视队列范围').value,'all');assert.equal(h.label('审视说明').value,'先确认外部依赖，再决定是否继续');assert.equal(h.label('稍后审视日期').value,'2026-10-29');
  const saved=JSON.parse(window.localStorage.getItem(positionKey(h)));assert.equal(saved.drafts[first].note,'先确认外部依赖，再决定是否继续');assert.equal(saved.drafts[second].note,'第二项自己的说明');assert.equal(h.service.snapshot().state.itemReviews.length,0);
 }finally{await h.close();}
});

test('review draft caches are isolated by journal data path',async()=>{
 const h=await appDom();try{
  const {first}=reviewItems(h);window.localStorage.setItem('focus-journal-item-review-position.other-profile',JSON.stringify({date:'2026-10-19',mode:'all',selected:first,skipped:[],handled:[],reviewed:12,drafts:{[first]:{note:'来自另一个数据文件',later:'2026-11-01',children:[],defer:true,batchId:''}}}));
  await h.mount();await h.click(h.label('回顾'));assert.equal(h.label('审视说明').value,'');assert.match(h.query('.item-review-heading').textContent,/本轮已审视 0/);await h.input(h.label('审视说明'),'仅属于当前数据文件');assert.equal(JSON.parse(window.localStorage.getItem(positionKey(h))).drafts[first].note,'仅属于当前数据文件');assert.equal(JSON.parse(window.localStorage.getItem('focus-journal-item-review-position.other-profile')).drafts[first].note,'来自另一个数据文件');
 }finally{await h.close();}
});

test('pending review locks queue and decisions, failure keeps the draft and retry reuses its request identity',async()=>{
 const h=await appDom();try{
  const {first,second}=reviewItems(h);await h.mount();await h.click(h.label('回顾'));await h.input(h.label('审视说明'),'提交前的判断');await h.click(h.button('稍后审视'));await h.input(h.label('稍后审视日期'),'2026-10-28');const gate=holdCommand('item-review.mark');
  await h.click(h.button('已审视，查看下一项'));assert.equal(h.query('.item-review-workspace').getAttribute('aria-busy'),'true');assert.equal(h.label('审视说明').disabled,true);assert.equal(h.label('稍后审视日期').disabled,true);assert.equal(h.label('审视队列范围').disabled,true);assert.equal(queueButton(h,'另一项待审视工作').disabled,true);
  await h.click(queueButton(h,'另一项待审视工作'));await h.click(h.button('已审视，查看下一项'));assert.equal(gate.calls,1);assert.match(h.query('.review-current-top').textContent,/需要再次想清楚的工作/);
  await h.action(()=>gate.fail('审视保存暂不可用'));assert.equal(h.label('审视说明').disabled,false);assert.equal(h.label('审视说明').value,'提交前的判断');assert.equal(h.label('稍后审视日期').value,'2026-10-28');assert.match(h.query('.item-review-workspace > [role=alert]').textContent,/暂不可用/);
  await h.click(h.button('已审视，查看下一项'));assert.equal(gate.calls,2);assert.equal(gate.commands[0].payload.batchId,gate.commands[1].payload.batchId);await h.action(gate.finish);gate.restore();assert.equal(h.service.snapshot().state.itemReviews.length,1);assert.equal(h.service.snapshot().state.itemReviews[0].note,'提交前的判断');const saved=JSON.parse(window.localStorage.getItem(positionKey(h)));assert.equal(saved.drafts[first],undefined);assert.equal(h.get(second).reviewSchedule.lastReviewedAt,null);
 }finally{await h.close();}
});

test('marking clears only the submitted draft; deferring preserves unsent notes without a review record',async()=>{
 const h=await appDom();try{
  const {first,second}=reviewItems(h);await h.mount();await h.click(h.label('回顾'));await h.input(h.label('审视说明'),'第一项的正式判断');await h.click(queueButton(h,'另一项待审视工作'));await h.input(h.label('审视说明'),'下一次再思考的说明');await h.click(queueButton(h,'需要再次想清楚的工作'));await h.click(h.button('已审视，查看下一项'));
  let saved=JSON.parse(window.localStorage.getItem(positionKey(h)));assert.equal(saved.drafts[first],undefined);assert.equal(saved.drafts[second].note,'下一次再思考的说明');await h.click(queueButton(h,'另一项待审视工作'));await h.click(h.button('稍后审视'));await h.click(h.button('明天再看'));
  assert.equal(h.service.snapshot().state.itemReviews.length,1);assert.equal(h.get(second).reviewSchedule.lastReviewedAt,null);await h.input(h.label('审视队列范围'),'upcoming');await h.click(queueButton(h,'另一项待审视工作'));assert.equal(h.label('审视说明').value,'下一次再思考的说明');assert.equal(document.querySelector('.review-defer'),null);
 }finally{await h.close();}
});

test('a review save finishing after navigation updates its persisted position without replacing the active page',async()=>{
 const h=await appDom();try{
  const {first}=reviewItems(h);await h.mount();await h.click(h.label('回顾'));await h.input(h.label('审视说明'),'离开页面前提交的决定');const gate=holdCommand('item-review.mark');await h.click(h.button('已审视，查看下一项'));await h.click(h.label('今日'));assert.ok(h.query('.today-page'));await h.action(gate.finish);gate.restore();assert.ok(h.query('.today-page'));await h.click(h.label('回顾'));
  assert.match(h.query('.item-review-heading').textContent,/本轮已审视 1/);assert.doesNotMatch(h.query('.review-current-top').textContent,/需要再次想清楚的工作/);assert.equal(JSON.parse(window.localStorage.getItem(positionKey(h))).drafts[first],undefined);
 }finally{await h.close();}
});

test('returning to review before a pending write finishes receives its result without resurrecting the submitted draft',async()=>{
 const h=await appDom();try{
  const {first}=reviewItems(h);await h.mount();await h.click(h.label('回顾'));await h.input(h.label('审视说明'),'等待保存的判断');const gate=holdCommand('item-review.mark');await h.click(h.button('已审视，查看下一项'));await h.click(h.label('今日'));await h.click(h.label('回顾'));assert.equal(h.label('审视说明').value,'等待保存的判断');assert.equal(h.label('审视说明').disabled,true);
  await h.action(gate.finish);gate.restore();assert.match(h.query('.item-review-heading').textContent,/本轮已审视 1/);assert.doesNotMatch(h.query('.review-current-top').textContent,/需要再次想清楚的工作/);assert.equal(JSON.parse(window.localStorage.getItem(positionKey(h))).drafts[first],undefined);await h.input(h.label('审视队列范围'),'all');await h.click(queueButton(h,'需要再次想清楚的工作'));assert.equal(h.label('审视说明').value,'');
 }finally{await h.close();}
});

test('batch organization protects pending input and close, then retains failure for a single retry',async()=>{
 const h=await appDom();try{
  const first=h.add('批量第一项'),second=h.add('批量第二项');await h.mount();await openBatch(h,first,second);await h.input(h.label('批量标签'),'需要跟进');const gate=holdCommand('items.batch');await h.click(h.button('确认添加标签'));assert.equal(h.query('dialog').getAttribute('aria-busy'),'true');assert.equal(h.label('批量操作').matches(':disabled'),true);assert.equal(h.label('批量标签').matches(':disabled'),true);
  await h.click(h.button('返回',h.query('dialog')));await h.action(()=>h.query('dialog').dispatchEvent(new Event('cancel',{cancelable:true})));await h.click(h.button('确认添加标签'));assert.equal(gate.calls,1);assert.ok(h.query('dialog'));
  await h.action(()=>gate.fail('批量保存失败'));assert.equal(h.label('批量标签').value,'需要跟进');assert.equal(h.label('批量标签').matches(':disabled'),false);assert.match(h.query('dialog [role=alert]').textContent,/批量保存失败/);gate.restore();await h.click(h.button('确认添加标签'));assert.equal(document.querySelector('dialog'),null);assert.equal(h.get(first).tagIds.length,1);assert.deepEqual(h.get(first).tagIds,h.get(second).tagIds);assert.equal(document.querySelector('.batch-toolbar'),null);
 }finally{await h.close();}
});

test('cancelling an unsaved batch makes no changes; a late batch response does not clear a newer selection',async()=>{
 const h=await appDom();try{
  const first=h.add('此前选择'),second=h.add('此前另一选择'),third=h.add('后来选择');await h.mount();await openBatch(h,first,second);await h.input(h.label('批量标签'),'放弃的标签');const before=h.service.exportJson();await h.click(h.button('返回',h.query('dialog')));assert.equal(h.service.exportJson(),before);
  await h.click(h.button('整理所选…'));await h.input(h.label('批量标签'),'已提交的标签');const gate=holdCommand('items.batch');await h.click(h.button('确认添加标签'));await h.click(h.label('今日'));await h.click(h.label('事项'));const row=id=>h.query(`[data-outline-id="${id}"]`);await h.click(row(second));await h.action(()=>row(third).dispatchEvent(new MouseEvent('click',{bubbles:true,ctrlKey:true})));assert.match(h.query('.batch-toolbar').textContent,/已选 2 条/);
  await h.action(gate.finish);gate.restore();assert.match(h.query('.batch-toolbar').textContent,/已选 2 条/);assert.ok(row(third).classList.contains('batch-selected'));assert.equal(h.get(third).tagIds?.length??0,0);
 }finally{await h.close();}
});
