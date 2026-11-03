import type React from 'react';
import {isMac,primaryModifier,desktopPlatform} from './platform';
import {shortcutFromEvent} from '../core/shortcuts';
import {getShortcuts} from './shortcuts';

export type OutlineKeyAction='create-sibling'|'create-child'|'rename'|'menu'|'indent'|'outdent'|'move-up'|'move-down'|'toggle-timer'|'stop-timer'|'complete'|'delete'|'next'|'previous'|'expand'|'collapse'|'first'|'last';
/** Do not intercept text editing, IME composition or browser/OS modifier shortcuts. */
export function outlineKeyAction(e:React.KeyboardEvent<HTMLElement>):OutlineKeyAction|null{
 if(e.nativeEvent.isComposing||e.nativeEvent.keyCode===229||e.nativeEvent.getModifierState('AltGraph')||(e.target as HTMLElement).closest('input,textarea,select,[contenteditable="true"]'))return null;
 const primary=primaryModifier(e);
 const chord=shortcutFromEvent(e.nativeEvent,desktopPlatform());
 const bindings=getShortcuts();
 const configurable=(['create-sibling','create-child','rename','toggle-timer','stop-timer','complete','delete'] as const).find(id=>bindings[id]&&bindings[id]===chord);
 if(configurable&&(e.target===e.currentTarget||['create-sibling','create-child','rename'].includes(configurable)))return configurable;
 if(e.altKey||e.metaKey&&!isMac()||e.ctrlKey&&isMac())return null;
 if(e.key==='ContextMenu'||e.shiftKey&&e.key==='F10')return 'menu';
 if(e.target!==e.currentTarget)return null;
 if(e.key==='Tab'&&!primary)return e.shiftKey?'outdent':'indent';
 if(primary&&e.key==='ArrowUp')return 'move-up';
 if(primary&&e.key==='ArrowDown')return 'move-down';
 if(e.shiftKey&&!primary&&['ArrowUp','ArrowDown'].includes(e.key))return e.key==='ArrowUp'?'previous':'next';
 if(primary||e.shiftKey)return null;
 return ({ArrowDown:'next',ArrowUp:'previous',ArrowRight:'expand',ArrowLeft:'collapse',Home:'first',End:'last',Enter:'rename'} as Record<string,OutlineKeyAction>)[e.key]??null;
}
