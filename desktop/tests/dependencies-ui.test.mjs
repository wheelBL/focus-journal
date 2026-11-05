import {test} from 'node:test';
import assert from 'node:assert/strict';
import {appDom} from './app-dom.mjs';
const row=(h,id)=>h.query(`[data-outline-id="${id}"]`);
test('inline predecessor save, cascade, fixed deadline and cancellation preserve actual dates',async()=>{
 const h=await appDom();try{
 const a=h.add('前置A',null,{dueAt:'2026-11-03'}),b=h.add('后续B',null,{dueAt:'2026-11-04'});
 await h.mount();await h.click(h.label('任务'));await h.click(row(h,b));
 await h.click(h.button('添加前置任务'));await h.input(h.label('搜索前置任务'),'前置A');await h.click(h.query('.dependency-options button'));await h.click(h.button('保存依赖'));
 assert.equal(h.get(b).dependencyPlan.predecessors[0].id,a);assert.match(h.query('.dependency-editor').textContent,/等待前置/);
 await h.command({type:'outline.patch',payload:{id:a,field:'dueAt',value:'2026-11-06'}});assert.equal(h.get(b).dueAt,'2026-11-07');assert.equal(h.get(b).completedAt,null);
 await h.input(h.label('依赖截止安排'),'fixed');await h.click(h.button('取消依赖修改'));assert.equal(h.get(b).dependencyPlan.mode,'follow');
 await h.input(h.label('依赖截止安排'),'fixed');await h.click(h.button('保存依赖'));await h.command({type:'outline.patch',payload:{id:a,field:'dueAt',value:'2026-11-09'}});assert.equal(h.get(b).dueAt,'2026-11-07');assert.match(h.query('.dependency-editor').textContent,/固定截止/);
 }finally{await h.close();}
});
test('batch chain previews adjustable order and commits once; invalid selection is explicit',async()=>{
 const h=await appDom();try{
 const a=h.add('链A',null,{dueAt:'2026-11-03'}),b=h.add('链B',null,{dueAt:'2026-11-04'}),c=h.add('链C',null,{dueAt:'2026-11-05'});
 await h.mount();await h.click(h.label('任务'));await h.click(row(h,a));await h.action(()=>row(h,b).dispatchEvent(new MouseEvent('click',{bubbles:true,ctrlKey:true})));await h.action(()=>row(h,c).dispatchEvent(new MouseEvent('click',{bubbles:true,ctrlKey:true})));
 await h.click(h.button('按顺序建立依赖…'));assert.equal(h.get(b).dependencyPlan,undefined);await h.click(h.label('下移第 1 项'));await h.click(h.button('取消'));assert.equal(h.get(a).dependencyPlan,undefined);
 await h.click(h.button('按顺序建立依赖…'));const byTitle=new Map([a,b,c].map(id=>[h.get(id).title,id])),order=[...document.querySelectorAll('.dependency-chain strong')].map(el=>byTitle.get(el.textContent));await h.click(h.button('确认建立依赖'));assert.equal(h.get(order[1]).dependencyPlan.predecessors[0].id,order[0]);assert.equal(h.get(order[2]).dependencyPlan.predecessors[0].id,order[1]);
 }finally{await h.close();}
});

test('failure keeps dependency draft and related navigation returns to edit; waiting permits start',async()=>{
 const h=await appDom();try{
 const a=h.add('前置可返回',null,{dueAt:'2026-11-03'}),b=h.add('编辑草稿',null,{dueAt:'2026-11-04'});
 await h.mount();await h.click(h.label('任务'));await h.click(row(h,b));await h.click(h.button('添加前置任务'));await h.input(h.label('搜索前置任务'),'前置可返回');await h.click(h.query('.dependency-options button'));
 const original=window.journal.command;window.journal.command=async c=>{if(c.type==='dependency.set')throw Error('模拟保存失败');return original(c);};await h.click(h.button('保存依赖'));assert.match(h.query('.dependency-editor').textContent,/模拟保存失败/);assert.equal(h.label('搜索前置任务').value,'前置可返回');assert.equal(h.get(b).dependencyPlan,undefined);
 await h.click(h.button('前置可返回',h.query('.dependency-editor')));await h.click(h.button('← 返回原内容'));assert.equal(h.label('搜索前置任务').value,'前置可返回');window.journal.command=original;await h.click(h.button('保存依赖'));
 await h.command({type:'focus.start',payload:{taskId:b,skipEstimate:true}});assert.ok(h.service.snapshot().timers.some(t=>t.taskId===b));
 }finally{await h.close();}
});
test('stale moved tasks invalidate the exact preview scope',async()=>{
 const h=await appDom();try{
 const group=h.service.execute({type:'outline.create',payload:{title:'目标分组',kind:'group',parentId:null}}).state.tasks.at(-1).id,a=h.add('所选任务',null),b=h.add('会移动',null);
 await h.mount();await h.click(h.label('任务'));await h.click(row(h,a));await h.action(()=>row(h,b).dispatchEvent(new MouseEvent('click',{bubbles:true,ctrlKey:true})));await h.click(h.button('按顺序建立依赖…'));await h.command({type:'outline.move',payload:{id:b,targetId:group,position:'inside'}});assert.match(h.query('dialog[open]').textContent,/已移动/);assert.equal(h.button('确认建立依赖').disabled,true);assert.equal(h.get(b).dependencyPlan,undefined);
 }finally{await h.close();}
});
test('dependency draft survives details tabs, group selection and page navigation',async()=>{
 const h=await appDom();try{
 const a=h.add('持久前置',null),b=h.add('持久草稿',null),group=h.service.execute({type:'outline.create',payload:{title:'切换分组',kind:'group',parentId:null}}).state.tasks.at(-1).id;
 await h.mount();await h.click(h.label('任务'));await h.click(row(h,b));await h.click(h.button('添加前置任务'));await h.input(h.label('搜索前置任务'),'持久前置');await h.click(h.query('.dependency-options button'));
 await h.click(h.button('复盘'));await h.click(h.button('内容'));assert.equal(h.label('搜索前置任务').value,'持久前置');await h.click(row(h,group));await h.click(row(h,b));assert.equal(h.label('搜索前置任务').value,'持久前置');await h.click(h.label('今日'));await h.click(h.label('任务'));await h.click(row(h,b));assert.equal(h.label('搜索前置任务').value,'持久前置');assert.equal(h.get(b).dependencyPlan,undefined);await h.click(h.button('保存依赖'));assert.equal(h.get(b).dependencyPlan.predecessors[0].id,a);
 }finally{await h.close();}
});

test('saving main detail preserves a separately edited related task draft',async()=>{
 const h=await appDom();try{
 const a=h.add('关联前置A',null),b=h.add('主详情B',null),c=h.add('另一个前置C',null);
 await h.mount();await h.click(h.label('任务'));await h.click(row(h,b));await h.click(h.button('添加前置任务'));await h.input(h.label('搜索前置任务'),'关联前置A');await h.click(h.query('.dependency-options button'));await h.click(h.button('关联前置A',h.query('.dependency-editor')));
 const related=h.query('.related-detail');await h.click(h.button('添加前置任务',related));await h.input(h.label('搜索前置任务',related),'另一个前置C');await h.click(h.query('.dependency-options button',related));await h.click(h.button('← 返回原内容'));await h.click(h.button('保存依赖'));assert.equal(h.get(b).dependencyPlan.predecessors[0].id,a);assert.equal(h.get(a).dependencyPlan,undefined);
 await h.click(h.button('关联前置A',h.query('.dependency-editor')));const returned=h.query('.related-detail');assert.equal(h.label('搜索前置任务',returned).value,'另一个前置C');assert.match(h.query('.dependency-editor',returned).textContent,/另一个前置C/);await h.click(h.button('保存依赖',returned));assert.equal(h.get(a).dependencyPlan.predecessors[0].id,c);
 }finally{await h.close();}
});
test('predecessor search excludes unavailable branches and closed responsibilities while preserving selected relations',async()=>{
 const h=await appDom();try{
 const target=h.add('编辑目标',null),selected=h.add('已选随后取消',null),cancelled=h.add('取消候选',null),handed=h.add('交接候选',null),done=h.add('完成候选',null);
 const parent=h.service.execute({type:'project.save',payload:{name:'归档项目'}}).state.tasks.at(-1).id,hidden=h.add('归档分支完成任务',parent);
 h.service.execute({type:'dependency.set',payload:{id:target,predecessorIds:[selected]}});
 for(const id of [selected,cancelled])h.service.execute({type:'task.status',payload:{id,status:'cancelled'}});
 h.service.execute({type:'item.handoff',payload:{id:handed,assignee:'同事'}});
 for(const id of [done,hidden])h.service.execute({type:'task.status',payload:{id,status:'done'}});
 h.service.execute({type:'project.archive',payload:{id:parent}});
 await h.mount();await h.click(h.label('任务'));await h.click(row(h,target));await h.click(h.button('编辑前置任务'));
 const options=h.query('.dependency-options');assert.match(options.textContent,/完成候选/);for(const title of ['取消候选','交接候选','归档分支完成任务'])assert.equal(options.textContent.includes(title),false);assert.match(h.query('.dependency-editor ul').textContent,/已选随后取消/);assert.equal(h.get(hidden).archived,false);
 }finally{await h.close();}
});
