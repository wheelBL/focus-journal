import React,{useCallback,useEffect,useRef,useState} from 'react';
import {ArrowSync20Regular} from '@fluentui/react-icons';
import {api} from './api';
import {Button,Field,useJournal} from './ui';
import type {SyncStatus,SyncSummary} from '../core/sync-types';

function useSync(){
 const [status,storeStatus]=useState<SyncStatus|null>(null),[loading,setLoading]=useState(!!api.sync),[error,setError]=useState(''),active=useRef(false),generation=useRef(0),reading=useRef<number|null>(null);
 const setStatus=useCallback((value:SyncStatus)=>{generation.current++;if(active.current){storeStatus(value);setLoading(false);setError('');}},[]);
 const refresh=useCallback(async()=>{if(!api.sync||reading.current!==null)return;const request=++generation.current;reading.current=request;setLoading(true);setError('');try{const next=await api.sync.status();if(active.current&&request===generation.current)storeStatus(next);}catch(e){if(active.current&&request===generation.current)setError(e instanceof Error?e.message:String(e));}finally{if(reading.current===request)reading.current=null;if(active.current&&request===generation.current)setLoading(false);}},[]);
 useEffect(()=>{active.current=true;const off=api.sync?.onChanged(setStatus);void refresh();return()=>{active.current=false;generation.current++;reading.current=null;off?.();};},[refresh,setStatus]);
 return {status,setStatus,loading,error,refresh};
}
const stamp=(value:string|null)=>value?new Date(value).toLocaleString('zh-CN',{hour12:false}):'尚未同步';
function Summary({value}:{value:SyncSummary}){return <p>{value.items} 个事项（含 {value.projects} 个项目） · {value.sessions} 条投入记录 · {value.minutes} 分钟 · {value.notes} 条笔记</p>;}
export function SyncShortcut({open,notify}:{open:()=>void;notify:(text:string)=>void}){
 const {status,setStatus,loading,error}=useSync();if(!api.sync)return null;
 return <div className="sync-shortcut"><button className="nav-item" aria-label="一键同步" disabled={status?.phase==='working'} onClick={()=>{
  if(loading||error||!status?.config||status.phase==='conflict'){open();return;}
  void api.sync!.run().then(s=>{setStatus(s);notify(s.message);if(s.phase==='conflict'||s.phase==='error')open();}).catch(e=>notify(e.message));
 }}><ArrowSync20Regular/><span>{status?.phase==='working'?'正在同步…':status?.phase==='conflict'?'处理同步冲突':'一键同步'}</span></button>{error?<small role="status">同步状态未读取 · 点击处理</small>:status?.config&&<small title={status.message}>{status.phase==='error'?'同步未完成 · 点击重试':status.lastSuccess?`上次 ${stamp(status.lastSuccess)}`:'GitCode 已配置'}</small>}</div>;
}
export function SyncSettingsSection(){
 const {notify}=useJournal(),{status,setStatus,loading,error:readError,refresh}=useSync();
 const [repository,setRepository]=useState(''),[username,setUsername]=useState(''),[branch,setBranch]=useState('focus-journal'),[token,setToken]=useState(''),[working,setWorking]=useState(false),[error,setError]=useState(''),[choice,setChoice]=useState<'local'|'remote'|null>(null),[disconnecting,setDisconnecting]=useState(false);
 const edited=useRef(false),pending=useRef(false),alive=useRef(true);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
 const resetDraft=(value:SyncStatus)=>{edited.current=false;setRepository(value.config?.repository??'');setUsername(value.config?.username??'');setBranch(value.config?.branch??'focus-journal');setToken('');};
 useEffect(()=>{if(status&&!edited.current)resetDraft(status);},[status?.config?.repository,status?.config?.username,status?.config?.branch]);
 useEffect(()=>setChoice(null),[status?.conflict?.id]);
 const busy=loading||!status||working||status.phase==='working',dirty=repository.trim()!==(status?.config?.repository??'')||username.trim()!==(status?.config?.username??'')||branch.trim()!==(status?.config?.branch??'focus-journal')||!!token;
 const perform=async(fn:()=>Promise<SyncStatus>,reset=false)=>{if(pending.current)return;pending.current=true;setWorking(true);setError('');try{const s=await fn();if(alive.current){setStatus(s);if(reset)resetDraft(s);if(s.phase!=='error'&&s.phase!=='conflict')notify(s.message);}}catch(e){if(alive.current)setError(e instanceof Error?e.message:String(e));}finally{pending.current=false;if(alive.current)setWorking(false);}};
 if(!api.sync)return <section id="settings-sync" className="settings-section"><h2>GitCode 同步</h2><p>请在 Windows 桌面版中配置仓库和一键同步。</p></section>;
 return <section id="settings-sync" className="settings-section sync-settings"><h2>GitCode 同步</h2><p>在这台电脑收工时同步，到另一台电脑先同步再开始。事项、层级、标签、视图、估计、投入记录、笔记和复盘会一起保存。</p>
  {loading&&<p role="status">正在读取同步设置…</p>}{readError&&<div role="alert"><p>未能读取同步设置：{readError}</p><Button disabled={loading} onClick={()=>void refresh()}>重试读取同步设置</Button></div>}
  <form aria-busy={busy} onSubmit={e=>{e.preventDefault();if(busy)return;void perform(async()=>{const s=await api.sync!.configure({repository,username,branch,token});if(alive.current){setStatus(s);resetDraft(s);}return api.sync!.test();});}}>
   <Field label="GitCode 仓库地址" hint="使用仓库的 HTTPS 克隆地址，建议使用自己的私有仓库。"><input aria-label="GitCode 仓库地址" required type="url" maxLength={600} placeholder="https://gitcode.com/用户名/仓库.git" value={repository} onChange={e=>{edited.current=true;setRepository(e.target.value);}} disabled={busy}/></Field>
   <div className="form-grid"><Field label="GitCode 用户名" hint="填写登录用户名，不使用昵称。"><input aria-label="GitCode 用户名" required maxLength={120} autoComplete="off" value={username} onChange={e=>{edited.current=true;setUsername(e.target.value);}} disabled={busy}/></Field><Field label="访问令牌（PAT）" hint={status?.config?.hasToken?'已加密保存；留空保留，更换仓库或用户名时重新填写。':'在 GitCode 个人设置中创建可读写此仓库的访问令牌。'}><input aria-label="GitCode 访问令牌" type="password" maxLength={4096} autoComplete="new-password" value={token} onChange={e=>{edited.current=true;setToken(e.target.value);}} placeholder={status?.config?.hasToken?'已保存（不会回显）':'粘贴访问令牌'} disabled={busy}/></Field></div>
   <details className="sync-advanced"><summary>同步分支</summary><Field label="分支名称" hint="默认使用独立的 focus-journal 分支，不改动仓库的主分支。每台电脑需使用相同分支。"><input aria-label="同步分支" required maxLength={100} value={branch} onChange={e=>{edited.current=true;setBranch(e.target.value);}} disabled={busy}/></Field></details>
   <div className="actions"><Button type="submit" disabled={busy}>保存并测试连接</Button><Button type="button" primary disabled={busy||!status?.config||dirty} onClick={()=>void perform(()=>api.sync!.run())}><ArrowSync20Regular/>立即同步</Button>{status?.config&&<Button type="button" subtle disabled={busy} onClick={()=>setDisconnecting(true)}>断开连接</Button>}</div>
   <p className="muted sync-note">令牌由 Windows 加密，仅保存在这台电脑；不会进入日志备份或仓库。更换电脑需要分别配置。同步前请暂停正在计时的事项。</p>
  </form>
  {error&&<p className="error-banner" role="alert">{error}</p>}
  {status&&<div className={`sync-status sync-${status.phase}`} role={status.phase==='error'?'alert':'status'}><strong>{status.phase==='working'?'同步进行中':status.phase==='conflict'?'需要处理冲突':status.phase==='error'?'同步未完成':status.config?'GitCode 已连接':'尚未配置'}</strong><p>{status.message}</p><small>上次成功同步：{stamp(status.lastSuccess)}</small></div>}
  {status?.conflict&&<div className="sync-conflict"><h3>选择保留的内容</h3><div className="sync-comparison"><div><strong>本机</strong><Summary value={status.conflict.local}/></div><div><strong>GitCode 远端</strong>{status.conflict.remote?<><Summary value={status.conflict.remote}/><small>快照保存于 {stamp(status.conflict.remoteUpdatedAt)}</small></>:<p>没有同步文件</p>}</div></div><p>这版按整份日志同步。载入远端前会备份本机；上传本机时，旧远端仍保留在 Git 提交历史中。</p>
   {choice?<div className="sync-confirm" role="group" aria-label="确认同步选择"><p>{choice==='remote'?'将备份本机，并用远端整份日志替换当前内容。':'将本机整份日志作为新的远端版本上传。'}确认继续？</p><div className="actions"><Button primary disabled={busy} onClick={()=>{const selected=choice;setChoice(null);void perform(()=>api.sync!.resolve(status.conflict!.id,selected));}}>确认{choice==='remote'?'载入远端':'上传本机'}</Button><Button disabled={busy} onClick={()=>setChoice(null)}>取消</Button></div></div>:<div className="actions"><Button disabled={busy||!status.conflict.remote} onClick={()=>setChoice('remote')}>使用远端内容…</Button><Button disabled={busy} onClick={()=>setChoice('local')}>保留本机并上传…</Button></div>}
  </div>}
  {disconnecting&&<div className="sync-confirm" role="group" aria-label="确认断开同步"><p>移除这台电脑的仓库配置和保存的令牌？本机日志、远端仓库都会保留。</p><div className="actions"><Button disabled={busy} onClick={()=>{setDisconnecting(false);void perform(()=>api.sync!.disconnect(),true);}}>确认断开连接</Button><Button disabled={busy} onClick={()=>setDisconnecting(false)}>取消</Button></div></div>}
 </section>;
}
