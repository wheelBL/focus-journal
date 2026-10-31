import {test} from 'node:test';
import assert from 'node:assert/strict';
import {appDom} from './app-dom.mjs';
import {restoreLocation} from '../src/workspace-location.ts';

test('saved Today follows the current day; explicit history and ambiguous legacy dates stay fixed',()=>{
 const views=['today','projects','calendar'];
 assert.equal(restoreLocation({view:'today',date:'2026-10-19',followToday:true},'2026-10-20',views).date,'2026-10-20');
 assert.equal(restoreLocation({date:'2026-10-19',followToday:false},'2026-10-20',views).date,'2026-10-19');
 assert.equal(restoreLocation({date:'2026-10-19'},'2026-10-20',views).followToday,false);
 assert.equal(restoreLocation({date:'2026-10-19',lastSeenDay:'2026-10-19'},'2026-10-20',views).followToday,true);
 assert.deepEqual(restoreLocation({view:'missing',date:'2026-02-30'},'2026-10-20',views),{view:'today',date:'2026-10-20',followToday:true,lastSeenDay:'2026-10-20'});
});

test('Today follows midnight without losing a capture draft; explicit history does not move',async()=>{
 const h=await appDom();try{
  await h.mount();await h.input(h.label('快速添加事项名称'),'跨天仍保留的草稿');
  h.clock.advance(86400000);await h.command({type:'task.select',payload:{id:'inbox'}});
  assert.equal(h.label('查看日期').value,'2026-10-20');assert.equal(h.label('快速添加事项名称').value,'跨天仍保留的草稿');assert.match(h.query('h1').textContent,/今天/);
  await h.input(h.label('查看日期'),'2026-10-18');h.clock.advance(86400000);await h.command({type:'task.select',payload:{id:'inbox'}});
  assert.equal(h.label('查看日期').value,'2026-10-18');assert.match(h.query('h1').textContent,/这一天/);assert.equal(JSON.parse(window.localStorage.getItem('journal.location')).followToday,false);
  await h.click(h.button('今天',h.query('.date-nav')));assert.equal(h.label('查看日期').value,'2026-10-21');assert.equal(JSON.parse(window.localStorage.getItem('journal.location')).followToday,true);
 }finally{await h.close();}
});

test('reopening Today uses the service local date while a saved historical day remains selected',async()=>{
 const h=await appDom();try{
  window.localStorage.setItem('journal.location',JSON.stringify({view:'today',date:'2026-10-18',followToday:true}));
  await h.mount();assert.equal(h.label('查看日期').value,'2026-10-19');
 }finally{await h.close();}
 const history=await appDom();try{
  window.localStorage.setItem('journal.location',JSON.stringify({view:'calendar',date:'2026-10-18',followToday:false}));
  await history.mount();assert.equal(history.label('查看日期').value,'2026-10-18');assert.ok(history.query('.calendar-page'));
 }finally{await history.close();}
});

test('starting from yesterday after midnight uses the new snapshot day and continues following Today',async()=>{
 const h=await appDom();try{
  await h.mount();await h.input(h.label('查看日期'),'2026-10-18');h.clock.advance(86400000);
  await h.click(h.button('先计时'));assert.equal(h.label('查看日期').value,'2026-10-20');assert.equal(JSON.parse(window.localStorage.getItem('journal.location')).followToday,true);
  h.clock.advance(86400000);await h.command({type:'task.select',payload:{id:'inbox'}});assert.equal(h.label('查看日期').value,'2026-10-21');
 }finally{await h.close();}
});

test('calendar remembers viewed hours across navigation, keeps them through zoom, and locates now',async()=>{
 const h=await appDom();try{
  await h.mount();await h.click(h.label('日历'));
  const scroll=()=>h.query('.calendar-scroll');
  await h.action(()=>{scroll().scrollTop=18*48;scroll().dispatchEvent(new Event('scroll'));});
  await h.click(h.label('事项'));await h.click(h.label('日历'));assert.equal(scroll().scrollTop,18*48);
  await h.input(h.label('时间刻度'),'72');assert.equal(scroll().scrollTop,18*72);
  await h.click(h.button('日',h.query('.segmented')));assert.equal(scroll().scrollTop,7*72);
  await h.action(()=>{scroll().scrollTop=10*72;scroll().dispatchEvent(new Event('scroll'));});
  await h.click(h.button('周',h.query('.segmented')));assert.equal(scroll().scrollTop,18*72);
  await h.click(h.button('月',h.query('.segmented')));await h.click(h.label('定位当前时刻'));assert.equal(h.label('查看日期').value,'2026-10-19');assert.equal(scroll().scrollTop,13*72);
  await h.click(h.label('今日'));const stored=JSON.parse(window.localStorage.getItem('journal.calendar.scroll-hours'));assert.equal(stored.day,13);assert.equal(stored.week,18);
 }finally{await h.close();}
});

test('calendar ignores invalid cached scroll positions without damaging its layout',async()=>{
 const h=await appDom();try{
  window.localStorage.setItem('journal.calendar.scroll-hours',JSON.stringify({day:-7,week:'broken'}));await h.mount();await h.click(h.label('日历'));assert.equal(h.query('.calendar-scroll').scrollTop,7*48);
 }finally{await h.close();}
});

test('an older failed refresh cannot obscure a newer successful action',async()=>{
 const h=await appDom();let reject;try{
  await h.mount();window.journal.snapshot=()=>new Promise((_,fail)=>{reject=fail;});
  await h.command({type:'task.select',payload:{id:'inbox'}});assert.ok(reject);
  await h.click(h.button('先计时'));assert.equal(h.service.snapshot().timers.length,1);
  await h.action(()=>reject(Error('旧请求失败')));assert.equal(document.querySelector('.error-banner'),null);assert.ok(h.query('.today-timer'));
 }finally{await h.close();}
});

test('settings section navigation honors reduced motion',async()=>{
 const h=await appDom();try{
  await h.mount();await h.click(h.label('设置'));document.documentElement.dataset.motion='reduce';
  let options;HTMLElement.prototype.scrollIntoView=function(value){if(this.id==='settings-reminders')options=value;};
  await h.click(h.button('到时提醒',h.query('[aria-label="设置分区"]')));assert.equal(options.behavior,'auto');
 }finally{await h.close();}
});
