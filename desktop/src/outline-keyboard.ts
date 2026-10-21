import type React from 'react';

export type OutlineKeyAction='create-sibling'|'create-child'|'rename'|'menu'|'undo'|'indent'|'outdent'|'move-up'|'move-down'|'toggle-timer'|'stop-timer'|'complete'|'delete'|'next'|'previous'|'expand'|'collapse'|'first'|'last';
/** Do not intercept text editing, IME composition or browser/OS modifier shortcuts. */
export function outlineKeyAction(e:React.KeyboardEvent<HTMLElement>):OutlineKeyAction|null{
 if(e.nativeEvent.isComposing||e.altKey||e.metaKey||(e.target as HTMLElement).closest('input,textarea,select,[contenteditable="true"]'))return null;
 if(e.key==='Insert')return e.ctrlKey?'create-child':'create-sibling';
 if(e.ctrlKey&&e.key.toLowerCase()==='z')return 'undo';
 if(e.key==='ContextMenu'||e.shiftKey&&e.key==='F10')return 'menu';
 if(e.key==='F2')return 'rename';
 if(e.target!==e.currentTarget)return null;
 if(e.key==='Tab'&&!e.ctrlKey)return e.shiftKey?'outdent':'indent';
 if(e.ctrlKey&&e.key==='ArrowUp')return 'move-up';
 if(e.ctrlKey&&e.key==='ArrowDown')return 'move-down';
 if(e.ctrlKey&&e.key==='Enter')return e.shiftKey?'stop-timer':'toggle-timer';
 if(e.shiftKey&&!e.ctrlKey&&['ArrowUp','ArrowDown'].includes(e.key))return e.key==='ArrowUp'?'previous':'next';
 if(e.ctrlKey||e.shiftKey)return null;
 return ({' ':'complete',Delete:'delete',ArrowDown:'next',ArrowUp:'previous',ArrowRight:'expand',ArrowLeft:'collapse',Home:'first',End:'last',Enter:'rename'} as Record<string,OutlineKeyAction>)[e.key]??null;
}
