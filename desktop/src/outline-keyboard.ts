import type React from 'react';
import {isMac,primaryModifier} from './platform';

export type OutlineKeyAction='create-sibling'|'create-child'|'rename'|'menu'|'undo'|'indent'|'outdent'|'move-up'|'move-down'|'toggle-timer'|'stop-timer'|'complete'|'delete'|'next'|'previous'|'expand'|'collapse'|'first'|'last';
/** Do not intercept text editing, IME composition or browser/OS modifier shortcuts. */
export function outlineKeyAction(e:React.KeyboardEvent<HTMLElement>):OutlineKeyAction|null{
 if(e.nativeEvent.isComposing||(e.target as HTMLElement).closest('input,textarea,select,[contenteditable="true"]'))return null;
 const primary=primaryModifier(e);
 if(isMac()&&primary&&e.key.toLowerCase()==='n'){if(e.altKey)return 'create-child';if(e.shiftKey)return 'create-sibling';}
 if(e.altKey||e.metaKey&&!isMac()||e.ctrlKey&&isMac())return null;
 if(e.key==='Insert')return primary?'create-child':'create-sibling';
 if(primary&&e.key.toLowerCase()==='z')return 'undo';
 if(e.key==='ContextMenu'||e.shiftKey&&e.key==='F10')return 'menu';
 if(e.key==='F2')return 'rename';
 if(e.target!==e.currentTarget)return null;
 if(e.key==='Tab'&&!primary)return e.shiftKey?'outdent':'indent';
 if(primary&&e.key==='ArrowUp')return 'move-up';
 if(primary&&e.key==='ArrowDown')return 'move-down';
 if(primary&&e.key==='Enter')return e.shiftKey?'stop-timer':'toggle-timer';
 if(isMac()&&e.key==='Backspace')return 'delete';
 if(e.shiftKey&&!primary&&['ArrowUp','ArrowDown'].includes(e.key))return e.key==='ArrowUp'?'previous':'next';
 if(primary||e.shiftKey)return null;
 return ({' ':'complete',Delete:'delete',ArrowDown:'next',ArrowUp:'previous',ArrowRight:'expand',ArrowLeft:'collapse',Home:'first',End:'last',Enter:'rename'} as Record<string,OutlineKeyAction>)[e.key]??null;
}
