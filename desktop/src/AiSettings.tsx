import React,{useEffect,useRef,useState} from 'react';
import type {AiSettingsStatus,AiModelListResult} from '../core/ai-types';
import {aiErrorText} from './ai-api';
import {Button,Field} from './ui';
import './ai.css';

export function AiSettings(){
 const bridge=window.journalAI;
 const [status,setStatus]=useState<AiSettingsStatus|null>(null),[baseUrl,setBaseUrl]=useState(''),[model,setModel]=useState(''),[apiKey,setApiKey]=useState('');
 const [busy,setBusy]=useState<'save'|'test'|'remove'|null>(null),[error,setError]=useState(''),[message,setMessage]=useState(''),[loading,setLoading]=useState(!!bridge);
 const pending=useRef(false),alive=useRef(true),modelsPending=useRef(false),modelsGeneration=useRef(0),modelsCancel=useRef<Promise<void>>(Promise.resolve());
 const [modelList,setModelList]=useState<AiModelListResult|null>(null),[modelSearch,setModelSearch]=useState(''),[modelsLoading,setModelsLoading]=useState(false),[modelsError,setModelsError]=useState('');
 const stopModels=(clear=true)=>{modelsGeneration.current++;if(modelsPending.current){modelsPending.current=false;try{modelsCancel.current=Promise.resolve(bridge?.cancelModels?.()).catch(()=>{});}catch{modelsCancel.current=Promise.resolve();}}if(alive.current){setModelsLoading(false);if(clear){setModelList(null);setModelSearch('');setModelsError('');}}};
 const fetchModels=async()=>{if(!bridge?.listModels||modelsPending.current||pending.current||!baseUrl.trim())return;const token=++modelsGeneration.current,input={baseUrl:baseUrl.trim(),...(apiKey.trim()?{apiKey:apiKey.trim()}:{})};modelsPending.current=true;setModelsLoading(true);setModelsError('');try{await modelsCancel.current;if(!alive.current||token!==modelsGeneration.current)return;const result=await bridge.listModels(input);if(alive.current&&token===modelsGeneration.current)setModelList(result);}catch(e){if(alive.current&&token===modelsGeneration.current)setModelsError(aiErrorText(e,input.apiKey??''));}finally{if(alive.current&&token===modelsGeneration.current){modelsPending.current=false;setModelsLoading(false);}}};
 const filteredModels=modelList?.models.filter(name=>name.toLocaleLowerCase().includes(modelSearch.toLocaleLowerCase()))??[];
 const customModel=!!model.trim()&&!modelList?.models.includes(model.trim());
 const accept=(next:AiSettingsStatus)=>{setStatus(next);setBaseUrl(next.baseUrl);setModel(next.model);};
 const refresh=()=>{if(!bridge)return;setLoading(true);setError('');void bridge.status().then(accept).catch(e=>setError(aiErrorText(e))).finally(()=>setLoading(false));};
 useEffect(()=>{alive.current=true;if(!bridge)return;let valid=true;void bridge.status().then(next=>{if(valid)accept(next);}).catch(e=>{if(valid)setError(aiErrorText(e));}).finally(()=>{if(valid)setLoading(false);});return()=>{valid=false;alive.current=false;stopModels(false);};},[bridge]);
 const perform=async(kind:'save'|'test'|'remove',action:()=>Promise<void>)=>{if(pending.current)return;pending.current=true;setBusy(kind);setError('');setMessage('');try{await action();}catch(e){setError(aiErrorText(e,apiKey.trim()));}finally{pending.current=false;setBusy(null);}};
 const dirty=!!status&&(baseUrl.trim()!==status.baseUrl||model.trim()!==status.model||!!apiKey.trim());
 return <section className="settings-section ai-settings" id="settings-ai"><h2>AI 助手</h2><p>连接兼容 OpenAI 的服务，包括 DeepSeek，帮助整理事项、拆解工作与复盘投入。建议由你逐条确认后应用。</p>
 {!bridge?<p className="ai-unavailable">AI 助手仅在正式桌面版中可用。</p>:<>
 {loading&&<p role="status">正在读取连接设置…</p>}
 {!loading&&!status&&<Button onClick={refresh}>重新读取连接设置</Button>}
 <form className="ai-connection-form" aria-label="AI 连接设置" aria-busy={!!busy||modelsLoading} onSubmit={e=>{e.preventDefault();if(!status||!baseUrl.trim()||!model.trim()||modelsPending.current)return;void perform('save',async()=>{accept(await bridge.configure({baseUrl:baseUrl.trim(),model:model.trim(),...(apiKey.trim()?{apiKey:apiKey.trim()}:{} )}));setApiKey('');setMessage('AI 连接设置已保存。');});}}>
 <fieldset className="dialog-fields" disabled={!!busy||loading||!status}>
 <Field label="服务地址" hint="填写服务商的 OpenAI 兼容 API 地址，例如 https://api.deepseek.com/v1。"><input aria-label="AI 服务地址" type="url" required autoComplete="off" spellCheck={false} value={baseUrl} onChange={e=>{stopModels();setBaseUrl(e.target.value);}} placeholder="https://api.example.com/v1"/></Field>
 <Field label={status?.hasKey?'替换 API 密钥（留空保留现有密钥）':'API 密钥'} hint={status?.hasKey?'留空仅沿用同一服务的已保存密钥；更换服务请填写新密钥。':undefined}><input aria-label="AI API 密钥" type="password" autoComplete="new-password" spellCheck={false} value={apiKey} onChange={e=>{stopModels();setApiKey(e.target.value);}} placeholder={status?.hasKey?'已保存密钥，内容不回显':'粘贴服务商提供的密钥'}/></Field>
 <p className="ai-key-state">{status?.hasKey?'已保存密钥':'尚未保存密钥'} · 密钥仅保存在这台设备，不进入事项备份或同步。</p>
 <div className="ai-model-discovery" aria-label="服务模型列表">
 {typeof bridge.listModels==='function'?<><div className="actions"><Button type="button" disabled={!baseUrl.trim()||modelsLoading} onClick={()=>void fetchModels()}>{modelsLoading?'正在获取模型…':modelList?'刷新模型列表':'获取模型列表'}</Button>{modelsLoading&&<Button type="button" subtle onClick={()=>stopModels(false)}>取消获取</Button>}</div>
 {modelsLoading&&<small role="status">正在向所填服务获取模型；不会保存设置或更改当前模型。</small>}
 {modelsError&&<p role="alert" className="ai-error">{modelsError} 可继续手动填写模型标识，或重试获取。</p>}
 {modelList&&<><Field label="搜索服务模型"><input aria-label="搜索 AI 模型" value={modelSearch} onChange={e=>setModelSearch(e.target.value)} autoComplete="off" placeholder="按模型标识搜索"/></Field><Field label="选择服务模型"><select aria-label="选择 AI 模型" value={model.trim()} onChange={e=>setModel(e.target.value)}><option value="">选择模型（不自动保存）</option>{customModel&&<option value={model.trim()}>当前 / 自定义：{model.trim()}</option>}{!customModel&&model.trim()&&!filteredModels.includes(model.trim())&&<option value={model.trim()}>当前：{model.trim()}</option>}{filteredModels.map(name=><option key={name} value={name}>{name}</option>)}</select></Field><small role="status">显示 {filteredModels.length} / {modelList.models.length} 个返回模型{modelList.partial?'；服务还有更多结果或本次列表已截断':''}。</small>{!modelList.models.length&&<p className="ai-settings-hint">服务未返回模型标识。可手动填写服务商提供的模型，或稍后重试。</p>}{modelList.models.length>0&&!filteredModels.length&&<p className="ai-settings-hint">没有符合搜索的模型；当前输入保留。</p>}</>}
 <small>列表仅表示服务公布的模型，不代表已验证对话或工具调用能力。选定后请保存并测试连接。</small></>:<small>此版本连接暂不支持获取模型列表，可手动填写服务商提供的模型标识。</small>}
 </div>
 <Field label="模型" hint="也可手动填写；获取或刷新列表不会自动替换此输入。"><input aria-label="AI 模型" required autoComplete="off" spellCheck={false} value={model} onChange={e=>setModel(e.target.value)} placeholder="模型标识"/></Field>
 <div className="actions"><Button primary type="submit" disabled={!baseUrl.trim()||!model.trim()||modelsLoading}>{busy==='save'?'正在保存…':'保存 AI 设置'}</Button><Button type="button" disabled={!status?.configured||dirty||modelsLoading} onClick={()=>void perform('test',async()=>{const result=await bridge.test();setMessage(`${result.message} · ${Math.round(result.latencyMs)} 毫秒`);})}>{busy==='test'?'正在测试…':'测试已保存连接'}</Button>{status?.hasKey&&<Button type="button" subtle disabled={modelsLoading} onClick={()=>void perform('remove',async()=>{stopModels();accept(await bridge.clearKey());setApiKey('');setMessage('已移除密钥，AI 助手已断开。');})}>{busy==='remove'?'正在移除…':'移除密钥'}</Button>}</div>
 </fieldset></form>
 <p className="ai-settings-hint">{dirty?'当前有未保存的更改，请先保存，再测试连接。':'测试连接使用简短对话与工具参数，不发送事项或投入记录。'}</p>
 {status?.error&&!error&&<p role="alert" className="ai-error">{status.error}</p>}{error&&<p role="alert" className="ai-error">{error}</p>}{message&&<p role="status" className="ai-success">{message}</p>}
 </>}
 </section>;
}
