import React,{useEffect,useState} from 'react';
import {api} from './api';
import {Button,Field} from './ui';
import type {LocalApiStatus,LocalApiAccess} from '../core/local-api-types';
import './local-api.css';

export function LocalApiSettings(){
 const [status,setStatus]=useState<LocalApiStatus|null>(null),[enabled,setEnabled]=useState(false),[port,setPort]=useState('17642'),[access,setAccess]=useState<LocalApiAccess>('read');
 const [token,setToken]=useState(''),[error,setError]=useState(''),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
 const apply=(s:LocalApiStatus)=>{setStatus(s);setEnabled(s.enabled);setPort(String(s.port));setAccess(s.access);};
 useEffect(()=>{void api.localApi?.status().then(apply).catch(e=>setError(e.message));},[]);
 const perform=async(work:()=>Promise<void>)=>{setBusy(true);setError('');setMessage('');try{await work();}catch(e){setError(e instanceof Error?e.message:'操作未完成。');}finally{setBusy(false);}};
 return <section className="settings-section" id="settings-api"><h2>AI 与本机 API</h2><p>让这台电脑上的 AI 或脚本查询事项、管理今日重点、控制计时、补记投入和同步数据。应用运行时可用，收起到托盘后仍可调用。</p>
 {!api.localApi?<p className="muted">此功能在 Windows 桌面版中提供。</p>:<>
 <form className="local-api-form" onSubmit={e=>{e.preventDefault();void perform(async()=>{apply(await api.localApi!.configure({enabled,port:Number(port),access}));setToken('');setMessage(enabled?'本机 API 已启用':'本机 API 已关闭');});}}>
 <label className="local-api-enable"><input type="checkbox" aria-label="启用本机 API" checked={enabled} onChange={e=>setEnabled(e.target.checked)}/>启用本机 API</label>
 <div className="form-grid"><Field label="端口"><input aria-label="API 端口" type="number" min={1024} max={65535} required value={port} onChange={e=>setPort(e.target.value)}/></Field><Field label="访问权限"><select aria-label="API 访问权限" value={access} onChange={e=>setAccess(e.target.value as LocalApiAccess)}><option value="read">只读：查询事项与投入</option><option value="write">允许读取和修改</option></select></Field></div>
 <Button type="submit" disabled={busy||!status}>保存 API 设置</Button>
 </form>
 {status&&<div className="local-api-connection"><strong role="status">{status.running?'运行中':status.enabled?'未连接':'已关闭'} · {status.access==='write'?'允许修改':'只读'}</strong>{status.baseUrl&&<Field label="连接地址"><input aria-label="API 连接地址" readOnly value={status.baseUrl}/></Field>}{status.hasToken&&<><div className="actions"><Button disabled={busy} onClick={()=>{if(token)setToken('');else void perform(async()=>{setToken(await api.localApi!.token());});}}>{token?'隐藏访问密钥':'显示访问密钥'}</Button><Button disabled={busy} onClick={()=>void perform(async()=>{const value=await api.localApi!.token();await window.navigator.clipboard.writeText(value);setMessage('访问密钥已复制');})}>复制访问密钥</Button><Button disabled={busy} onClick={()=>void perform(async()=>{setToken(await api.localApi!.rotateToken());setMessage('密钥已重新生成；旧密钥立即失效，请更新 AI 客户端。');})}>重新生成密钥</Button></div>{token&&<Field label="访问密钥"><input aria-label="API 访问密钥" readOnly value={token} autoComplete="off" spellCheck={false}/></Field>}</>}</div>}
 <details className="local-api-guide"><summary>连接 AI 与调用示例</summary><p>将连接地址和访问密钥配置到本机 AI 客户端。接口说明可通过带鉴权的 <code>GET /openapi.json</code> 读取，全部请求携带 <code>Authorization: Bearer &lt;访问密钥&gt;</code>。</p><pre>{`GET /status\nGET /items?focus=today\nGET /timers\nPOST /commands\nIf-Match: <最近读取的 revision>\nIdempotency-Key: <每次操作一个唯一键>\n\n{"type":"item.create","payload":{"title":"整理周报"}}`}</pre><p>写操作遵循界面相同的业务规则；修订冲突时先重新读取。相同操作重试应复用原请求键；接口重启后旧修订号会失效。密钥仅在本机保存，不进入工作记录或同步。</p></details>
 <p className="muted">同步接口：<code>GET /sync/status</code> 查询状态，<code>POST /sync/run</code> 启动同步，<code>POST /sync/resolve</code> 明确选择冲突版本。仓库与凭据先在下方 GitCode 同步中配置；运行中的计时器需先暂停。</p>
 {status?.error&&<p role="alert">{status.error}</p>}{error&&<p role="alert">{error}</p>}{message&&<p role="status">{message}</p>}
 </>}
 </section>;
}
