import {test} from 'node:test';
import assert from 'node:assert/strict';
import {appDom} from './app-dom.mjs';
import {parseCapture} from '../core/capture.ts';

const last=h=>h.service.snapshot().state.tasks.at(-1);
const group=(h,title)=>h.service.execute({type:'outline.create',payload:{kind:'group',title,parentId:null}}).state.tasks.at(-1).id;
const input=h=>h.label('快速添加事项名称');
const captureKey='journal.today-capture.full app scenario tests';
const newDialog=async h=>{await h.key(document.body,'n',{ctrlKey:true});return h.query('dialog input[placeholder^="写下事项"]');};

test('automatic events finish as calendar records while task/note capture can explicitly stay unfiled or wait in inbox',async()=>{
 const h=await appDom();try{
  await h.mount();await h.input(input(h),'o 今天10:00-11:00 已明确会议');assert.match(h.query('.capture-preview').textContent,/记录到日历\/时间线 · 分组可选/);await h.key(input(h),'Enter');assert.equal(last(h).itemType,'event');assert.equal(last(h).parentId,null);assert.equal(h.service.snapshot().state.sessions.length,0);
  await h.input(input(h),'o 明天 再想想的活动');await h.input(h.label('保存去向'),'inbox');assert.match(h.query('.capture-parent').textContent,/稍后整理/);await h.key(input(h),'Enter');assert.equal(last(h).parentId,'inbox');
  for(const raw of ['无需分组的任务','- 无需分组的笔记']){await h.input(input(h),raw);await h.input(h.label('保存去向'),'unfiled');await h.key(input(h),'Enter');assert.equal(last(h).parentId,null);}
  await h.input(input(h),'默认待澄清任务');await h.key(input(h),'Enter');assert.equal(last(h).parentId,'inbox');
  await h.input(input(h),'- 默认待澄清笔记');await h.key(input(h),'Enter');assert.equal(last(h).parentId,'inbox');
 }finally{await h.close();}
});

test('destination overrides are honest, path edits restore auto, and failed/restored drafts keep destination and corrections',async()=>{
 const h=await appDom();try{
  const a=group(h,'甲分组'),b=group(h,'乙分组'),original=window.journal.command;let fail=true;
  window.journal.command=async command=>{if(command.type==='capture.create'&&fail)throw Error('保存去向测试失败');return original(command);};
  await h.mount();await h.input(input(h),'o 明天 会议 #甲分组');assert.equal(h.query('.capture-parent').textContent,'甲分组');await h.input(h.label('保存去向'),'inbox');assert.match(h.query('.capture-preview').textContent,/覆盖 #归属；原文保留/);assert.equal(input(h).value,'o 明天 会议 #甲分组');assert.match(h.query('.capture-parent').textContent,/收件箱/);
  await h.input(input(h),'o 明天 会议 #乙分组');assert.equal(h.label('保存去向').value,'auto');assert.equal(h.query('.capture-parent').textContent,'乙分组');await h.input(h.label('保存去向'),'unfiled');await h.click(h.button('修改预览'));await h.input(h.query('.capture-editor input'),'已校正会议');
  await h.key(input(h),'Enter');assert.match(h.query('.semantic-capture [role=alert]').textContent,/保存去向测试失败/);assert.equal(JSON.parse(window.localStorage.getItem(captureKey)).destination,'unfiled');
  await h.click(h.label('任务'));await h.click(h.label('今日'));assert.equal(h.label('保存去向').value,'unfiled');await h.click(h.button('修改预览'));assert.equal(h.query('.capture-editor input').value,'已校正会议');fail=false;await h.key(input(h),'Enter');assert.equal(last(h).parentId,null);assert.equal(last(h).title,'已校正会议');assert.equal(window.localStorage.getItem(captureKey),null);
  await h.input(input(h),'o 明天 按路径保存 #乙分组');assert.equal(h.label('保存去向').value,'auto');await h.key(input(h),'Enter');assert.equal(last(h).parentId,b);assert.ok(h.get(a));
 }finally{await h.close();}
});

test('generic create dialog uses type defaults, honours explicit root and scope, and gives a typed path precedence',async()=>{
 const h=await appDom();try{
  const a=group(h,'默认分组'),b=group(h,'路径分组');await h.mount();let title=await newDialog(h);await h.input(title,'o 明天 对话框事件');await h.click(h.button('保存事件'));assert.equal(last(h).parentId,null);
  title=await newDialog(h);await h.input(title,'明确根级任务');await h.input(h.label('放在何处'),'__root__');await h.click(h.button('保存事项'));assert.equal(last(h).parentId,null);
  title=await newDialog(h);await h.input(title,'o 明天 范围内事件');await h.input(h.label('放在何处'),a);assert.equal(h.query('dialog .capture-parent').textContent,'默认分组');await h.click(h.button('保存事件'));assert.equal(last(h).parentId,a);
  title=await newDialog(h);await h.input(title,'o 明天 路径优先 #路径分组');await h.input(h.label('放在何处'),a);assert.equal(h.query('dialog .capture-parent').textContent,'路径分组');await h.click(h.button('保存事件'));assert.equal(last(h).parentId,b);
 }finally{await h.close();}
});

test('calendar creation defaults to root and keeps manually chosen groups and semantic parent paths',async()=>{
 const h=await appDom();try{
  const a=group(h,'日历分组'),b=group(h,'日历路径');await h.mount();await h.click(h.label('日历'));
  for(const choice of ['root','manual','path']){await h.click(h.button('添加提醒'));await h.click([...h.label('添加内容').querySelectorAll('button')].find(button=>button.querySelector('strong')?.textContent==='添加事件'));assert.equal(h.label('放在何处').value,'__root__');await h.input(h.label('事件名称'),`日历事件${choice}${choice==='path'?' #日历路径':''}`);if(choice!=='root')await h.input(h.label('放在何处'),a);await h.click(h.button('保存事件'));assert.equal(last(h).parentId,choice==='root'?null:choice==='manual'?a:b);}
 }finally{await h.close();}
});

test('an existing inbox event stays until explicit organize, saving current edits without changing identity, dates or children',async()=>{
 const h=await appDom();try{
  const draft=parseCapture('o 今天10:00-11:00 旧会议',h.service.snapshot().now).draft;
  const event=h.service.execute({type:'capture.create',payload:{destination:'inbox',draft}}).state.tasks.at(-1),child=h.add('事件下的原有内容',event.id),original=window.journal.command;let fail=true;
  window.journal.command=async command=>{if(command.type==='inbox.organize'&&fail)throw Error('整理事件失败');return original(command);};await h.mount();assert.equal(h.get(event.id).parentId,'inbox');await h.click(h.label('收件箱'));await h.input(h.label('收件箱条目名称'),'校正后的旧会议');await h.input(h.label('收件箱条目正文'),'保留这次编辑');await h.click(h.button('保存并移出收件箱'));assert.equal(h.get(event.id).parentId,'inbox');assert.equal(h.label('收件箱条目名称').value,'校正后的旧会议');assert.match(h.query('.inbox-editor [role=alert]').textContent,/整理事件失败/);
  fail=false;await h.click(h.button('保存并移出收件箱'));const saved=h.get(event.id);assert.equal(saved.parentId,null);assert.equal(saved.itemType,'event');assert.equal(saved.title,'校正后的旧会议');assert.equal(saved.description,'保留这次编辑');assert.equal(saved.eventAt,event.eventAt);assert.equal(saved.eventEnd,event.eventEnd);assert.equal(h.get(child).parentId,event.id);assert.match(h.label('收件箱内容').textContent,/没有待澄清内容/);
 }finally{await h.close();}
});
