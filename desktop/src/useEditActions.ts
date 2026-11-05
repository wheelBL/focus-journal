import {useCallback,useEffect} from 'react';
import type {Command,Snapshot} from '../core/types';
import type {DesktopEditAction} from '../core/desktop-platform';
import {api} from './api';
import {editDestination,isTextEditing} from './edit-actions';
import {shortcutAction,shortcutFromEvent} from '../core/shortcuts';
import {useShortcuts} from './shortcuts';
import {desktopPlatform} from './platform';

/** One route for menu and keyboard commands; page components never own history. */
export function useEditActions({view,query,dialogOpen,data,busy,run,notify}:{view:string;query:string;dialogOpen:boolean;data:Snapshot|null;busy:boolean;run:(c:Command)=>Promise<Snapshot>;notify:(text:string)=>void}) {
 const bindings=useShortcuts();
 const edit=useCallback((action:DesktopEditAction,entry='shortcut.edit')=>{
  const destination=editDestination(action,view,query,dialogOpen);
  if(destination==='blocked')return;
  if(destination==='text'){void api.editText?.(action).catch(()=>{});return;}
  if(destination==='tree'){window.dispatchEvent(new Event('journal:select-all'));return;}
  if(busy)return;
  const label=action==='undo'?data?.undoLabel:data?.redoLabel;
  // The main process may have accepted an API/AI edit before its snapshot arrives.
  // The command boundary, rather than a potentially stale renderer label, decides.
  void run({type:action==='undo'?'history.undo':'history.redo',meta:{entry}}).then(()=>notify(`${action==='undo'?'已撤销':'已重做'}${label?`：${label}`:'上一步'}`)).catch(()=>{});
 },[view,query,dialogOpen,data?.undoLabel,data?.redoLabel,busy,run,notify]);
 useEffect(()=>api.onEditAction?.(action=>edit(action,'menu.edit')),[edit]);
 useEffect(()=>{
  const key=(event:KeyboardEvent)=>{
   if(event.defaultPrevented||(event.target instanceof HTMLElement&&event.target.closest('[data-shortcut-recorder]')))return;
   if(isTextEditing(event.target)){
    // Route to the native editor explicitly in Electron, including macOS where
    // configurable business bindings must not depend on an AppKit menu accelerator.
    const chord=shortcutFromEvent(event,desktopPlatform());
    const textAction=chord==='Primary+Z'?'undo':chord==='Primary+Shift+Z'||desktopPlatform()==='win32'&&chord==='Primary+Y'?'redo':null;
    if(textAction&&api.editText){event.preventDefault();event.stopPropagation();if(!event.repeat)void api.editText(textAction).catch(()=>{});}
    return;
   }
   if(dialogOpen||document.querySelector('dialog[open],[role="dialog"]')||(event.target instanceof HTMLElement&&event.target.closest('[data-ai-workspace]')))return;
   const action=shortcutAction(event,bindings,desktopPlatform());if(action!=='undo'&&action!=='redo')return;
   event.preventDefault();event.stopPropagation();if(!event.repeat)edit(action);
  };
  window.addEventListener('keydown',key,true);return()=>window.removeEventListener('keydown',key,true);
 },[edit,bindings,dialogOpen]);
 return edit;
}
