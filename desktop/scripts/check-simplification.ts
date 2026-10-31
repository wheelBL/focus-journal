/** Verify secondary controls using native pointer/keyboard input in the isolated renderer. */
export async function checkSimplification({win,js,click,button,key,input,capture,check,settle,until,service}:any){
 await click('.top-navigation [aria-label=事项]');await settle();await button('全部事项','.context-nav');
 check(await js(`!document.querySelector('.filter-summary')&&!document.querySelector('.outline-scope-row')`),'默认事项视图省去冗余条件行与全部范围行');
 await click('[aria-label="视图选项"]');await click('[aria-label="折叠全部"]');await settle();
 check(await js(`!document.querySelector('.filter-controls .action-popover-panel:not([hidden])')&&document.querySelectorAll('[role=treeitem][aria-level="2"]').length===0`),'视图选项可实际点击折叠全部，操作后收起');
 await click('[aria-label="视图选项"]');await click('[aria-label="展开全部"]');await settle();
 await click('[aria-label="视图选项"]');await key('Escape');check(await js(`document.activeElement.getAttribute('aria-label')==='视图选项'&&document.querySelector('.filter-controls .action-popover-panel').hidden`),'Escape 关闭视图选项并回到触发按钮');
 await click('[aria-label="视图选项"]');await button('保存视图');await input('[aria-label="常用视图名称"]','精简界面验证');await button('保存','dialog');await settle();
 check(service.snapshot().state.views.some((view:any)=>view.name==='精简界面验证'),'折叠入口仍可通过实际点击保存视图');await button('全部事项','.context-nav');
 const task=service.snapshot().state.tasks.find((task:any)=>task.title==='统一颜色与状态提示');await click(`[data-outline-id="${task.id}"] .tree-title>.editable-value`);await button('内容','.task-inspector');
 check(await js(`![...document.querySelectorAll('.node-breadcrumb button')].some(e=>e.textContent===${JSON.stringify(task.title)})`),'详情路径不重复当前事项名称');
 await click('.task-inspector [aria-label="更多操作"]');await capture('21-item-options');await key('Escape');
 win.setContentSize(800,720);await settle();await click('.task-inspector [aria-label="更多操作"]');
 check(await js(`(()=>{const pane=document.querySelector('.task-inspector').getBoundingClientRect(),popup=document.querySelector('.inspector-more-actions .action-popover-panel').getBoundingClientRect();return popup.left>=pane.left&&popup.right<=pane.right&&popup.bottom<=pane.bottom;})()`),'800px 详情更多操作弹层完整显示');await capture('24-item-options-800');await key('Escape');win.setContentSize(1440,940);await settle();
 await click('.inspector-more-arrangements > summary');await button('设置提醒','.task-inspector');await settle();
 check(await js(`!!document.querySelector('dialog [aria-label="提醒时间"]')`),'更多安排内可实际打开提醒编辑');await key('Escape');
 await click('.top-navigation [aria-label=今日]');await settle();check(await js(`!document.querySelector('.context-date')&&!!document.querySelector('[aria-label="快速添加事项名称"]')&&!document.querySelector('.header-actions').textContent.includes('新增事项')`),'今日只保留一处日期选择与就地快速记录');
 await click('.top-navigation [aria-label=日历]');await settle();await click('.calendar-guide summary');await capture('22-calendar-help');
 check(await js(`document.querySelector('.calendar-guide details').open&&!!document.querySelector('[aria-label="定位当前时刻"]')`),'日历说明可展开，当前时刻入口常驻');await click('.calendar-guide summary');
 win.setContentSize(900,720);await settle();check(await js(`getComputedStyle(document.querySelector('.calendar-toolbar>.segmented')).display==='none'`),'有侧栏时不重复显示日历日周月切换');
 win.setContentSize(700,720);await settle();check(await js(`getComputedStyle(document.querySelector('.calendar-toolbar>.segmented')).display!=='none'`),'窄窗口日历仍有日周月切换');win.setContentSize(1440,940);await settle();
 await click('[aria-label=设置]');await until(`!!document.querySelector('.settings-page')`);await button('专注与休息','.context-nav');await input('#settings-focus input[type=number]','45');await button('外观与动效','.context-nav');await button('专注与休息','.context-nav');
 check(await js(`document.querySelector('#settings-focus input').value==='45'&&document.querySelectorAll('.settings-category:not([hidden])').length===1`),'设置一次只展示一类，切换保留未保存草稿');await capture('23-settings-one-category');
 win.setContentSize(700,720);await settle();
 check(await js(`getComputedStyle(document.querySelector('.settings-compact-navigation')).display!=='none'&&document.documentElement.scrollWidth<=innerWidth+1`),'窄窗口设置分类可见且无横向溢出');
 await click('.top-navigation [aria-label=回顾]');await settle();check(await js(`getComputedStyle(document.querySelector('.review-module-tabs')).display!=='none'`),'窄窗口仍有回顾分类导航');
 win.setContentSize(900,720);await settle();check(await js(`getComputedStyle(document.querySelector('.review-module-tabs')).display==='none'`),'有侧栏时不重复显示回顾分类');
 win.setContentSize(1440,940);await settle();
}
