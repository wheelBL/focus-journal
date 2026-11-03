import React,{useEffect,useState} from 'react';
import {SHORTCUT_ACTIONS,formatShortcut} from '../core/shortcuts';
import {desktopPlatform,isMac,shortcutLabel} from './platform';
import {useShortcuts} from './shortcuts';
import {requestSettingsSection} from './settings-navigation';
import {api} from './api';
import {Button,Modal,useJournal} from './ui';

const captureLabel=(value:string)=>value.replace(/CommandOrControl|CmdOrCtrl/g,isMac()?'⌘':'Ctrl').replace(/Command|Cmd/g,'⌘').replace(/Control|Ctrl/g,isMac()?'⌃':'Ctrl').replace(/Option|Alt/g,isMac()?'⌥':'Alt').replace(/Shift/g,isMac()?'⇧':'Shift');

export function KeyboardHelp(){
 const {dialog,navigate}=useJournal(),bindings=useShortcuts(),platform=desktopPlatform(),[capture,setCapture]=useState<string|null>(null);
 useEffect(()=>{let active=true;if(api.capture)void api.capture.preferences().then(p=>{if(active)setCapture(p.shortcut?`${captureLabel(p.shortcut)}${p.registered?'':'（未注册）'}`:'已关闭');}).catch(()=>{});return()=>{active=false;};},[]);
 const groups:Array<[string,Array<[string,string]>]>=[
  ...['编辑','应用','导航','事项树'].map(group=>[group==='应用'?'应用内':group==='事项树'?'选中树中的一行':group,SHORTCUT_ACTIONS.filter(action=>action.group===group).map(({id,label})=>[formatShortcut(bindings[id],platform),label] as [string,string])] as [string,Array<[string,string]>]),
  ['添加事项',[['- / o + 空格','记录笔记／信息或事件'],['Enter','保存并继续添加'],['Ctrl + Enter','保存并结束添加'],['Tab','作为前一同级事项的子项'],['Shift + Tab','提升一级，放到原父项后面'],['Esc','取消尚未保存的输入']]],
  ['树中固定操作',[['↑ / ↓','选择上一项 / 下一项'],['Ctrl / Shift + 单击','增减选择 / 连续选择'],['Shift + ↑ / ↓','扩大或缩小连续选区'],[isMac()?'⌘ + ⇧ + X':'Ctrl + Space','切换当前行的多选状态'],['Ctrl + A','全选当前可见匹配项 / 清除全选'],['Escape','清除多选'],['← / →','收起 / 展开层级'],['Enter','编辑名称'],['Tab / Shift + Tab','缩进 / 提升整棵分支'],['Ctrl + ↑ / ↓','同级上移 / 下移（手动顺序）'],['Shift + F10','打开右键菜单']]],
  ['文字编辑（固定）',[[isMac()?'⌘ + Z':'Ctrl + Z','撤销输入框内的文字编辑'],[isMac()?'⌘ + ⇧ + Z':'Ctrl + Y / Ctrl + Shift + Z','重做文字编辑'],['Ctrl + A','全选输入内容'],['Ctrl + C / X / V','复制／剪切／粘贴文字']]],
  ['系统全局',[[capture?shortcutLabel(capture):'在快速记录中设置','全局快速记录（应用保持运行时）'],...(isMac()?[['⌘ + Q','系统退出快捷键'] as [string,string]]:[])]]
 ];
 const configure=(section:'shortcuts'|'capture')=>{dialog(null);requestSettingsSection(section);navigate('settings');};
 return <Modal title="事项快捷操作" onClose={()=>dialog(null)}><p className="muted">应用内快捷键使用当前已保存设置；树中操作在选中行获得焦点时生效。输入法组合输入不触发快捷键。编辑文字时优先撤销文字；离开输入框后撤销最近的事项修改。撤销不回退投入或重新启动计时，重启后清空撤销历史。Windows 默认还支持 Ctrl + Y 重做。</p><Button onClick={()=>configure('shortcuts')}>配置快捷键</Button><div className="shortcut-groups">{groups.map(([title,rows])=><section key={title}><h3>{title}</h3><dl>{rows.map(([key,label])=><React.Fragment key={label}><dt><kbd>{shortcutLabel(key)}</kbd></dt><dd>{label}</dd></React.Fragment>)}</dl></section>)}</div><Button onClick={()=>configure('capture')}>设置全局快速记录快捷键</Button><footer className="modal-actions"><Button primary onClick={()=>dialog(null)}>知道了</Button></footer></Modal>;
}
