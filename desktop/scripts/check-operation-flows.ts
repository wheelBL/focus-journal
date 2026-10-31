/** Short real-renderer verification of changed operation depth and return paths. */
export async function checkOperationFlows({win,js,click,button,key,input,capture,check,settle,until,service}:any){
 await js(`window.journalAppearance.set({theme:'light',motion:'reduce'})`);
 await click('.top-navigation [aria-label="事项"]');await button('全部事项','.context-nav');await settle();
 await click('[aria-label="视图选项"]');await capture('30-view-options');
 check(await js(`document.querySelector('.action-popover-panel:not([hidden])').textContent.includes('展开全部')&&document.querySelector('.action-popover-panel:not([hidden])').textContent.includes('折叠全部')`),'展开与折叠以文字直接呈现，视图操作只进入一层');await key('Escape');
 await button('新增事项','.tree-page-header');await input('[aria-label="新事项名称"]','操作验证：保留新增草稿');await button('新增事项','.tree-page-header');
 check(await js(`document.querySelector('[aria-label="新事项名称"]').value==='操作验证：保留新增草稿'&&document.activeElement.getAttribute('aria-label')==='新事项名称'`),'再次点新增返回同一份草稿，不清空输入');await capture('31-inline-draft');
 await button('保存并结束','.inline-creator');await settle();
 check(service.snapshot().state.tasks.some((task:any)=>task.title==='操作验证：保留新增草稿')&&!await js(`!!document.querySelector('.inline-creator')`),'保存并结束含义明确，保存一次后退出输入');
 const target=service.snapshot().state.tasks.find((task:any)=>task.title==='统一颜色与状态提示');
 await click(`[data-outline-id="${target.id}"] .tree-title>.editable-value`,1,'right');await button('标记为项目','[role=menu]');await settle();
 check(await js(`document.activeElement.closest('[data-outline-id]')?.dataset.outlineId===${JSON.stringify(target.id)}`),'右键整理成功后键盘焦点回到原事项');
 await key('Down');check(await js(`document.activeElement.closest('[data-outline-id]')?.dataset.outlineId!==${JSON.stringify(target.id)}&&!!document.activeElement.closest('[data-outline-id]')`),'菜单操作后方向键可继续浏览');
 await click('[aria-label="设置"]');await until(`!!document.querySelector('.settings-page')`);await button('专注与休息','.context-nav');await input('#settings-focus input[type=number]','45');
 await input('[aria-label="搜索任务和笔记"]','阅读');await until(`!!document.querySelector('.search-page')`);await capture('32-search-overlay');await key('Escape');await settle();
 check(await js(`document.querySelector('#settings-focus input').value==='45'&&!document.querySelector('.workspace-screen').hidden`),'临时搜索后返回设置，45 分钟未保存草稿仍在');await capture('33-return-settings');
 await click('.top-navigation [aria-label="日历"]');await until(`!!document.querySelector('.calendar-page')`);await button('添加提醒','.calendar-page');await until(`!!document.querySelector('.calendar-create')`);
 await input('dialog [aria-label="事项名称"]','核对操作流程');const start=await js(`document.querySelector('dialog [aria-label="提醒时间"]').value`);
 await button('添加事件保留一段安排','dialog');
 check(await js(`document.querySelector('dialog [aria-label="事件名称"]').value==='核对操作流程'&&document.querySelector('dialog [aria-label="事件开始"]').value===${JSON.stringify(start)}`),'日历新增可直接切换事件，名称与所选时间保留');await capture('34-calendar-create');await key('Escape');
 await click('.top-navigation [aria-label="今日"]');await settle();await capture('35-today');
 await button('补记时间','.today-page');await until(`!!document.querySelector('dialog [aria-label="实际开始"]')`);await capture('36-manual-effort');
 check(await js(`document.querySelector('dialog .manual-duration-preview')?.textContent.includes('将记录')`),'补记在提交前直接显示将计入的实际时长');await key('Escape');
 await js(`window.journalAppearance.set({theme:'dark',motion:'reduce'})`);await click('.top-navigation [aria-label="事项"]');await settle();await capture('37-dark-items');
 for(const [width,height] of [[1920,1080],[900,720]]){win.setContentSize(width,height);await settle();check(await js(`document.documentElement.scrollWidth<=innerWidth+1&&[...document.querySelectorAll('.outline-row')].every(row=>Math.abs(row.getBoundingClientRect().height-32)<1)`),`${width}×${height} 操作入口无横向溢出，行高保持 32px`);await capture(`38-items-${width}`);}
 win.setContentSize(1440,940);await js(`window.journalAppearance.set({theme:'light',motion:'reduce'})`);
}
