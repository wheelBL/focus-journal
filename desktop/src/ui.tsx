import {AppContext,LiveAppContext} from './journal-context';
export {AppContext,type AppContextValue,type DialogSpec} from './journal-context';
import {isDateDeadline} from '../core/deadlines';
import React, {useContext} from 'react';
import { Dismiss20Regular } from '@fluentui/react-icons';
import {localDate,type Command,type Snapshot,type Task} from '../core/types';
import {outlineIndex,outlinePath} from '../core/outline';
export const useWorkspaceJournal=()=>useContext(AppContext);
export function useJournal(){const context=useContext(AppContext),live=useContext(LiveAppContext);return live??context;}
export const minuteText=(ms:number)=>ms<60000?(ms<1000?'0 分钟':`${Math.floor(ms/1000)} 秒`):`${Math.round(ms/6000)/10} 分钟`;
export const timerText=(ms:number)=>{const seconds=Math.floor(ms/1000);return `${String(Math.floor(seconds/60)).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')}`;};
export const timeText=(iso:string|null)=>iso?new Date(iso).toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit',hour12:false}):'时间未指定';
export const localDateTimeInput=(value:string|null|undefined)=>value?`${localDate(value)}T${timeText(value)}`:'';
export const deadlineText=(value:string|null|undefined)=>value?(isDateDeadline(value)?`${value} 前`:`${localDate(value)} ${timeText(value)}`):'未设置';
export const deadlineInputValue=(value:string|null|undefined)=>value?(isDateDeadline(value)?value:localDateTimeInput(value)):'';
export const deadlinePayload=(value:string)=>value?(isDateDeadline(value)?value:new Date(value).toISOString()):null;
export const dateLabel=(date:string)=>new Date(`${date}T12:00:00`).toLocaleDateString('zh-CN',{month:'long',day:'numeric',weekday:'short'});
export const projectName=(data:Snapshot,task:Task)=>outlinePath(outlineIndex(data.state),task.id).filter(n=>n.kind==='project'&&n.id!==task.id).map(n=>n.title).join(' / ')||'最外层';
export function Button({children,primary=false,subtle=false,className='',...props}:React.ButtonHTMLAttributes<HTMLButtonElement>&{primary?:boolean;subtle?:boolean}){return <button {...props} className={`${primary?'primary':subtle?'subtle':'secondary'} ${className}`}>{children}</button>;}
export function Field({label,children,hint}:React.PropsWithChildren<{label:string;hint?:string}>){return <label className="field"><span>{label}</span>{children}{hint&&<small>{hint}</small>}</label>;}
export function Empty({title,text,children}:React.PropsWithChildren<{title:string;text:string}>){return <div className="empty"><h2>{title}</h2><p>{text}</p>{children}</div>;}
export function Modal({title,children,onClose,wide=false}:React.PropsWithChildren<{title:string;onClose:()=>void;wide?:boolean}>){
  const ref=React.useRef<HTMLDialogElement>(null);
  React.useEffect(()=>{ref.current?.showModal();const el=ref.current;el?.querySelector<HTMLInputElement|HTMLTextAreaElement|HTMLSelectElement>('input:not([type=checkbox]),textarea,select')?.focus();const cancel=(e:Event)=>{e.preventDefault();onClose();};el?.addEventListener('cancel',cancel);return()=>{el?.removeEventListener('cancel',cancel);el?.close();};},[]);
  return <dialog ref={ref} className={wide?'modal wide':'modal'} aria-label={title} onClick={e=>{if(e.target===e.currentTarget){const r=e.currentTarget.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)onClose();}}}><header><h2>{title}</h2><Button subtle aria-label="关闭" onClick={onClose}><Dismiss20Regular/></Button></header>{children}</dialog>;
}
