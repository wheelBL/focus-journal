import {useSyncExternalStore} from 'react';
import {motionAllowed} from './appearance';
export const settingsSections=[
 {id:'appearance',label:'外观与动效'},
 {id:'focus',label:'专注与休息'},
 {id:'reminders',label:'到时提醒'},
 {id:'capture',label:'快速记录'},
 {id:'ai',label:'AI 助手'},
 {id:'api',label:'本机控制 API'},
 {id:'sync',label:'同步'},
 {id:'data',label:'数据与备份'},
 {id:'habits',label:'使用习惯'},
] as const;
export type SettingsSection=typeof settingsSections[number]['id'];
let selected:SettingsSection='appearance';
let pending:string|null=null;
const listeners=new Set<()=>void>();
const subscribe=(listener:()=>void)=>{listeners.add(listener);return()=>{listeners.delete(listener);};};
export const getSettingsSection=()=>selected;
export function useSettingsSection(){return useSyncExternalStore(subscribe,getSettingsSection,getSettingsSection);}
/** Section requests may arrive while the Settings chunk is still loading. */
export function requestSettingsSection(section:string){if(!settingsSections.some(entry=>entry.id===section))return;selected=section as SettingsSection;pending=section;for(const listener of listeners)listener();applySettingsSection();}
export function applySettingsSection(){if(!pending)return;const target=document.getElementById(`settings-${pending}`);if(target&&!target.closest('[hidden]')){pending=null;target.scrollIntoView({block:'start',behavior:motionAllowed()?'smooth':'auto'});}}
export function clearSettingsSection(){pending=null;}
