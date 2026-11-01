import {test} from 'node:test';
import assert from 'node:assert/strict';
import {appDom} from './app-dom.mjs';
test('context menu creates nested groups and converts tasks without execution controls',async()=>{
 const h=await appDom(),{add,get,service,mount,click,key,input,label,query,button,context}=h;
 const id=add('原事项');try{await mount();await click(label('事项'));let row=()=>query(`[data-outline-id="${id}"]`);await context(row());await click(button('转为分组…'));assert.equal(get(id).itemType,'group');assert.equal(row().querySelector('input[type="checkbox"]'),null);assert.equal(row().querySelector('.row-start'),null);await click(row());assert.match(query('.task-inspector').textContent,/分组详情/);await context(row());await click(button('新增子分组'));await input(label('新事项名称'),'内部分组');await key(label('新事项名称'),'Enter',{ctrlKey:true});const child=service.snapshot().state.tasks.at(-1);assert.equal(child.parentId,id);assert.equal(child.itemType,'group');assert.equal(query(`[data-outline-id="${child.id}"]`).querySelector('input[type="checkbox"]'),null);await context(row());await click(button('转为事项'));assert.equal(get(id).itemType,'task');}finally{await h.close();}
});
