import {test} from 'node:test';
import assert from 'node:assert/strict';
import {appDom} from './app-dom.mjs';

test('capture, nested work, switching, lifecycle and period review form a coherent full-app workflow',async t=>{
 const h=await appDom(),{service:s,clock,add,get,query,label,button,click,input,key,context,command}=h;
 const project=add('交付项目',null),parent=add('整理接口',project),child=add('校验字段',parent),future=add('下周开始也能提前做',project,{plannedDate:'2026-10-26',dueAt:'2026-10-27'}),destination=add('新归属',null);
 s.execute({type:'outline.patch',payload:{id:project,field:'isProject',value:true}});s.execute({type:'outline.patch',payload:{id:destination,field:'isProject',value:true}});s.execute({type:'tag.attach',payload:{id:child,name:'交付'}});
 await h.mount();let quick;
 try{
  await t.test('title-only capture starts immediately and switching saves other effort without completing it',async()=>{
   await key(window,'n',{ctrlKey:true});await input(query('dialog input[maxlength="120"]'),'先动手五分钟');assert.equal(query('.capture-options').open,false);await click(button('保存并开始',query('dialog')));quick=s.snapshot().state.tasks.find(t=>t.title==='先动手五分钟').id;assert.equal(get(quick).estimateMinutes,null);assert.equal(s.snapshot().timers[0].taskId,quick);assert.equal(get(quick).plannedDate,null);
   clock.advance(50000);await key(window,'n',{ctrlKey:true});await input(query('dialog input[maxlength="120"]'),'转去核对');assert.equal(label('新事项计时方式').value,'switch');await click(button('保存并开始',query('dialog')));assert.equal(get(quick).status,'open');assert.equal(s.snapshot().state.sessions[0].durationMs,50000);assert.equal(s.snapshot().state.sessions[0].status,'ended');assert.equal(s.snapshot().timers.length,1);
  });
  await t.test('future plan can start now and explicit switching is distinct from parallel start',async()=>{
   await click(label('事项'));await click(label('开始下周开始也能提前做',query('[role=tree]')));assert.equal(s.snapshot().timers.filter(t=>!t.paused).length,2);assert.equal(get(future).plannedDate,'2026-10-26');assert.match(query('.toast').textContent,/每次只做一件/);
   await context(label('校验字段',query('[role=tree]')));await click(button('切换计时到此项',query('[role=menu]')));assert.equal(s.snapshot().timers.filter(t=>!t.paused).length,1);assert.equal(s.snapshot().timers[0].taskId,child);assert.equal(get(future).status,'open');
  });
  await t.test('flat results keep paths and automatic sorting still permits a structural drag with history intact',async()=>{
   await click(label('平铺视图'));assert.equal(label('校验字段',query('[role=tree]')).getAttribute('aria-level'),'1');assert.match(query('.flat-path',label('校验字段',query('[role=tree]'))).textContent,/交付项目.*整理接口/);
   await click(button('筛选'));await input(label('视图排序'),'title');const source=label('整理接口',query('[role=tree]')),target=label('新归属',query('[role=tree]')),grip=label('拖动整理接口',source);
   document.elementFromPoint=()=>target;target.getBoundingClientRect=()=>({left:0,top:100,width:600,height:44,bottom:144,right:600,x:0,y:100,toJSON(){}});
   const pointer=(type,x,y)=>h.action(()=>{const e=new MouseEvent(type,{bubbles:true,cancelable:true,button:0,clientX:x,clientY:y});Object.defineProperty(e,'pointerId',{value:1});grip.dispatchEvent(e);});clock.advance(60000);await pointer('pointerdown',20,20);await pointer('pointermove',200,101);await pointer('pointerup',200,101);
   assert.equal(get(parent).parentId,destination);assert.equal(get(child).projectId,destination);assert.equal(s.snapshot().timers[0].taskId,child);assert.equal(s.snapshot().timers[0].durationMs,60000);assert.equal(get(child).tagIds.length,1);
   await click(label('撤销整理操作'));assert.equal(get(parent).parentId,project);assert.equal(s.snapshot().timers[0].durationMs,60000);await click(label('树形视图'));await click(button('清除筛选'));
  });
  await t.test('parent close requires an impact choice; saved time survives cancel, undo, trash and restoration',async()=>{
   await click(label('完成整理接口',query('[role=tree]')));let d=query('dialog');assert.match(d.textContent,/涉及 2 个事项/);assert.equal(button('确认完成事项',d).disabled,true);await input(label('处理未结束子项',d),'cancelled');await click(button('确认完成事项',d));assert.equal(get(parent).status,'done');assert.equal(get(child).status,'cancelled');assert.equal(s.snapshot().timers.length,0);assert.equal(s.snapshot().state.sessions.find(x=>x.taskId===child).durationMs,60000);
   await click(button('撤销状态调整',query('.outline-tools')));assert.equal(get(parent).status,'open');assert.equal(get(child).status,'open');assert.equal(s.snapshot().timers.length,0);
   await context(label('整理接口',query('[role=tree]')));await click(button('移入回收站',query('[role=menu]')));d=query('dialog');assert.match(d.textContent,/原层级、日期、标签和历史投入保留/);await click(button('确认移入回收站',d));assert.ok(get(parent).deletedAt);await click(button('回收站'));assert.ok(label('校验字段',query('[role=tree]')));
   await context(label('整理接口',query('[role=tree]')));await click(button('恢复整支',query('[role=menu]')));await click(button('确认从回收站恢复',query('dialog')));assert.equal(get(parent).deletedAt,null);assert.equal(get(child).parentId,parent);assert.equal(s.snapshot().timers.length,0);await click(button('回收站'));
  });
  await t.test('global search locates the item in its hierarchy and remaining estimate keeps unknown initial effort honest',async()=>{
   await input(label('搜索任务和笔记'),'校验字段');await click(button('校验字段',query('.main')));let d=query('dialog');assert.match(d.textContent,/初始估计.*未记录/);await click(button('调整剩余估计',d));await input(label('当前估计剩余'),'20');await click(button('保存调整',query('dialog')));assert.equal(get(child).estimateMinutes,null);assert.equal(s.snapshot().state.estimates.at(-1).remainingMinutes,20);
   await click(button('校验字段',query('.main')));await click(button('在事项中定位',query('dialog')));assert.equal(label('校验字段',query('[role=tree]')).getAttribute('aria-selected'),'true');assert.match(query('.node-breadcrumb').textContent,/交付项目.*整理接口/);
  });
  await t.test('period review filters project and tag, separates completion/cancellation, and can plan a next step',async()=>{
   await command({type:'task.status',payload:{id:child,status:'done'}});await command({type:'session.manual',payload:{taskId:future,date:'2026-10-19',minutes:20}});await command({type:'task.status',payload:{id:future,status:'cancelled'}});
   await click(label('回顾'));await click(button('投入复盘'));await input(label('回顾范围'),project);await input(label('回顾标签'),get(child).tagIds[0]);assert.ok(button('校验字段',query('.review-page')));assert.equal(document.querySelectorAll('.review-row').length,1);assert.match(query('.review-summary').textContent,/1.*件事期间完成/);assert.match(query('.review-page').textContent,/没有记录不表示没有推进/);
   await input(label('回顾标签'),'all');await click(button('已取消'));assert.ok(button('下周开始也能提前做',query('.review-row')));assert.equal(document.querySelectorAll('.review-row').length,1);await click(button('修改计划',query('.review-row')));assert.match(query('dialog').textContent,/计划开始与截止时间/);await click(button('取消',query('dialog')));await click(button('全部推进'));assert.ok(button('校验字段',query('.review-page')));
  });
 }finally{await h.close();}
});
