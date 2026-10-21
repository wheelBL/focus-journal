import React,{useEffect,useState} from 'react';
import {api} from './api';
import {Button,Field} from './ui';
import type {CapturePreferences} from '../core/types';
export function CaptureSettings(){
 const [prefs,setPrefs]=useState<CapturePreferences|null>(null),[value,setValue]=useState(''),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
 useEffect(()=>{void api.capture?.preferences().then(p=>{setPrefs(p);setValue(p.shortcut);}).catch(e=>setMessage(e.message));},[]);
 return <section className="settings-section" id="settings-capture"><h2>随时快速记录</h2><p>在其他软件中按全局快捷键，或从托盘打开小窗口。Enter 保存并收起，Escape 收起并保留草稿。应用需保持运行。</p>{api.capture?<><form className="capture-preferences" onSubmit={e=>{e.preventDefault();setBusy(true);void api.capture!.configure(value).then(p=>{setPrefs(p);setMessage(p.registered?'快捷键已生效':'快捷键已关闭，仍可使用托盘');}).catch(e=>setMessage(e.message)).finally(()=>setBusy(false));}}><Field label="全局快捷键（留空关闭）"><input aria-label="全局快速记录快捷键" value={value} onChange={e=>setValue(e.target.value)} placeholder="Ctrl+Alt+Space"/></Field><Button type="submit" disabled={busy}>保存快捷键</Button><Button type="button" onClick={()=>void api.capture!.open()}>打开快速记录</Button></form>{prefs?.error&&<p role="alert">{prefs.error}</p>}{message&&<p role="status">{message}</p>}</>:<p className="muted">全局快捷键在 Windows 桌面版中提供。</p>}</section>;
}
