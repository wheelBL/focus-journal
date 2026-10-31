import React,{useState} from 'react';
import {WeatherMoon20Regular} from '@fluentui/react-icons';
import {setAppearance,useAppearance} from './appearance';
import type {ThemePreference,MotionPreference} from '../core/appearance';
function ThemeOptions(){return <><option value="system">跟随系统</option><option value="light">浅色</option><option value="dark">深色</option></>;}
export function AppearanceQuickSwitch(){
 const value=useAppearance(),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 return <div className="appearance-quick"><label><WeatherMoon20Regular/><span>外观</span><select aria-label="切换外观" disabled={busy} value={value.theme} onChange={async e=>{const theme=e.target.value as ThemePreference;setBusy(true);try{await setAppearance({...value,theme});setError('');}catch(e){setError((e as Error).message);}finally{setBusy(false);}}}><ThemeOptions/></select></label>{error&&<p role="alert">{error}</p>}</div>;
}
export function AppearanceSettings(){
 const value=useAppearance(),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 async function update(next:typeof value){setBusy(true);try{await setAppearance(next);setError('');}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 return <section className="settings-section" id="settings-appearance"><h2>外观与动效</h2><div className="form-grid"><label className="field"><span>外观</span><select aria-label="外观偏好" disabled={busy} value={value.theme} onChange={e=>void update({...value,theme:e.target.value as ThemePreference})}><ThemeOptions/></select></label><label className="field"><span>动效</span><select aria-label="动效偏好" disabled={busy} value={value.motion} onChange={e=>void update({...value,motion:e.target.value as MotionPreference})}><option value="system">跟随系统</option><option value="full">标准</option><option value="reduce">减少动效</option></select></label></div><p>设置立即生效，并在本机记住。主窗口、快速记录、提醒和屏边计时签保持一致。</p><p>标准动效用轻微过渡提示完成、层级调整和详情切换。跟随系统时，尊重系统的减少动效设置。</p>{error&&<p className="form-error" role="alert">{error}</p>}</section>;
}
