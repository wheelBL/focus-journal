import {localDate} from '../core/types';

/** Native pointer/keyboard checks against the bundled renderer, using only the QA service. */
export async function checkWorkspaceContinuity({win,js,click,button,key,input,capture,check,settle,until,service}:any){
 const first=service.execute({type:'task.save',payload:{title:'核对审视草稿连续性'}}).state.tasks.at(-1).id;
 const second=service.execute({type:'task.save',payload:{title:'确认下一项工作安排'}}).state.tasks.at(-1).id;
 for(const id of [first,second])service.execute({type:'item-review.configure',payload:{id,enabled:true,nextDate:localDate(service.snapshot().now),interval:{unit:'weeks',count:1}}});
 win.webContents.send('journal:changed');await settle();await click('.top-navigation [aria-label=回顾]');await until(`!!document.querySelector('.review-module')`);await click('.context-nav button:first-child');await until(`!!document.querySelector('[aria-label="审视说明"]')`);
 await js(`(()=>{const el=[...document.querySelectorAll('.review-queue button')].find(e=>e.querySelector('strong')?.textContent==='核对审视草稿连续性');el.dataset.qaReview='first';})()`);await click('[data-qa-review=first]');
 await click('.review-optional > summary');await input('[aria-label="审视说明"]','先确认依赖，明天继续；这是一段未提交的思考。');
 await click('.top-navigation [aria-label=今日]');await click('.top-navigation [aria-label=回顾]');await settle();
 check(await js(`document.querySelector('[aria-label="审视说明"]').value==='先确认依赖，明天继续；这是一段未提交的思考。'`),'审视说明离开页面后返回仍保留');
 await click('.review-optional > summary');await capture('18-review-draft-dark');
 check(service.snapshot().state.itemReviews.length===0,'未提交的审视草稿不写入审视历史');
 await button('已审视，查看下一项');await settle();
 check(service.snapshot().state.itemReviews.some((record:any)=>record.itemId===first&&record.note.includes('先确认依赖')),'明确标记后保存草稿为审视记录');
 check(await js(`document.querySelector('.review-current-top').textContent.includes('确认下一项工作安排')`),'完成审视后继续下一项');
 await js(`window.journalAppearance.set({theme:'light',motion:'reduce'})`);await capture('19-review-next-light');
 const runningBefore=service.snapshot().timers.length;await click('[aria-label=设置]');await until(`!!document.querySelector('#settings-nav-focus')`);await click('#settings-nav-focus');await until(`!!document.querySelector('#settings-focus')`);await input('#settings-focus input[type=number]','40');await button('保存设置','#settings-focus');await settle();
 check(service.snapshot().state.settings.targetMinutes===40,'按需打开的设置页可保存下次专注目标');
 check(service.snapshot().timers.length===runningBefore&&service.snapshot().timers.every((timer:any)=>timer.targetMinutes!==40),'调整默认目标保持当前计时器原目标');
 await click('#settings-nav-reminders');await until(`!!document.querySelector('#settings-reminders')`);await capture('20-settings-feedback-light');
 await key('K',['control']);await win.webContents.insertText('核对审视草稿连续性');await until(`!!document.querySelector('.search-page')`);await settle();
 check(await js(`document.querySelector('.search-page').textContent.includes('核对审视草稿连续性')`),'快捷键首次打开按需加载的全局搜索');
 await key('Escape');await settle();check(await js(`!document.querySelector('.search-page')&&!!document.querySelector('#settings-category-reminders:not([hidden]) #settings-reminders')`),'关闭搜索回到原设置分类');
}
