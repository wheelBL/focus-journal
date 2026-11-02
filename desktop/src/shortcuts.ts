import {useSyncExternalStore} from 'react';
import {defaultsForPlatform,validateShortcutBindings,type ShortcutBindings} from '../core/shortcuts';
import {desktopPlatform} from './platform';
const key='journal.shortcuts.v1', event='journal:shortcuts-changed';
let cachedRaw:string|null|undefined, cached:ShortcutBindings;
export function getShortcuts():ShortcutBindings {
 let raw:string|null=null;try{raw=window.localStorage.getItem(key);}catch{}
 if(cached&&raw===cachedRaw)return cached;
 const defaults=defaultsForPlatform(desktopPlatform());
 try{const parsed=raw?JSON.parse(raw):null;const merged=parsed&&typeof parsed==='object'&&!Array.isArray(parsed)?{...defaults,...parsed}:defaults;cached=validateShortcutBindings(merged,desktopPlatform())?defaults:merged;}catch{cached=defaults;}
 cachedRaw=raw;return cached;
}
export function saveShortcuts(bindings:ShortcutBindings):void {
 const error=validateShortcutBindings(bindings,desktopPlatform());if(error)throw new Error(error);
 try{window.localStorage.setItem(key,JSON.stringify(bindings));}catch{throw new Error('无法保存快捷键设置，请检查本机存储权限。');}
 cachedRaw=undefined;window.dispatchEvent(new Event(event));
}
export function restoreShortcuts():void {saveShortcuts(defaultsForPlatform(desktopPlatform()));}
function subscribe(callback:()=>void){window.addEventListener(event,callback);window.addEventListener('storage',callback);return()=>{window.removeEventListener(event,callback);window.removeEventListener('storage',callback);};}
export function useShortcuts(){return useSyncExternalStore(subscribe,getShortcuts,getShortcuts);}
