import React,{useLayoutEffect,useState} from 'react';
import {createPortal} from 'react-dom';
import {Calendar20Regular,Clock20Regular,Settings20Regular,ShieldCheckmark20Regular,Timer20Regular,Speaker220Regular,ArrowSync20Regular,Keyboard20Regular} from '@fluentui/react-icons';
import {shiftDate} from '../core/types';
import {requestSettingsSection,settingsSections,useSettingsSection,type SettingsSection} from './settings-navigation';

/** Module-owned navigation lives in the shared sidebar without moving its state. */
export function WorkspaceContext({children}:{children:React.ReactNode}){
 const [host,setHost]=useState<HTMLElement|null>(null);
 useLayoutEffect(()=>setHost(document.getElementById('workspace-sidebar')),[]);
 return host?createPortal(children,host):null;
}

export function DateContext({date,today,setDate}:{date:string;today:string;setDate:(date:string)=>void}){
 return <><h2 className="context-heading">工作日志</h2><nav className="context-nav" aria-label="日志日期"><button className={date===today?'selected':''} onClick={()=>setDate(today)}><Calendar20Regular/><span>今天</span></button><button className={date===shiftDate(today,-1)?'selected':''} onClick={()=>setDate(shiftDate(today,-1))}><Clock20Regular/><span>昨天</span></button></nav></>;
}

export function SettingsContext(){
 const selected=useSettingsSection(),icons:Partial<Record<SettingsSection,typeof Settings20Regular>>={focus:Timer20Regular,reminders:Speaker220Regular,capture:Keyboard20Regular,sync:ArrowSync20Regular,data:ShieldCheckmark20Regular};
 return <><h2 className="context-heading">设置</h2><nav className="context-nav" aria-label="设置分区">{settingsSections.map(({id,label})=>{const Icon=icons[id]??Settings20Regular;return <button key={id} id={`settings-nav-${id}`} className={selected===id?'selected':''} aria-current={selected===id?'page':undefined} aria-controls={`settings-category-${id}`} onClick={()=>requestSettingsSection(id)}><Icon/><span>{label}</span></button>;})}</nav></>;
}

export function SearchContext(){return <h2 className="context-heading">搜索结果</h2>;}
