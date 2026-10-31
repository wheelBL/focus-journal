import {primaryModifier as primary,shortcutLabel as label,type DesktopPlatform,type ModifierKeys} from '../core/desktop-platform';
declare global {interface Window {journalPlatform?:DesktopPlatform}}
export function desktopPlatform():DesktopPlatform{
 if(typeof window!=='undefined'&&window.journalPlatform)return window.journalPlatform;
 return typeof window!=='undefined'&&/Mac|iPhone|iPad/.test(window.navigator.platform)?'darwin':'win32';
}
export const isMac=()=>desktopPlatform()==='darwin';
export const primaryModifier=(event:ModifierKeys)=>primary(event,desktopPlatform());
export const shortcutLabel=(value:string)=>label(value,desktopPlatform());
