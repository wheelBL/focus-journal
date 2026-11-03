import type {DesktopPlatform} from './desktop-platform';

export const SHORTCUT_ACTIONS=[
 {id:'undo',label:'撤销上一步',group:'编辑'}, {id:'redo',label:'重做上一步',group:'编辑'},
 {id:'search-current',label:'搜索当前列表',group:'应用'}, {id:'search-global',label:'搜索全部内容',group:'应用'}, {id:'create',label:'新增内容',group:'应用'}, {id:'settings',label:'打开设置',group:'应用'}, {id:'help',label:'查看快捷键',group:'应用'}, {id:'quit',label:'退出专注记',group:'应用'},
 ...([['today','今日'],['inbox','收件箱'],['projects','任务'],['notes','笔记'],['reminders','提醒'],['calendar','日历'],['review','回顾']] as const).map(([id,label])=>({id:`navigate-${id}` as const,label:`前往${label}`,group:'导航'})),
 {id:'create-sibling',label:'新增同级事项',group:'事项树'}, {id:'create-child',label:'新增子事项',group:'事项树'}, {id:'rename',label:'编辑名称',group:'事项树'}, {id:'toggle-timer',label:'开始／暂停计时',group:'事项树'}, {id:'stop-timer',label:'结束计时',group:'事项树'}, {id:'complete',label:'完成／重新打开',group:'事项树'}, {id:'delete',label:'移入回收站',group:'事项树'}
] as const;
export type ShortcutAction=typeof SHORTCUT_ACTIONS[number]['id'];
export type ShortcutBindings=Record<ShortcutAction,string|null>;
type KeyEvent={key:string;code?:string;ctrlKey:boolean;metaKey:boolean;altKey:boolean;shiftKey:boolean;isComposing?:boolean;keyCode?:number;getModifierState?:(key:string)=>boolean};
export function defaultsForPlatform(platform:DesktopPlatform):ShortcutBindings {
 const defaults=Object.fromEntries(SHORTCUT_ACTIONS.map(({id})=>[id,null])) as ShortcutBindings;
 return {...defaults,undo:'Primary+Z',redo:'Primary+Shift+Z','search-current':'Primary+F','search-global':'Primary+K',create:'Primary+N',settings:'Primary+Comma',help:'Primary+Slash',quit:platform==='darwin'?null:'Primary+Shift+Q','create-sibling':platform==='darwin'?'Primary+Shift+N':'Insert','create-child':platform==='darwin'?'Primary+Alt+N':'Primary+Insert',rename:'F2','toggle-timer':'Primary+Enter','stop-timer':'Primary+Shift+Enter',complete:'Space',delete:platform==='darwin'?'Backspace':'Delete'};
}
export function shortcutAction(event:KeyEvent,bindings:ShortcutBindings,platform:DesktopPlatform):ShortcutAction|null {
 const chord=shortcutFromEvent(event,platform);if(!chord)return null;
 const matched=SHORTCUT_ACTIONS.find(({id})=>bindings[id]===chord)?.id;
 // Keep the familiar Windows redo alias while the default binding is in use.
 return matched??(platform==='win32'&&chord==='Primary+Y'&&bindings.redo==='Primary+Shift+Z'?'redo':null);
}
export function shortcutFromEvent(event:KeyEvent,platform:DesktopPlatform):string|null {
 if(event.isComposing||event.keyCode===229||event.getModifierState?.('AltGraph')||['Control','Meta','Alt','Shift','Dead','Unidentified'].includes(event.key))return null;
 const primary=platform==='darwin'?event.metaKey:event.ctrlKey, other=platform==='darwin'?event.ctrlKey:event.metaKey;
 if(other)return null;
 let key=event.code==='Slash'||event.key==='/'?'Slash':event.code==='Comma'||event.key===','?'Comma':event.key===' '?'Space':event.key.length===1?event.key.toUpperCase():event.key;
 return [...(primary?['Primary']:[]),...(event.altKey?['Alt']:[]),...(event.shiftKey?['Shift']:[]),key].join('+');
}
export function formatShortcut(value:string|null,platform:DesktopPlatform):string {
 if(!value)return '未设置';
 return value.split('+').map(part=>({Primary:platform==='darwin'?'⌘':'Ctrl',Alt:platform==='darwin'?'⌥':'Alt',Shift:platform==='darwin'?'⇧':'Shift',Space:'Space',Slash:'/',Comma:','} as Record<string,string>)[part]??part).join(' + ');
}
export function validateShortcutBindings(bindings:ShortcutBindings,platform:DesktopPlatform):string|null {
 const seen=new Map<string,string>();
 for(const action of SHORTCUT_ACTIONS){
  const chord=bindings[action.id]; if(chord===null)continue;
  if(typeof chord!=='string')return `${action.label}的快捷键无效`;
  const parts=chord.split('+'),key=parts.at(-1)!,mods=parts.slice(0,-1);
  if(mods.join('+')!==['Primary','Alt','Shift'].filter(m=>mods.includes(m)).join('+')||new Set(mods).size!==mods.length)return `${action.label}的快捷键无效`;
  const tree=action.group==='事项树';
  const plainTree=tree&&mods.length===0&&['Insert','F2','Space','Delete','Backspace'].includes(key);
  const specialTree=tree&&mods[0]==='Primary'&&['Enter','Insert'].includes(key)&&!mods.includes('Alt');
  const modified=mods.includes('Primary')&&(/^[A-Z0-9]$/.test(key)||['Slash','Comma'].includes(key));
  if(!(plainTree||specialTree||modified))return `${action.label}：请选择带 Ctrl／⌘ 的字母、数字或标点组合`;
  const editBinding=action.id==='undo'&&chord==='Primary+Z'||action.id==='redo'&&['Primary+Shift+Z','Primary+Y'].includes(chord);
  if(modified&&['A','C','V','X','Z','Y'].includes(key)&&!editBinding)return '该组合保留给文字编辑和选择；撤销／重做请在对应操作中设置';
  if(platform==='darwin'&&modified&&key==='Q'&&mods.length===1)return '⌘ Q 由系统保留用于退出';
  const previous=seen.get(chord);if(previous)return `“${action.label}”与“${previous}”的快捷键冲突`;seen.set(chord,action.label);
 }
 return null;
}
