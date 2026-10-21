// Included only in the --release-qa --smoke package; never shipped in production.
const {app,BrowserWindow}=require('electron');
const fs=require('node:fs'),path=require('node:path');
module.exports=(dataDir,output)=>{
 const checks=[],failures=[],diagnostics=[];let finished=false;
 fs.mkdirSync(output,{recursive:true});
 const wait=ms=>new Promise(r=>setTimeout(r,ms));
 const check=(ok,label)=>{if(!ok)throw Error(label);checks.push(label);};
 const run=(w,code)=>w.webContents.executeJavaScript(code);
 const until=async(fn,label)=>{for(let i=0;i<100;i++){if(await fn())return;await wait(40);}throw Error(label);};
 const timeout=setTimeout(()=>{failures.push('Packaged smoke timeout');app.quit();},25000);
 app.on('will-quit',()=>{clearTimeout(timeout);const remainingWindows=BrowserWindow.getAllWindows().length;if(!finished)failures.push('Smoke did not finish');if(remainingWindows)failures.push('Windows remain at exit');fs.writeFileSync(path.join(output,'packaged-smoke.json'),JSON.stringify({version:app.getVersion(),checks,failures,diagnostics,remainingWindows,dataDir,packaged:app.isPackaged},null,2));});
 void app.whenReady().then(async()=>{try{
  await until(()=>BrowserWindow.getAllWindows().some(w=>!w.webContents.getURL().includes('panel=')),'Main window missing');
  const main=BrowserWindow.getAllWindows().find(w=>!w.webContents.getURL().includes('panel='));
  await until(()=>run(main,`!!document.querySelector('.today-page')&&!!window.journal`),'Main renderer missing');
  main.restore();main.show();await wait(150);
  check(app.isPackaged,'Real packaged executable');check(app.getVersion()==='0.21.0','Correct app version');
  const before=await run(main,'window.journal.snapshot()');check(before.demo&&before.dataPath.startsWith(dataDir),'Isolated data only');
  for(const timer of before.timers)await run(main,`window.journal.command({type:'focus.stop',payload:{sessionId:${JSON.stringify(timer.sessionId)}}})`);
  await run(main,`window.journal.command({type:'break.stop'})`);
  main.restore();main.show();await until(()=>main.isVisible()&&!main.isMinimized(),'Main did not become visible');
  const started=await run(main,`window.journal.command({type:'focus.start-unassigned'})`),id=started.timers.find(t=>!t.paused).sessionId;
  await run(main,`window.journal.windowAction('minimize')`);
  await until(()=>BrowserWindow.getAllWindows().some(w=>w.getTitle()==='专注记 · 屏边计时签'&&w.isVisible()),'Packaged strip missing');
  const strip=BrowserWindow.getAllWindows().find(w=>w.getTitle()==='专注记 · 屏边计时签');
  check(strip.isAlwaysOnTop()&&!strip.isFocused(),'Packaged strip shows inactive on top');
  await until(()=>run(strip,`!!window.floatingTimer&&!!document.querySelector('.floating-toggle')`),'Packaged preload missing');
  const state=await run(strip,'window.floatingTimer.snapshot()');check(state.selectedId===id,'Packaged preload shares service');
  await run(strip,`window.floatingTimer.action('expand')`);await run(strip,`window.floatingTimer.action('pause',${JSON.stringify(id)})`);
  check((await run(main,'window.journal.snapshot()')).timers.find(t=>t.sessionId===id).paused,'Packaged pause updates main');
  await run(strip,`window.floatingTimer.action('resume',${JSON.stringify(id)})`);await run(strip,`window.floatingTimer.action('stop-rest',${JSON.stringify(id)})`);
  const stopped=await run(main,'window.journal.snapshot()');check(stopped.state.settings.rest.phase==='running'&&stopped.state.sessions.some(s=>s.id===id&&s.status==='ended'),'Packaged end and rest saves effort');
  await run(strip,`window.floatingTimer.action('open')`);await until(()=>!main.isMinimized()&&main.isVisible(),'Main restore failed');check(!strip.isVisible(),'Returning to main hides strip');
  finished=true;
 }catch(e){failures.push(String(e));for(const w of BrowserWindow.getAllWindows())diagnostics.push({title:w.getTitle(),visible:w.isVisible(),minimized:w.isMinimized(),url:w.webContents.getURL(),bounds:w.getBounds()});}finally{clearTimeout(timeout);app.quit();}});
};
