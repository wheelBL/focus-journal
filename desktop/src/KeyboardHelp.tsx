import React from 'react';
import {Button,Modal,useJournal} from './ui';

export function KeyboardHelp(){
 const {dialog}=useJournal();
 const groups=[
  ['添加事项',[['- / o + 空格','记录笔记／信息或事件'],['Enter','保存并继续添加'],['Ctrl + Enter','保存并结束添加'],['Tab','作为前一同级事项的子项'],['Shift + Tab','提升一级，放到原父项后面'],['Esc','取消尚未保存的输入']]],
  ['选中树中的一行',[['↑ / ↓','选择上一项 / 下一项'],['Ctrl / Shift + 单击','增减选择 / 连续选择'],['Shift + ↑ / ↓','扩大或缩小连续选区'],['Ctrl + Space','切换当前行的多选状态'],['Ctrl + A','全选当前可见匹配项 / 清除全选'],['Escape','清除多选'],['← / →','收起 / 展开层级'],['Enter / F2','编辑名称'],['Insert','在后面新增同级事项'],['Ctrl + Insert','新增子事项'],['Tab / Shift + Tab','缩进 / 提升整棵分支'],['Ctrl + ↑ / ↓','同级上移 / 下移（手动顺序）'],['Ctrl + Enter','开始 / 暂停 / 恢复计时'],['Ctrl + Shift + Enter','结束本次计时并填写小结'],['Space','完成 / 重新打开事项'],['Delete','移入回收站，先查看影响'],['Shift + F10','打开右键菜单'],['Ctrl + Z','撤销整理，不回退投入记录']]],
  ['全局',[['Ctrl + Alt + Space','Windows 快速记录（可在设置更改）'],['Ctrl + K','搜索事项与笔记'],['Ctrl + N','新增事项'],['Ctrl + /','查看快捷键']]]
 ] as const;
 return <Modal title="事项快捷操作" onClose={()=>dialog(null)}><p className="muted">树中快捷键在选中行获得焦点时生效。编辑文字或日期时，保留输入框的常规操作。</p><div className="shortcut-groups">{groups.map(([title,rows])=><section key={title}><h3>{title}</h3><dl>{rows.map(([key,label])=><React.Fragment key={key}><dt><kbd>{key}</kbd></dt><dd>{label}</dd></React.Fragment>)}</dl></section>)}</div><footer className="modal-actions"><Button primary onClick={()=>dialog(null)}>知道了</Button></footer></Modal>;
}
