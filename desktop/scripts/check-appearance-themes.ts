/** Packaged renderer, actual native preference bridge, independent fixture journal. */
export async function checkProductionTheme({win,js,click,button,key,input,capture,check,settle,until,service}:any){
 const baseline=service.snapshot();
 const setTheme=async(theme:string,motion='full')=>{await js(`window.journalAppearance.set(${JSON.stringify({theme,motion})})`);await settle();};
 await setTheme('dark');check(await js(`document.documentElement.dataset.theme==='dark'`),'正式外观桥接切换深色');await capture('08-dark-items');
 await click('.top-navigation [aria-label=今日]');await settle();await capture('09-dark-today');
 await input('[aria-label="快速添加事项名称"]','保留草稿，不中断计时');await setTheme('light');await setTheme('dark');
 check(await js(`document.querySelector('[aria-label="快速添加事项名称"]').value==='保留草稿，不中断计时'`),'跨主题保留未保存快速记录与计时');await input('[aria-label="快速添加事项名称"]','');
 await click('[aria-label=设置]');await until(`!!document.querySelector('#settings-appearance')`);await capture('10-dark-settings');
 await click('.top-navigation [aria-label=事项]');await settle();
 await win.webContents.reload();await until(`!!document.querySelector('.outline-row')`);await settle();check(await js(`document.documentElement.dataset.theme==='dark'&&document.querySelector('[aria-label="切换外观"]').value==='dark'`),'重开渲染器记住外观和工作区');
 await setTheme('system');win.webContents.debugger.attach('1.3');
 for(const value of ['light','dark']){await win.webContents.debugger.sendCommand('Emulation.setEmulatedMedia',{features:[{name:'prefers-color-scheme',value}]});await settle();check(await js(`document.documentElement.dataset.theme==='${value}'`),'跟随系统实时响应 '+value);}
 await setTheme('light');check(await js(`document.documentElement.dataset.theme==='light'`),'手动外观优先于系统');win.webContents.debugger.detach();await setTheme('dark');
 for(const [w,h] of [[1920,1080],[1280,800],[900,700]]){win.setContentSize(w,h);await settle();
  check(await js(`(()=>{const t=document.querySelector('.quick-timer-start').getBoundingClientRect(),r=document.querySelector('.task-inspector').getBoundingClientRect();return document.documentElement.scrollWidth<=innerWidth+1&&t.right<=innerWidth-138&&r.right<=innerWidth&&[...document.querySelectorAll('.outline-row')].every(e=>Math.abs(e.getBoundingClientRect().height-32)<1);})()`),`${w}px 深色布局、原生标题栏预留与 32px 密度`);await capture('11-dark-items-'+w);
 }
 win.setContentSize(1440,940);await settle();await click('.top-navigation [aria-label=日历]');await settle();await capture('12-dark-calendar');
 await click('.top-navigation [aria-label=回顾]');await settle();await capture('13-dark-review');
 const after=service.snapshot();check(baseline.revision===after.revision&&JSON.stringify(baseline.state.tasks)===JSON.stringify(after.state.tasks)&&JSON.stringify(baseline.timers.map((t:any)=>[t.sessionId,t.taskId,t.paused]))===JSON.stringify(after.timers.map((t:any)=>[t.sessionId,t.taskId,t.paused])),'外观与浏览不改变事项、记录修订或计时身份');
}
