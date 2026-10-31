import React,{useEffect,useRef,useState} from 'react';
import type {AiSettingsStatus} from '../core/ai-types';
import {aiErrorText} from './ai-api';
import {Button,Field} from './ui';
import './ai.css';

export function AiSettings(){
 const bridge=window.journalAI;
 const [status,setStatus]=useState<AiSettingsStatus|null>(null),[baseUrl,setBaseUrl]=useState(''),[model,setModel]=useState(''),[apiKey,setApiKey]=useState('');
 const [busy,setBusy]=useState<'save'|'test'|'remove'|null>(null),[error,setError]=useState(''),[message,setMessage]=useState(''),[loading,setLoading]=useState(!!bridge);
 const pending=useRef(false);
 const accept=(next:AiSettingsStatus)=>{setStatus(next);setBaseUrl(next.baseUrl);setModel(next.model);};
 const refresh=()=>{if(!bridge)return;setLoading(true);setError('');void bridge.status().then(accept).catch(e=>setError(aiErrorText(e))).finally(()=>setLoading(false));};
 useEffect(()=>{if(!bridge)return;let alive=true;void bridge.status().then(next=>{if(alive)accept(next);}).catch(e=>{if(alive)setError(aiErrorText(e));}).finally(()=>{if(alive)setLoading(false);});return()=>{alive=false;};},[bridge]);
 const perform=async(kind:'save'|'test'|'remove',action:()=>Promise<void>)=>{if(pending.current)return;pending.current=true;setBusy(kind);setError('');setMessage('');try{await action();}catch(e){setError(aiErrorText(e,apiKey.trim()));}finally{pending.current=false;setBusy(null);}};
 const dirty=!!status&&(baseUrl.trim()!==status.baseUrl||model.trim()!==status.model||!!apiKey.trim());
 return <section className="settings-section ai-settings" id="settings-ai"><h2>AI 助手</h2><p>连接兼容 OpenAI 的服务，包括 DeepSeek，帮助整理事项、拆解工作与复盘投入。建议由你逐条确认后应用。</p>
 {!bridge?<p className="ai-unavailable">AI 助手仅在正式桌面版中可用。</p>:<>
 {loading&&<p role="status">正在读取连接设置…</p>}
 {!loading&&!status&&<Button onClick={refresh}>重新读取连接设置</Button>}
 <form className="ai-connection-form" aria-label="AI 连接设置" aria-busy={!!busy} onSubmit={e=>{e.preventDefault();if(!status||!baseUrl.trim()||!model.trim())return;void perform('save',async()=>{accept(await bridge.configure({baseUrl:baseUrl.trim(),model:model.trim(),...(apiKey.trim()?{apiKey:apiKey.trim()}:{} )}));setApiKey('');setMessage('AI 连接设置已保存。');});}}>
 <fieldset className="dialog-fields" disabled={!!busy||loading||!status}>
 <Field label="服务地址" hint="填写服务商的 OpenAI 兼容 API 地址，例如 https://api.deepseek.com/v1。"><input aria-label="AI 服务地址" type="url" required autoComplete="off" spellCheck={false} value={baseUrl} onChange={e=>setBaseUrl(e.target.value)} placeholder="https://api.example.com/v1"/></Field>
 <Field label="模型" hint="填写服务商提供的模型标识。"><input aria-label="AI 模型" required autoComplete="off" spellCheck={false} value={model} onChange={e=>setModel(e.target.value)} placeholder="模型标识"/></Field>
 <Field label={status?.hasKey?'替换 API 密钥（留空保留现有密钥）':'API 密钥'}><input aria-label="AI API 密钥" type="password" autoComplete="new-password" spellCheck={false} value={apiKey} onChange={e=>setApiKey(e.target.value)} placeholder={status?.hasKey?'已保存密钥，内容不回显':'粘贴服务商提供的密钥'}/></Field>
 <p className="ai-key-state">{status?.hasKey?'已保存密钥':'尚未保存密钥'} · 密钥仅保存在这台设备，不进入事项备份或同步。</p>
 <div className="actions"><Button primary type="submit" disabled={!baseUrl.trim()||!model.trim()}>{busy==='save'?'正在保存…':'保存 AI 设置'}</Button><Button type="button" disabled={!status?.configured||dirty} onClick={()=>void perform('test',async()=>{const result=await bridge.test();setMessage(`${result.message} · ${Math.round(result.latencyMs)} 毫秒`);})}>{busy==='test'?'正在测试…':'测试已保存连接'}</Button>{status?.hasKey&&<Button type="button" subtle onClick={()=>void perform('remove',async()=>{accept(await bridge.clearKey());setApiKey('');setMessage('已移除密钥，AI 助手已断开。');})}>{busy==='remove'?'正在移除…':'移除密钥'}</Button>}</div>
 </fieldset></form>
 <p className="ai-settings-hint">{dirty?'当前有未保存的更改，请先保存，再测试连接。':'测试连接仅发送一条连接测试消息，不发送事项或投入记录。'}</p>
 {status?.error&&!error&&<p role="alert" className="ai-error">{status.error}</p>}{error&&<p role="alert" className="ai-error">{error}</p>}{message&&<p role="status" className="ai-success">{message}</p>}
 </>}
 </section>;
}
