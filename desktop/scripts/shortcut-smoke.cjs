// Native keyboard delivery and layout checks; isolated QA packages only.
const fs=require('node:fs'),path=require('node:path');
module.exports=async({main,run,until,check,wait,output})=>{
 const press=async(key,modifiers=['control'])=>{main.focus();main.webContents.sendInputEvent({type:'keyDown',keyCode:key,modifiers});main.webContents.sendInputEvent({type:'keyUp',keyCode:key,modifiers});await wait(70);};
 const nav=async name=>{await run(main,`document.querySelector('.top-navigation [aria-label="${name}"]').click()`);await wait(100);};
 const focused=label=>run(main,`document.activeElement===document.querySelector('[aria-label="${label}"]')`);
 const button=async name=>run(main,`(()=>{const b=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(name)});if(!b)throw Error('Missing button '+${JSON.stringify(name)});b.click();})()`);
 for(const [page,label] of [['任务','在事项树中搜索'],['笔记','搜索笔记'],['提醒','搜索提醒']]){
  await nav(page);await until(()=>run(main,`!!document.querySelector('[aria-label="${label}"]')`),'Current list search missing');
  await press('F');check(await focused(label),`Native Ctrl+F focuses ${page} search`);
 }
 await press('K');check(await focused('搜索任务和笔记'),'Native Ctrl+K searches all content');
 await press(',');await until(()=>run(main,`!!document.querySelector('.settings-page')`),'Settings keyboard entry missing');
 await button('快捷键');await until(()=>run(main,`!!document.querySelector('#shortcut-search-current')&&!document.querySelector('#settings-shortcuts').closest('[hidden]')`),'Shortcut category missing');
 await run(main,`document.querySelector('#shortcut-search-current').focus()`);await press('G');
 check(await run(main,`document.activeElement.id==='shortcut-search-current'&&document.activeElement.value==='Ctrl + G'`),'Native recorder captures a chord without triggering navigation');
 await button('保存快捷键设置');await until(()=>run(main,`document.querySelector('#settings-shortcuts').textContent.includes('快捷键已保存')`),'Shortcut save missing');
 check(await run(main,`JSON.parse(localStorage.getItem('journal.shortcuts.v1'))['search-current']==='Primary+G'`),'Saved chord persists in device storage');
 const original=main.getBounds();main.setSize(1000,720);await wait(100);
 check(await run(main,`(()=>{const scope=document.querySelector('#settings-shortcuts'),r=scope.getBoundingClientRect();return [...scope.querySelectorAll('.shortcut-setting-row')].every(e=>e.getBoundingClientRect().right<=innerWidth)&&r.left>=0;})()`),'Shortcut controls fit a narrow native window');
 check(await run(main,`(()=>{const q=document.querySelector('[aria-label="退出专注记"]'),s=document.querySelector('.sidebar-app-actions [aria-label="设置"]'),r=q.getBoundingClientRect(),t=s.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight&&r.width>0&&Math.abs(r.top-t.top)<2;})()`),'Settings and Quit are visible side by side at the bottom');
 await run(main,`window.journalAppearance.set({theme:'light',motion:'reduce'})`);await wait(80);fs.writeFileSync(path.join(output,'shortcuts-light.png'),(await main.webContents.capturePage()).toPNG());
 await run(main,`window.journalAppearance.set({theme:'dark',motion:'reduce'})`);await wait(80);fs.writeFileSync(path.join(output,'shortcuts-dark.png'),(await main.webContents.capturePage()).toPNG());
 await run(main,`document.querySelector('.main').scrollTop=1000`);await wait(80);
 check(await run(main,`(()=>{const m=document.querySelector('.main'),bar=document.querySelector('.shortcut-save-bar'),r=bar.getBoundingClientRect();return m.scrollTop>500&&r.top>=m.getBoundingClientRect().top-1&&r.bottom<=innerHeight;})()`),'Save controls stay visible while editing lower shortcut rows');
 fs.writeFileSync(path.join(output,'shortcuts-save-bar.png'),(await main.webContents.capturePage()).toPNG());main.setBounds(original);
 await nav('任务');await until(()=>run(main,`!!document.querySelector('[aria-label="在事项树中搜索"]')`),'Task search did not return');
 await press('K');await press('F');check(await focused('搜索任务和笔记'),'Old current-search binding stops after rebinding');
 await press('G');check(await focused('在事项树中搜索'),'New current-search binding works immediately');
};
