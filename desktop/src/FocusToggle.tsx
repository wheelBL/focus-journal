import React from 'react';
import {Star20Regular,Star20Filled} from '@fluentui/react-icons';
import {localDate,type Task} from '../core/types';
import {isCurrentFocus} from '../core/daily-focus';
import {useJournal} from './ui';
import './daily-focus.css';
const swallow=(p:Promise<unknown>)=>{void p.catch(()=>{});};
export function useDailyFocus(){
 const {data,run,notify}=useJournal(),today=localDate(data.now);
 return async(task:Task)=>{
  const chosen=isCurrentFocus(task,today);
  await run({type:'item.focus',payload:{id:task.id,date:chosen?null:today}});
  notify(chosen?'已移出当前重点':'已加入当前重点：未完成持续保留，完成或移除后退出。');
 };
}
export function FocusToggle({task,compact=false}:{task:Task;compact?:boolean}){
 const {data,busy}=useJournal(),chosen=isCurrentFocus(task,localDate(data.now)),toggle=useDailyFocus();
 return <button className={`focus-pin ${compact?'focus-pin-compact':''}`} disabled={busy} title={chosen?'移出当前重点':'加入当前重点 · 自动排序优先显示，计划与截止不变'} aria-label={`${chosen?'移出当前重点':'加入当前重点'} ${task.title}`} aria-pressed={chosen} onClick={()=>swallow(toggle(task))}>{chosen?<Star20Filled/>:<Star20Regular/>}{!compact&&(chosen?'当前重点':'加入当前重点')}</button>;
}
export function FocusBadge(){return <span className="daily-focus-badge" title="当前重点 · 未完成持续保留，完成或移除后退出" aria-label="当前重点"><Star20Filled/><span>重点</span></span>;}
