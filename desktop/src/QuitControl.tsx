import {useCallback,useEffect,useRef,useState} from 'react';
import {Power20Regular} from '@fluentui/react-icons';
import {api,isDesktop} from './api';
import {desktopPlatform} from './platform';
import {formatShortcut} from '../core/shortcuts';
import {useShortcuts} from './shortcuts';
import './quit-control.css';

export function QuitControl({busy,notify}:{busy:boolean;notify:(message:string)=>void}){
 const [pending,setPending]=useState(false),requesting=useRef(false);
 const shortcuts=useShortcuts();
 const quit=useCallback(async()=>{
  if(!isDesktop||requesting.current)return;
  if(busy){notify('正在保存，请稍候再退出。');return;}
  requesting.current=true;setPending(true);
  try{await api.windowAction('quit');}
  catch(error){notify(error instanceof Error?error.message:'退出未完成，请重试。');}
  finally{requesting.current=false;setPending(false);}
 },[busy,notify]);
 useEffect(()=>{const request=()=>void quit();window.addEventListener('journal:quit-request',request);return()=>window.removeEventListener('journal:quit-request',request);},[quit]);
 if(!isDesktop)return null;
 const key=shortcuts.quit?`（${formatShortcut(shortcuts.quit,desktopPlatform())}）`:'';
 return <button className="nav-item quit-control" aria-label="退出专注记" disabled={busy||pending} title={`退出专注记${key}：已提交的操作自动保存，退出会保存并暂停计时；尚未提交的表单不会自动提交。`} onClick={()=>void quit()}><Power20Regular/><span>退出</span></button>;
}
