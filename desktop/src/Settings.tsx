import React,{useLayoutEffect,useState} from 'react';
import {isMac,shortcutLabel} from './platform';
import {applySettingsSection,requestSettingsSection,settingsSections,useSettingsSection,type SettingsSection} from './settings-navigation';
import {AiSettings} from './AiSettings';
import {AppearanceSettings} from './AppearanceSettings';
import {ArrowDownload20Regular,ArrowUpload20Regular} from '@fluentui/react-icons';
import {version as appVersion} from '../package.json';
import {LocalApiSettings} from './LocalApiSettings';
import {CaptureSettings} from './CaptureSettings';
import {ReminderSettingsSection} from './ReminderSettings';
import {SyncSettingsSection} from './SyncSettings';
import {useWorkspaceJournal,Button,Field} from './ui';
import {useSettingsAction} from './useSettingsAction';
import {api,isDesktop} from './api';

export function Settings(){
 const selected=useSettingsSection(),[mounted,setMounted]=useState<Set<SettingsSection>>(()=>new Set([selected]));
 useLayoutEffect(()=>{setMounted(previous=>previous.has(selected)?previous:new Set([...previous,selected]));applySettingsSection();},[selected]);
 return <section className="page settings-page"><header className="page-header"><h1>设置</h1></header><label className="settings-compact-navigation">分类<select aria-label="设置类别" value={selected} onChange={e=>requestSettingsSection(e.target.value)}>{settingsSections.map(({id,label})=><option key={id} value={id}>{label}</option>)}</select></label>{settingsSections.map(({id,label})=>{const Content=contents[id];return <div className="settings-category" key={id} id={`settings-category-${id}`} role="region" aria-label={label} hidden={selected!==id}>{mounted.has(id)||selected===id?<Content/>:null}</div>;})}</section>;
}

function FocusSettings(){
 const {data,run,notify}=useWorkspaceJournal();const [target,setTarget]=useState(data.state.settings.targetMinutes),[rest,setRest]=useState(data.state.settings.breakMinutes);
 const action=useSettingsAction();
 const save=()=>action.perform(()=>run({type:'settings.save',payload:{targetMinutes:target,breakMinutes:rest}}),()=>notify('设置已保存，下次专注生效'));
 return <section className="settings-section" id="settings-focus"><h2>专注与休息</h2><form onSubmit={e=>{e.preventDefault();void save();}}><fieldset className="settings-fields" disabled={action.saving}><div className="form-grid"><Field label="本次专注目标（分钟）"><input type="number" min={1} max={240} required value={target} onChange={e=>setTarget(Number(e.target.value))}/></Field><Field label="短休息（分钟）"><input type="number" min={1} max={60} required value={rest} onChange={e=>setRest(Number(e.target.value))}/></Field></div><p>到达目标后只提醒，继续计时，直到你主动结束。一个标准番茄固定按 25 分钟换算任务估计。</p>{action.error&&<p role="alert" className="form-error">{action.error}</p>}{action.saving&&<p role="status">正在保存…</p>}<Button primary type="submit" disabled={action.saving}>保存设置</Button></fieldset></form></section>;
}

function DataSettings(){
 const {data,notify}=useWorkspaceJournal();
 const exportFile=async(format:'json'|'csv')=>{try{const file=await api.exportData(format);if(file)notify(`已保存：${file}`);}catch(e){notify(e instanceof Error?e.message:String(e));}};
 return <section className="settings-section" id="settings-data"><h2>数据与备份</h2><p>全部记录保存在这台电脑。每天首次打开会保存一份 JSON 备份。</p><div className="data-path">{data.dataPath}</div><div className="actions"><Button onClick={()=>void exportFile('json')}><ArrowDownload20Regular/>备份全部数据</Button><Button onClick={()=>void exportFile('csv')}>导出投入 CSV</Button><Button disabled={!isDesktop} onClick={()=>void api.importData().then(s=>{if(s){notify('已恢复备份');window.location.reload();}}).catch(e=>notify(e instanceof Error?e.message:String(e)))}><ArrowUpload20Regular/>恢复备份</Button><Button disabled={!isDesktop} onClick={()=>void api.openDataFolder()}>打开数据文件夹</Button></div></section>;
}

function HabitSettings(){
 const {data,dialog}=useWorkspaceJournal();
 return <section className="settings-section" id="settings-habits"><h2>使用习惯</h2><p>{data.demo?'这是独立测试工作区，关闭窗口会保存并退出，不留托盘图标。':'关闭窗口后保留在系统托盘中，计时继续。选择托盘中的“退出专注记”会保存并暂停全部计时器。'}电脑休眠时自动暂停全部计时器，回来后由你决定何时恢复。</p><p>{shortcutLabel('Ctrl + K 搜索；Ctrl + N 新建事项；事项树中 ')}{isMac()?'⌘ + ⇧ + N 新增同级、⌘ + ⌥ + N 新增子项、':'Insert 新增同级、Ctrl + Insert 新增子项、'}{shortcutLabel('F2 改名、Ctrl + Z 撤销整理；今日快速添加事项：Enter 保存。')}</p><Button onClick={()=>dialog({type:'shortcuts'})}>查看事项快捷键</Button><p className="muted">专注记 {appVersion}</p>{isDesktop&&<Button onClick={()=>void api.windowAction('quit')}>保存并退出专注记</Button>}</section>;
}

const contents:Record<SettingsSection,React.ComponentType>={appearance:AppearanceSettings,focus:FocusSettings,reminders:ReminderSettingsSection,capture:CaptureSettings,ai:AiSettings,api:LocalApiSettings,sync:SyncSettingsSection,data:DataSettings,habits:HabitSettings};
