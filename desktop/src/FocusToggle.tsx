import React from 'react';
import {Star20Regular,Star20Filled} from '@fluentui/react-icons';
import {localDate,type Task} from '../core/types';
import {isDailyFocus} from '../core/daily-focus';
import {useJournal} from './ui';
import './daily-focus.css';
const swallow=(p:Promise<unknown>)=>{void p.catch(()=>{});};
export function useDailyFocus(){
 const {data,run,notify}=useJournal(),today=localDate(data.now);
 return async(task:Task)=>{
  const chosen=task.focusDate===today;
  await run({type:'item.focus',payload:{id:task.id,date:chosen?null:today}});
  notify(chosen?'已移出今日重点':'已加入今日重点：在今日页查看；自动排序优先展示可执行的重点。');
 };
}
export function FocusToggle({task,compact=false}:{task:Task;compact?:boolean}){
 const {data,busy}=useJournal(),chosen=isDailyFocus(task,localDate(data.now)),toggle=useDailyFocus();
 return <button className={`focus-pin ${compact?'focus-pin-compact':''}`} disabled={busy} title={chosen?'移出今日重点':'加入今日重点 · 自动排序优先显示，计划与截止不变'} aria-label={`${chosen?'移出今日重点':'加入今日重点'} ${task.title}`} aria-pressed={chosen} onClick={()=>swallow(toggle(task))}>{chosen?<Star20Filled/>:<Star20Regular/>}{!compact&&(chosen?'今日重点':'加入今日重点')}</button>;
}
export function FocusBadge(){return <span className="daily-focus-badge" title="今日重点 · 当天主动选定的事项" aria-label="今日重点"><Star20Filled/><span>重点</span></span>;}
