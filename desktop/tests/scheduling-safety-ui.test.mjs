import {test} from 'node:test';
import assert from 'node:assert/strict';
import {appDom} from './app-dom.mjs';

function holdCommand(type){
 const real=window.journal.command;let calls=0,finish,fail;
 window.journal.command=command=>command.type===type?(calls++,new Promise((resolve,reject)=>{finish=()=>resolve(real(command));fail=reject;})):real(command);
 return {get calls(){return calls;},finish:()=>finish(),fail:message=>fail(Error(message)),restore:()=>{window.journal.command=real;}};
}
async function openSchedule(h,id,kind){
 await h.click(h.label('事项'));await h.click(h.query(`[data-outline-id="${id}"]`));
 if(kind==='reminder'){await h.click(h.query('.inspector-more-arrangements > summary'));await h.click(h.button('设置提醒'));}
 else{await h.context(h.query(`[data-outline-id="${id}"]`));await h.click(h.button(kind==='review'?'定期审视…':'重复安排…'));}
 if(kind==='reminder'){await h.input(h.label('提醒时间'),'2026-10-22T18:30');return {input:h.label('提醒时间'),command:'item-reminder.set',save:'保存提醒'};}
 if(kind==='review'){const dialog=h.query('dialog');await h.click(h.label('开启定期审视',dialog));await h.input(h.label('下次审视日期',dialog),'2026-11-10');return {input:h.label('下次审视日期',dialog),command:'item-review.configure',save:'保存审视安排'};}
 await h.input(h.label('重复间隔'),'3');return {input:h.label('重复间隔'),command:'recurrence.set',save:'保存重复'};
}

for(const kind of ['reminder','review','repeat'])test(`${kind} schedule blocks pending edits and closing, retains failed draft and retries once`,async()=>{
 const h=await appDom();try{
  const id=h.add('待安排的事项');await h.mount();const flow=await openSchedule(h,id,kind),draft=flow.input.value,before=h.service.exportJson(),gate=holdCommand(flow.command);
  await h.click(h.button(flow.save,h.query('dialog')));assert.equal(h.query('dialog').getAttribute('aria-busy'),'true');assert.equal(flow.input.matches(':disabled'),true);
  await h.action(()=>h.query('dialog').dispatchEvent(new Event('cancel',{cancelable:true})));await h.click(h.label('关闭',h.query('dialog')));
  await h.click(h.button(flow.save,h.query('dialog')));if(kind==='repeat')await h.click(h.button('收起',h.query('dialog')));else await h.action(()=>flow.input.form.requestSubmit());
  assert.equal(gate.calls,1);assert.equal(flow.input.value,draft);assert.ok(h.query('dialog'));assert.equal(h.service.exportJson(),before);
  await h.action(()=>gate.fail('存储暂不可用，请重试'));assert.equal(h.query('dialog').getAttribute('aria-busy'),'false');assert.equal(flow.input.matches(':disabled'),false);assert.equal(flow.input.value,draft);assert.match(h.query('dialog [role=alert]').textContent,/存储暂不可用/);
  gate.restore();await h.click(h.button(flow.save,h.query('dialog')));
  if(kind==='reminder'){assert.equal(h.get(id).reminder.at,new Date('2026-10-22T18:30').toISOString());assert.equal(document.querySelector('dialog'),null);}
  else if(kind==='review'){assert.equal(h.get(id).reviewSchedule.nextDate,draft);assert.equal(document.querySelector('dialog'),null);}
  else{assert.equal(h.get(id).recurrence.interval,3);assert.equal(document.querySelector('.recurrence-editor'),null);await h.click(h.label('关闭',h.query('dialog')));}
 }finally{await h.close();}
});

for(const kind of ['reminder','review'])test(`${kind} late save cannot close a newer externally opened item dialog`,async()=>{
 const h=await appDom();let openItem;try{
  const id=h.add('旧编辑事项'),other=h.add('稍后打开的事项');window.journal.onOpenItem=callback=>{openItem=callback;return()=>{};};await h.mount();const flow=await openSchedule(h,id,kind),gate=holdCommand(flow.command);
  await h.click(h.button(flow.save,h.query('dialog')));await h.action(()=>openItem(other));assert.match(h.query('dialog').textContent,/稍后打开的事项/);
  await h.action(gate.finish);assert.match(h.query('dialog').textContent,/稍后打开的事项/);gate.restore();
  assert.ok(kind==='reminder'?h.get(id).reminder:h.get(id).reviewSchedule);
 }finally{await h.close();}
});

test('an existing repeat draft survives unrelated journal refreshes',async()=>{
 const h=await appDom();try{
  const id=h.add('每周整理'),other=h.add('另一事项');h.service.execute({type:'recurrence.set',payload:{id,rule:{mode:'calendar',unit:'week',interval:1,anchor:'2026-10-19',weekdays:[1],until:null}}});
  await h.mount();await h.click(h.label('事项'));await h.click(h.query(`[data-outline-id="${id}"]`));await h.click(h.query('.recurrence-heading button'));
  await h.input(h.label('重复间隔'),'4');await h.click(h.label('每周五'));await h.command({type:'tag.attach',payload:{id:other,name:'独立更新'}});
  assert.equal(h.label('重复间隔').value,'4');assert.equal(h.label('每周五').checked,true);await h.click(h.button('保存重复'));assert.equal(h.get(id).recurrence.interval,4);assert.deepEqual(h.get(id).recurrence.weekdays,[1,5]);
 }finally{await h.close();}
});

test('deadline popover blocks IME submit, pending changes and outside dismissal, then preserves failures',async()=>{
 const h=await appDom();try{
  const id=h.add('有截止的事项');await h.mount();await h.click(h.label('事项'));await h.click(h.query(`[data-outline-id="${id}"]`));await h.click(h.label('详情截止时间：未设置'));
  const input=h.label('详情截止时间');await h.input(input,'2026-11-05');let composing;
  await h.action(()=>{composing=new KeyboardEvent('keydown',{key:'Enter',isComposing:true,bubbles:true,cancelable:true});input.dispatchEvent(composing);});assert.equal(composing.defaultPrevented,true);assert.equal(h.get(id).dueAt,null);
  const gate=holdCommand('outline.patch');await h.action(()=>input.form.requestSubmit());assert.equal(input.matches(':disabled'),true);assert.equal(h.label('详情截止时间方式').matches(':disabled'),true);assert.equal(h.label('详情截止时间：未设置').disabled,true);
  await h.key(input,'Escape');await h.action(()=>document.body.dispatchEvent(new MouseEvent('pointerdown',{bubbles:true})));await h.action(()=>input.form.requestSubmit());assert.equal(gate.calls,1);assert.ok(h.query('.deadline-popover'));
  await h.action(()=>gate.fail('截止保存失败'));assert.equal(input.matches(':disabled'),false);assert.equal(input.value,'2026-11-05');assert.match(h.query('.deadline-popover [role=alert]').textContent,/截止保存失败/);
  gate.restore();await h.action(()=>input.form.requestSubmit());assert.equal(h.get(id).dueAt,'2026-11-05');assert.equal(document.querySelector('.deadline-popover'),null);
 }finally{await h.close();}
});

test('tag attachment protects the submitted name, reports failure and keeps next entry usable',async()=>{
 const h=await appDom();try{
  const id=h.add('带标签事项');await h.mount();await h.click(h.label('事项'));await h.click(h.query(`[data-outline-id="${id}"]`));const input=h.label('自定义标签');await h.input(input,'待保存标签');const gate=holdCommand('tag.attach');
  await h.action(()=>input.form.requestSubmit());assert.equal(input.readOnly,true);await h.input(input,'不应丢失的新输入');await h.action(()=>input.form.requestSubmit());assert.equal(gate.calls,1);assert.equal(input.value,'待保存标签');
  await h.action(()=>gate.fail('标签保存失败'));assert.equal(input.readOnly,false);assert.equal(input.value,'待保存标签');assert.match(h.query('.tag-editor [role=alert]').textContent,/标签保存失败/);
  gate.restore();await h.action(()=>input.form.requestSubmit());assert.equal(input.value,'');assert.equal(h.get(id).tagIds.length,1);await h.input(input,'第二个标签');await h.action(()=>input.form.requestSubmit());assert.equal(h.get(id).tagIds.length,2);
 }finally{await h.close();}
});

for(const kind of ['review','repeat'])test(`${kind} pending inspector save cannot replace another item's new scheduling draft`,async()=>{
 const h=await appDom();try{
  const first=h.add('先编辑的事项'),second=h.add('后来选择的事项');await h.mount();await h.click(h.label('事项'));await h.click(h.query(`[data-outline-id="${first}"]`));await h.click(h.query('.inspector-more-arrangements > summary'));
  if(kind==='review'){
   await h.click(h.query('.regular-review-settings > summary'));await h.click(h.label('开启定期审视'));await h.input(h.label('下次审视日期'),'2026-11-02');
  }else{await h.click(h.button('不重复'));await h.input(h.label('重复间隔'),'2');}
  const gate=holdCommand(kind==='review'?'item-review.configure':'recurrence.set');await h.click(h.button(kind==='review'?'保存审视安排':'保存重复'));
  await h.click(h.query(`[data-outline-id="${second}"]`));assert.match(h.query('.inspector-title').textContent,/后来选择的事项/);await h.click(h.query('.inspector-more-arrangements > summary'));
  if(kind==='review'){
   await h.click(h.query('.regular-review-settings > summary'));await h.click(h.label('开启定期审视'));await h.input(h.label('下次审视日期'),'2026-12-03');
  }else{await h.click(h.button('不重复'));await h.input(h.label('重复间隔'),'4');}
  await h.action(gate.finish);gate.restore();assert.match(h.query('.inspector-title').textContent,/后来选择的事项/);
  if(kind==='review'){assert.equal(h.label('下次审视日期').value,'2026-12-03');assert.equal(h.get(first).reviewSchedule.nextDate,'2026-11-02');assert.equal(h.get(second).reviewSchedule,null);}
  else{assert.equal(h.label('重复间隔').value,'4');assert.equal(h.get(first).recurrence.interval,2);assert.equal(h.get(second).recurrence??null,null);}
 }finally{await h.close();}
});
