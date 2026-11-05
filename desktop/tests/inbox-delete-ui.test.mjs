import {test} from 'node:test';
import assert from 'node:assert/strict';
import {appDom} from './app-dom.mjs';

const current=h=>h.label('收件箱条目名称').value;
const row=(h,title)=>[...h.label('收件箱内容').querySelectorAll('button')].find(el=>el.querySelector('strong')?.textContent===title);
const open=async h=>{await h.mount();await h.click(h.label('收件箱'));};
const ask=async h=>h.click(h.label('删除当前收件箱条目'));
const confirm=async h=>h.click(h.button('确认移入回收站',h.query('dialog')));
const remove=async h=>{await ask(h);await confirm(h);};
function commands(){const original=window.journal.command,seen=[];window.journal.command=c=>{seen.push(c);return original(c);};return seen;}
function gateDelete(){const original=window.journal.command;let resolve,reject,calls=0;window.journal.command=c=>c.type==='item.change'&&c.payload.action==='delete'?(calls++,new Promise((yes,no)=>{resolve=()=>yes(original(c));reject=no;})):original(c);return {get calls(){return calls;},resolve:()=>resolve(),reject:()=>reject(Error('回收站暂不可写')),restore:()=>{window.journal.command=original;}};}

test('Inbox delete is visible, confirms outside the editor and cancels without saving drafts',async()=>{
 const h=await appDom();try{
  const id=h.add('原始标题');await open(h);const seen=commands();await h.input(h.label('收件箱条目名称'),'未提交标题');await h.input(h.label('收件箱条目正文'),'未提交正文');await ask(h);
  const dialog=h.query('dialog');assert.equal(dialog.closest('form,fieldset'),null);assert.match(dialog.textContent,/结束并保存相关计时/);assert.equal(h.label('删除当前收件箱条目').disabled,true);await h.key(h.button('确认移入回收站',dialog),'Enter',{ctrlKey:true});assert.equal(seen.length,0);
  await h.click(h.button('返回',dialog));assert.equal(document.querySelector('dialog'),null);assert.equal(current(h),'未提交标题');assert.equal(h.label('收件箱条目正文').value,'未提交正文');assert.equal(h.get(id).title,'原始标题');assert.equal(h.get(id).description,'');assert.equal(h.get(id).deletedAt,null);assert.ok(document.activeElement===h.label('删除当前收件箱条目'),'cancel should restore delete-button focus');assert.equal(seen.length,0);
  await h.input(h.label('收件箱条目名称'),'');await remove(h);assert.ok(h.get(id).deletedAt);assert.equal(h.get(id).title,'原始标题');await h.click(h.button('恢复刚删除的内容'));assert.equal(current(h),'');assert.equal(h.label('收件箱条目正文').value,'未提交正文');
 }finally{await h.close();}
});

test('deleting a middle entry follows capture order, last entry goes to its predecessor, and empty Inbox stays empty',async()=>{
 const h=await appDom();try{
  const a=h.add('第一条'),b=h.add('中间条'),c=h.add('最后条');await open(h);await h.click(row(h,'中间条'));const seen=commands();await remove(h);assert.equal(current(h),'最后条');assert.ok(document.activeElement===h.label('收件箱条目名称'),'next editor should receive focus');assert.equal(h.get(b).status,'open');assert.ok(h.get(b).deletedAt);assert.equal(seen[0].meta.entry,'inbox.delete');assert.match(h.query('.inbox-delete-notice').textContent,/中间条/);
  await remove(h);assert.equal(current(h),'第一条');assert.ok(h.get(c).deletedAt);await remove(h);assert.equal(document.querySelector('[aria-label="整理收件箱条目"]'),null);assert.match(h.label('收件箱内容').textContent,/没有待澄清内容/);assert.ok(h.get(a).deletedAt);await h.click(h.button('恢复刚删除的内容'));assert.equal(current(h),'第一条');assert.equal(h.get(a).deletedAt,null);
 }finally{await h.close();}
});

test('failure and duplicate confirmation retain the draft and selection until a successful retry',async()=>{
 const h=await appDom();try{
  const a=h.add('等待删除'),b=h.add('下一条');await open(h);await h.input(h.label('收件箱条目名称'),'不会隐式保存');await h.input(h.label('收件箱条目正文'),'保留失败草稿');const gate=gateDelete();await ask(h);const button=h.button('确认移入回收站',h.query('dialog'));await h.click(button);await h.click(button);assert.equal(gate.calls,1);assert.equal(h.button('返回',h.query('dialog')).disabled,true);assert.equal(current(h),'不会隐式保存');assert.equal(h.get(a).deletedAt,null);
  await h.action(gate.reject);assert.match(h.query('dialog [role="alert"]').textContent,/暂不可写/);assert.equal(current(h),'不会隐式保存');assert.equal(h.label('收件箱条目正文').value,'保留失败草稿');assert.equal(h.get(a).title,'等待删除');gate.restore();await confirm(h);assert.equal(current(h),'下一条');assert.equal(h.get(a).title,'等待删除');assert.equal(h.get(a).description,'');assert.equal(h.get(b).deletedAt,null);await h.click(h.button('恢复刚删除的内容'));assert.equal(current(h),'不会隐式保存');assert.equal(h.label('收件箱条目正文').value,'保留失败草稿');
 }finally{await h.close();}
});

test('late deletion and restoration results preserve a newer selection and its editor focus',async()=>{
 const h=await appDom();try{
  h.add('第一条');const b=h.add('被删中间条');h.add('下一条');h.add('用户后来选的');await open(h);await h.click(row(h,'被删中间条'));const gate=gateDelete();await ask(h);await confirm(h);await h.click(row(h,'用户后来选的'));await h.input(h.label('收件箱条目正文'),'这条正在编辑');const field=h.label('收件箱条目正文');await h.action(()=>field.focus());await h.action(gate.resolve);assert.ok(h.get(b).deletedAt);assert.equal(current(h),'用户后来选的');assert.equal(h.label('收件箱条目正文').value,'这条正在编辑');assert.ok(document.activeElement===field,'newer editor focus is preserved');gate.restore();
  const original=window.journal.command;let release;window.journal.command=c=>c.type==='item.change'&&c.payload.action==='restore'?new Promise(yes=>{release=()=>yes(original(c));}):original(c);await h.click(h.button('恢复刚删除的内容'));await h.click(row(h,'下一条'));const next=h.label('收件箱条目名称');await h.action(()=>next.focus());await h.action(release);assert.equal(current(h),'下一条');assert.ok(document.activeElement===next,'newer selection focus is preserved');assert.equal(h.get(b).deletedAt,null);
 }finally{await h.close();}
});

test('whole-branch delete ends timers, preserves effort and restores its own branch without undoing other edits',async()=>{
 const h=await appDom();try{
  const parent=h.add('含历史投入的分支'),child=h.add('运行中的子项',parent),old=h.add('早已删除的子项',parent),next=h.add('后续捕获');h.service.execute({type:'session.manual',payload:{taskId:parent,date:'2026-10-18',minutes:3,summary:'历史成果'}});h.service.execute({type:'item.change',payload:{id:old,action:'delete',confirmBranch:true}});h.clock.advance(1000);h.service.execute({type:'focus.start',payload:{taskId:child}});const sessionId=h.service.snapshot().timers[0].sessionId;h.clock.advance(90000);
  await open(h);await h.input(h.label('收件箱条目名称'),'没有提交的新名称');await h.input(h.label('收件箱条目正文'),'本地正文草稿');await ask(h);assert.match(h.query('dialog .info-line').textContent,/涉及 3 个事项.*1 个计时器/);await confirm(h);const deleted=h.service.snapshot(),ended=deleted.state.sessions.find(s=>s.id===sessionId);assert.equal(current(h),'后续捕获');assert.equal(deleted.timers.length,0);assert.equal(ended.status,'ended');assert.equal(h.get(child).deletedAt,h.get(parent).deletedAt);assert.equal(h.get(parent).status,'open');const history=structuredClone(deleted.state.sessions);
  await h.command({type:'outline.patch',payload:{id:next,field:'title',value:'别处后来修改'}});const seen=commands();await h.click(h.button('恢复刚删除的内容'));assert.equal(h.get(parent).deletedAt,null);assert.equal(h.get(child).deletedAt,null);assert.ok(h.get(old).deletedAt);assert.equal(h.get(child).parentId,parent);assert.deepEqual(h.service.snapshot().state.sessions,history);assert.equal(h.service.snapshot().timers.length,0);assert.equal(h.get(next).title,'别处后来修改');assert.equal(h.get(parent).title,'含历史投入的分支');assert.equal(current(h),'没有提交的新名称');assert.equal(h.label('收件箱条目正文').value,'本地正文草稿');assert.equal(seen.at(-1).type,'item.change');assert.equal(seen.at(-1).meta.entry,'inbox.restore');
 }finally{await h.close();}
});

test('external removal while confirming is safe, and leaving the page before success does not steal focus',async()=>{
 const h=await appDom();try{
  const a=h.add('外部移走');h.add('保留');await open(h);await ask(h);await h.command({type:'outline.move',payload:{id:a,targetId:null,position:'root'}});assert.match(h.query('dialog').textContent,/已离开收件箱/);assert.equal(h.button('确认移入回收站',h.query('dialog')).disabled,true);await h.click(h.button('返回',h.query('dialog')));assert.equal(h.get(a).deletedAt,null);
  const gate=gateDelete();await ask(h);await confirm(h);await h.click(h.label('今日'));const focus=h.label('快速添加事项名称');await h.action(()=>focus.focus());await h.action(gate.resolve);assert.ok(document.activeElement===focus,'other page focus is preserved');assert.equal(document.querySelector('.inbox-page'),null);gate.restore();await h.click(h.label('收件箱'));assert.match(h.query('.inbox-delete-notice').textContent,/保留/);assert.ok(h.button('恢复刚删除的内容'));
 }finally{await h.close();}
});


test('next selection uses the actual remaining Inbox, including new captures during a pending delete',async()=>{
 const h=await appDom();try{
  h.add('前一条');const target=h.add('当前末条');await open(h);await h.click(row(h,'当前末条'));const gate=gateDelete();await ask(h);await confirm(h);h.clock.advance(1000);const captured=h.add('删除期间新捕获');await h.action(gate.resolve);assert.ok(h.get(target).deletedAt);assert.equal(current(h),'删除期间新捕获');assert.equal(h.get(captured).deletedAt,null);gate.restore();
 }finally{await h.close();}
});

test('external deletion while confirming is safe and a failed restore remains retryable without restoring other trash',async()=>{
 const h=await appDom();try{
  const external=h.add('外部删除的'),own=h.add('本次删除的');await open(h);await ask(h);await h.command({type:'item.change',payload:{id:external,action:'delete',confirmBranch:true}});assert.equal(h.button('确认移入回收站',h.query('dialog')).disabled,true);await h.click(h.button('返回',h.query('dialog')));assert.equal(current(h),'本次删除的');await h.input(h.label('收件箱条目正文'),'恢复后继续编辑');await remove(h);
  const original=window.journal.command;let reject,calls=0;window.journal.command=c=>c.type==='item.change'&&c.payload.action==='restore'?(calls++,new Promise((_,no)=>{reject=no;})):original(c);const button=h.button('恢复刚删除的内容');await h.click(button);await h.click(button);assert.equal(calls,1);await h.action(()=>reject(Error('恢复暂不可用')));assert.match(h.query('.inbox-delete-notice [role="alert"]').textContent,/暂不可用/);assert.ok(h.get(own).deletedAt);window.journal.command=original;await h.click(h.button('恢复刚删除的内容'));assert.equal(h.get(own).deletedAt,null);assert.ok(h.get(external).deletedAt);assert.equal(h.label('收件箱条目正文').value,'恢复后继续编辑');
 }finally{await h.close();}
});

test('a middle deletion finishing after navigation resumes at the next capture when Inbox is reopened',async()=>{
 const h=await appDom();try{
  h.add('第一条保留');h.add('中间条待删');h.add('正确的下一条');await open(h);await h.click(row(h,'中间条待删'));const gate=gateDelete();await ask(h);await confirm(h);await h.click(h.label('今日'));await h.action(gate.resolve);gate.restore();await h.click(h.label('收件箱'));assert.equal(current(h),'正确的下一条');assert.match(h.query('.inbox-delete-notice').textContent,/中间条待删/);
 }finally{await h.close();}
});
