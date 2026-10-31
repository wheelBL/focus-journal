import React,{useEffect,useState} from 'react';
import {api} from './api';
import {Button,Field} from './ui';
import type {CapturePreferences} from '../core/types';
import {useSettingsAction} from './useSettingsAction';
export function CaptureSettings(){
 const [prefs,setPrefs]=useState<CapturePreferences|null>(null),[value,setValue]=useState(''),[message,setMessage]=useState(''),action=useSettingsAction();
 useEffect(()=>{if(api.capture)void action.perform(()=>api.capture!.preferences(),p=>{setPrefs(p);setValue(p.shortcut);});},[]);
 return <section className="settings-section" id="settings-capture"><h2>随时快速记录</h2><p>在其他软件中按全局快捷键，或从托盘打开小窗口。Enter 保存并收起，Escape 收起并保留草稿。应用需保持运行。</p>{api.capture?<><form aria-busy={action.saving} onSubmit={e=>{e.preventDefault();setMessage('');void action.perform(()=>api.capture!.configure(value),p=>{setPrefs(p);setValue(p.shortcut);setMessage(p.registered?'快捷键已生效':p.shortcut?'快捷键未生效，请更换组合后重试；仍可使用托盘。':'快捷键已关闭，仍可使用托盘');});}}><fieldset disabled={action.saving} className="settings-fields capture-preferences"><Field label="全局快捷键（留空关闭）"><input aria-label="全局快速记录快捷键" value={value} onChange={e=>{setValue(e.target.value);setMessage('');}} placeholder="Ctrl+Alt+Space"/></Field><Button type="submit">保存快捷键</Button><Button type="button" onClick={()=>void action.perform(()=>api.capture!.open())}>打开快速记录</Button></fieldset></form>{action.saving&&<p role="status">正在处理快捷记录设置…</p>}{prefs?.error&&<p role="alert">{prefs.error}</p>}{action.error&&<p role="alert">{action.error}</p>}{message&&<p role="status">{message}</p>}</>:<p className="muted">全局快捷键在 Windows 桌面版中提供。</p>}</section>;
}
