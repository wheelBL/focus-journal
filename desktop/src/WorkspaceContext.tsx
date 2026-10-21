import React,{useLayoutEffect,useState} from 'react';
import {createPortal} from 'react-dom';
import {Calendar20Regular,Clock20Regular,Document20Regular,Settings20Regular,ShieldCheckmark20Regular,Timer20Regular,Speaker220Regular,ArrowSync20Regular} from '@fluentui/react-icons';
import {localDate,shiftDate} from '../core/types';

/** Module-owned navigation lives in the shared sidebar without moving its state. */
export function WorkspaceContext({children}:{children:React.ReactNode}){
 const [host,setHost]=useState<HTMLElement|null>(null);
 useLayoutEffect(()=>setHost(document.getElementById('workspace-sidebar')),[]);
 return host?createPortal(children,host):null;
}

export function DateContext({date,today,setDate}:{date:string;today:string;setDate:(date:string)=>void}){
 return <><h2 className="context-heading">工作日志</h2><nav className="context-nav" aria-label="日志日期"><button className={date===today?'selected':''} onClick={()=>setDate(today)}><Calendar20Regular/><span>今天</span></button><button className={date===shiftDate(today,-1)?'selected':''} onClick={()=>setDate(shiftDate(today,-1))}><Clock20Regular/><span>昨天</span></button></nav><div className="context-section"><label className="context-date">查看日期<input type="date" aria-label="日志日期" value={date} onChange={e=>e.target.value&&setDate(e.target.value)}/></label><p className="context-help">按时间回看投入，记录每一次推进。</p></div></>;
}

export function SettingsContext(){
 const entries=[['focus','专注与休息',Timer20Regular],['reminders','到时提醒',Speaker220Regular],['api','AI 与本机 API',Settings20Regular],['sync','同步',ArrowSync20Regular],['data','数据与备份',ShieldCheckmark20Regular],['habits','使用习惯',Settings20Regular]] as const;
 return <><h2 className="context-heading">设置</h2><nav className="context-nav" aria-label="设置分区">{entries.map(([id,label,Icon])=><button key={id} onClick={()=>document.getElementById(`settings-${id}`)?.scrollIntoView({block:'start',behavior:'smooth'})}><Icon/><span>{label}</span></button>)}</nav><p className="context-help">本地保存，按自己的节奏。</p></>;
}

export function SearchContext({query}:{query:string}){return <><h2 className="context-heading">全局搜索</h2><div className="context-search-state"><Document20Regular/><span>事项与历史笔记</span></div><p className="context-help">“{query}”</p></>;}
