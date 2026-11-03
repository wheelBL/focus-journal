import {recordOperation} from './operation-entry';
import React,{useEffect,useRef,useState} from 'react';
import {SHORTCUT_ACTIONS,defaultsForPlatform,formatShortcut,shortcutFromEvent,validateShortcutBindings,type ShortcutAction,type ShortcutBindings} from '../core/shortcuts';
import {desktopPlatform} from './platform';
import {saveShortcuts,useShortcuts} from './shortcuts';
import {requestSettingsSection} from './settings-navigation';
import {Button} from './ui';
import {useSettingsAction} from './useSettingsAction';
import './ShortcutSettings.css';

export function ShortcutSettings(){
 const configured=useShortcuts(),platform=desktopPlatform(),defaults=defaultsForPlatform(platform);
 const [draft,setDraft]=useState<ShortcutBindings>(()=>({...configured})),[errors,setErrors]=useState<Partial<Record<ShortcutAction,string>>>({}),[message,setMessage]=useState('');
 const previousSaved=useRef(configured);
 useEffect(()=>{const previous=previousSaved.current;previousSaved.current=configured;setDraft(current=>SHORTCUT_ACTIONS.every(({id})=>current[id]===previous[id])?{...configured}:current);},[configured]);
 const action=useSettingsAction(),dirty=SHORTCUT_ACTIONS.some(({id})=>draft[id]!==configured[id]);
 const update=(id:ShortcutAction,value:string|null)=>{const error=validateShortcutBindings({...draft,[id]:value},platform);setMessage('');if(error){setErrors(previous=>({...previous,[id]:error}));return;}setDraft(previous=>({...previous,[id]:value}));setErrors(previous=>({...previous,[id]:undefined}));};
 const record=(id:ShortcutAction,event:React.KeyboardEvent<HTMLInputElement>)=>{
  if(event.nativeEvent.isComposing||event.keyCode===229||event.key==='Tab')return;
  if(event.key==='Escape'){event.preventDefault();event.stopPropagation();setErrors(previous=>({...previous,[id]:undefined}));event.currentTarget.blur();return;}
  event.preventDefault();event.stopPropagation();const chord=shortcutFromEvent(event.nativeEvent,platform);if(!chord)return;
  const error=validateShortcutBindings({...draft,[id]:chord},platform);setMessage('');
  if(error){setErrors(previous=>({...previous,[id]:error}));return;}update(id,chord);
 };
 const invalid=Object.values(errors).some(Boolean);
 return <section className="settings-section shortcut-settings" id="settings-shortcuts"><h2>快捷键</h2><p>应用快捷键仅在专注记窗口内生效。点击快捷键框后直接按组合键；Escape 结束录入，Tab 移到下一项。更改保存后生效，仅保存在这台设备。</p><p>输入框内保留系统撤销、重做、全选和剪贴板操作。下方撤销／重做用于已保存的事项修改，Windows 默认还支持 Ctrl + Y；重新配置后该别名停用。事项树操作仅在列表行获得焦点时生效。</p>
 <form aria-label="应用快捷键设置" aria-busy={action.saving} onSubmit={event=>{event.preventDefault();if(invalid)return;const submitted={...draft},changed=SHORTCUT_ACTIONS.filter(({id})=>submitted[id]!==configured[id]);if(!changed.length)return;const operation=SHORTCUT_ACTIONS.every(({id})=>submitted[id]===defaults[id])?'settings.shortcuts.reset':changed.every(({id})=>submitted[id]===null)?'settings.shortcuts.clear':'settings.shortcuts.save';void action.perform(async()=>{saveShortcuts(submitted);recordOperation(operation,'settings.shortcuts');},()=>setMessage('快捷键已保存'));}}><fieldset className="settings-fields" disabled={action.saving}>
 <div className="shortcut-save-bar"><p className="shortcut-save-state">{dirty?'有未保存的快捷键更改':'当前快捷键已生效'}{platform==='darwin'?'。⌘ Q 由系统提供退出。':''}</p>{action.error&&<p role="alert" className="form-error">{action.error}</p>}{message&&<p role="status">{message}</p>}<div className="actions"><Button primary type="submit" disabled={!dirty||invalid}>{action.saving?'正在保存…':'保存快捷键设置'}</Button><Button type="button" onClick={()=>{setDraft(defaults);setErrors({});setMessage('已恢复默认，请保存以应用');}}>恢复全部默认</Button></div></div>
 {['编辑','应用','导航','事项树'].map(group=><section className="shortcut-settings-group" key={group} aria-label={`${group}快捷键`}><h3>{group==='事项树'?'事项树 · 选中行获得焦点时':group}</h3>{SHORTCUT_ACTIONS.filter(entry=>entry.group===group).map(({id,label})=><div className="shortcut-setting-row" key={id} data-shortcut-action={id}><label htmlFor={`shortcut-${id}`}>{label}</label><input id={`shortcut-${id}`} aria-label={`${label}快捷键`} className="shortcut-recorder" data-shortcut-recorder="true" readOnly value={formatShortcut(draft[id],platform)} aria-invalid={!!errors[id]} aria-describedby={errors[id]?`shortcut-error-${id}`:undefined} onKeyDown={event=>record(id,event)} title="点击后按下快捷键"/><div className="shortcut-row-actions"><Button type="button" subtle aria-label={`清除${label}快捷键`} onClick={()=>update(id,null)}>清除</Button><Button type="button" subtle aria-label={`恢复${label}默认快捷键`} onClick={()=>update(id,defaults[id])}>默认</Button></div>{errors[id]&&<p className="shortcut-row-error" id={`shortcut-error-${id}`} role="alert">{errors[id]}</p>}</div>)}</section>)}
 </fieldset></form>
 <section className="shortcut-global-capture"><h3>在其他软件中快速记录</h3><p>全局快速记录快捷键由系统注册，即使专注记收起到托盘也能使用，需在快速记录中单独设置。</p><Button type="button" onClick={()=>requestSettingsSection('capture')}>设置全局快速记录快捷键</Button></section>
 </section>;
}
