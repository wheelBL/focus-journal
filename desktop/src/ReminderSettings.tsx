import React,{useState} from 'react';
import {Speaker220Regular,Alert20Regular} from '@fluentui/react-icons';
import {api} from './api';
import {Button,Field,useJournal} from './ui';
import {reminderSettings} from '../core/reminders';

export function ReminderSettingsSection(){
 const {data,run,notify,busy}=useJournal(),[settings,setSettings]=useState(()=>reminderSettings(data.state.settings)),[testing,setTesting]=useState(false);
 const preview=async(mode:'sound'|'card')=>{if(!api.previewReminder)return;setTesting(true);try{await api.previewReminder(settings,mode);if(mode==='sound')notify('已播放试听；请按实际听感调整音量。');}catch(e){notify(e instanceof Error?e.message:String(e));}finally{setTesting(false);}};
 return <section id="settings-reminders" className="settings-section"><h2>到时提醒</h2><p>到时显示持续置顶卡片，保持原来的键盘输入焦点，计时继续。可结束本次、5 分钟后再提醒，或继续且本次不再提醒。</p>
  <form onSubmit={e=>{e.preventDefault();void run({type:'reminder.settings',payload:{settings}}).then(()=>notify('提醒设置已保存')).catch(()=>{});}}>
   <label className="sound-toggle"><input type="checkbox" checked={settings.sound} onChange={e=>setSettings({...settings,sound:e.target.checked})}/>播放提醒声音</label>
   <div className="form-grid"><Field label={`提醒音量 · ${settings.volume}%`} hint="仍受系统音量和当前输出设备影响。"><input aria-label="提醒音量" type="range" min={0} max={100} step={5} disabled={!settings.sound} value={settings.volume} onChange={e=>setSettings({...settings,volume:Number(e.target.value)})}/></Field>
   <Field label="未处理时，再次响铃间隔" hint="首次响铃后最多重复 3 次，卡片持续保留。"><select aria-label="重复提醒间隔" value={settings.repeatSeconds} onChange={e=>setSettings({...settings,repeatSeconds:Number(e.target.value)})}>{[15,30,60,120].map(seconds=><option key={seconds} value={seconds}>{seconds<60?`${seconds} 秒`:`${seconds/60} 分钟`}</option>)}</select></Field></div>
   <div className="actions"><Button primary type="submit" disabled={busy}>保存提醒设置</Button><Button type="button" disabled={!api.previewReminder||testing||!settings.sound||settings.volume===0} onClick={()=>void preview('sound')}><Speaker220Regular/>试听声音</Button><Button type="button" disabled={!api.previewReminder||testing} onClick={()=>void preview('card')}><Alert20Regular/>预览提醒</Button></div><p className="muted">试听和预览使用当前选项，可先试再保存；预览不产生投入记录。</p>
  </form>
 </section>;
}
