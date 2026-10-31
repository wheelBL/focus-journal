import {localDate} from '../core/types';
/** Production renderer checks for the combined workflow optimization. Uses isolated fixture data. */
export async function checkWorkflowPolish({win,js,click,button,key,input,capture,check,settle,until,service}:any){
 await click('.top-navigation [aria-label=事项]');await button('全部事项','.context-nav');await settle();
 const task=service.snapshot().state.tasks.find((t:any)=>t.title==='核对拖拽后的归属');
 const row=`[data-outline-id="${task.id}"]`;
 await click(row+' .tree-title>.editable-value');await key('F2');await until(`!!document.querySelector(${JSON.stringify(row+' .inline-editor input')})`);
 await input(row+' .inline-editor input','核对拖拽后的归属 · 键盘验证');await key('Enter');await settle();
 check(await js(`document.activeElement?.dataset.outlineId===${JSON.stringify(task.id)}`),'行内改名保存后焦点回到当前事项');
 await js(`document.addEventListener('keydown',event=>{window.__qaLastKey=event.key;},{capture:true})`);
 await key('Down');check(await js(`window.__qaLastKey==='ArrowDown'&&!!document.activeElement?.dataset.outlineId&&document.activeElement.dataset.outlineId!==${JSON.stringify(task.id)}`),'改名后方向键继续选择下一事项');
 await button('内容','.task-inspector');await key('Right');
 check(await js(`document.activeElement?.getAttribute('role')==='tab'&&document.activeElement.textContent.includes('投入')&&document.activeElement.getAttribute('aria-selected')==='true'`),'详情页签支持方向键并正确移动焦点');
 await key('End');check(await js(`document.activeElement.textContent.includes('复盘')&&document.querySelector('.inspector-review')`),'详情页签 End 到达复盘');await capture('14-keyboard-details');
 await click('.top-navigation [aria-label=日历]');await settle();
 await js(`(()=>{const el=document.querySelector('.calendar-scroll');el.scrollTop=17*48;el.dispatchEvent(new Event('scroll'));})()`);await settle();
 const saved=await js(`document.querySelector('.calendar-scroll').scrollTop`);
 await click('.top-navigation [aria-label=事项]');await click('.top-navigation [aria-label=日历]');await settle();
 check(await js(`Math.abs(document.querySelector('.calendar-scroll').scrollTop-${saved})<2`),'离开日历再返回保持查看时段');
 await click('[aria-label="定位当前时刻"]');await settle();
 check(await js(`document.querySelector('[aria-label="查看日期"]').value===${JSON.stringify(localDate(service.snapshot().now))}`),'日历现在入口返回当天');
 check(await js(`(()=>{const line=document.querySelector('.calendar-now-line').getBoundingClientRect(),pane=document.querySelector('.calendar-scroll').getBoundingClientRect();return line.top>=pane.top&&line.top<=pane.bottom;})()`),'定位现在后当前时间线在可见范围内');
 await capture('15-calendar-now');
 for(const width of [1000,800]){win.setContentSize(width,800);await settle();check(await js(`document.documentElement.scrollWidth<=innerWidth+1`),`${width}px 日历新增入口无横向溢出`);await capture(`16-calendar-${width}`);}
 win.setContentSize(1440,940);await settle();await click('.top-navigation [aria-label=回顾]');await button('投入复盘');await settle();
 check(await js(`document.querySelector('.review-result-count')&&document.querySelector('.review-summary')`),'投入复盘展示结果数量和完整统计');await capture('17-effort-review');
}
