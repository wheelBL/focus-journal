import React,{useEffect,useRef,useState} from 'react';
import type {AiAssistantState,AiContextPreview,AiScope} from '../core/ai-assistant-types';
import type {AiSettingsStatus} from '../core/ai-types';
import {aiErrorText} from './ai-api';
import {Button,Field,Modal,useWorkspaceJournal} from './ui';
import './ai.css';

const idle:AiAssistantState={id:'',phase:'idle',text:'',error:null,context:null,suggestions:[]};
const prompts=[
 ['整理事项','梳理这些事项的层级、重复和含糊之处，提出少量具体的整理建议，保留已有内容。'],
 ['拆解下一步','把范围内适合开始的事项拆成清晰的小步骤，优先给出现在能做的第一步，避免过度拆分。'],
 ['复盘投入','根据已记录的投入与进展，总结实际推进了什么、估计与实践的差异，并建议下一步调整。'],
] as const;

type QuestionDraft={prompt:string;scope:AiScope};
// Session-only drafts: no questions, record contents or credentials are written to localStorage.
const questionDrafts=new WeakMap<object,Map<string,QuestionDraft>>();
function draftStore(bridge:object|undefined){if(!bridge)return null;let store=questionDrafts.get(bridge);if(!store){store=new Map();questionDrafts.set(bridge,store);}return store;}

export function AiAssistant({itemId,onClose,onSettings}:{itemId?:string;onClose:()=>void;onSettings:()=>void}){
 const bridge=window.journalAI,journal=useWorkspaceJournal(),draftKey=JSON.stringify([journal?.data.dataPath??'',itemId??'']),drafts=draftStore(bridge);
 const [initialDraft]=useState(()=>drafts?.get(draftKey));
 const [status,setStatus]=useState<AiSettingsStatus|null>(null),[state,setState]=useState<AiAssistantState>(idle),[scope,setScope]=useState<AiScope>(initialDraft?.scope??{kind:itemId?'item':'today',...(itemId?{itemId}:{})});
 const [context,setContext]=useState<AiContextPreview|null>(null),[contextLoading,setContextLoading]=useState(!!bridge),[contextError,setContextError]=useState(''),[contextAttempt,setContextAttempt]=useState(0);
 const [prompt,setPrompt]=useState(initialDraft?.prompt??''),[error,setError]=useState(''),[loading,setLoading]=useState(!!bridge),[cancelling,setCancelling]=useState(false),[applying,setApplying]=useState<string|null>(null),[applyError,setApplyError]=useState<{id:string;text:string}|null>(null);
 useEffect(()=>{if(!drafts)return;drafts.delete(draftKey);drafts.set(draftKey,{prompt,scope});if(drafts.size>24)drafts.delete(drafts.keys().next().value!);},[drafts,draftKey,prompt,scope]);
 const stateRef=useRef(state),generatePending=useRef(false),cancelPending=useRef(false),applyPending=useRef(false),alive=useRef(true),updates=useRef(0);
 stateRef.current=state;
 const accept=(next:AiAssistantState)=>{if(alive.current){stateRef.current=next;setState(next);}};
 useEffect(()=>{alive.current=true;if(!bridge)return()=>{alive.current=false;};let valid=true;const before=updates.current;
  const off=bridge.onChanged(next=>{updates.current++;accept(next);});
  void Promise.all([bridge.status(),bridge.get()]).then(([connection,result])=>{if(!valid)return;setStatus(connection);if(updates.current===before)accept(result);}).catch(e=>{if(valid)setError(aiErrorText(e));}).finally(()=>{if(valid)setLoading(false);});
  return()=>{valid=false;alive.current=false;off();};
 },[bridge]);
 useEffect(()=>{if(!bridge)return;let valid=true;setContextLoading(true);setContextError('');setContext(null);void bridge.context(scope).then(preview=>{if(valid)setContext(preview);}).catch(e=>{if(valid)setContextError(aiErrorText(e));}).finally(()=>{if(valid)setContextLoading(false);});return()=>{valid=false;};},[bridge,scope,contextAttempt]);
 const running=state.phase==='running';
 const addPrompt=(text:string)=>{const next=prompt.trim()?`${prompt}\n\n${text}`:text;if(next.length>4000){setError('问题最多 4000 字，请先精简后再添加建议；已有内容已保留。');return;}setError('');setPrompt(next);};
 const generate=async()=>{if(!bridge||!status?.configured||!context||!prompt.trim()||generatePending.current||running||applyPending.current)return;generatePending.current=true;setError('');setApplyError(null);accept({...idle,phase:'running',context});try{accept(await bridge.generate({scope,prompt:prompt.trim()}));}catch(e){if(alive.current){setError(aiErrorText(e));accept({...stateRef.current,phase:'error'});}}finally{generatePending.current=false;}};
 const cancel=async()=>{if(!bridge||cancelPending.current)return;cancelPending.current=true;setCancelling(true);setError('');try{accept(await bridge.cancel());}catch(e){if(alive.current)setError(aiErrorText(e));}finally{cancelPending.current=false;if(alive.current)setCancelling(false);}};
 const close=()=>{if(applyPending.current)return;if(bridge&&stateRef.current.phase==='running')void bridge.cancel().catch(()=>{});onClose();};
 const apply=async(suggestionId:string)=>{if(!bridge||applyPending.current||running)return;applyPending.current=true;setApplying(suggestionId);setApplyError(null);try{accept(await bridge.apply({runId:stateRef.current.id,suggestionId}));}catch(e){if(alive.current)setApplyError({id:suggestionId,text:aiErrorText(e)});}finally{applyPending.current=false;if(alive.current)setApplying(null);}};
 return <Modal title="AI 助手" wide onClose={close} busy={!!applying}><div className="ai-assistant">
 <p className="ai-intro">整理、拆解与复盘。生成的建议会先列在这里，由你逐条确认应用。</p>
 {!bridge?<p className="ai-unavailable">AI 助手仅在正式桌面版中可用。</p>:<>
 {loading&&<p role="status">正在读取 AI 助手…</p>}
 {!loading&&!status?.configured&&<div className="ai-setup"><strong>先连接你的 AI 服务</strong><p>支持兼容 OpenAI 的服务，包括 DeepSeek。</p><Button primary onClick={()=>{close();onSettings();}}>打开 AI 设置</Button></div>}
 <div className="ai-compose">
 <Field label="使用哪些记录"><select aria-label="AI 分析范围" disabled={running||!!applying} value={scope.kind} onChange={e=>setScope({kind:e.target.value as AiScope['kind'],...(e.target.value==='item'&&itemId?{itemId}:{})})}>{itemId&&<option value="item">当前事项及子项</option>}<option value="today">今日</option><option value="recent">最近 7 天</option><option value="all">全部事项</option></select></Field>
 {contextLoading?<p role="status" className="ai-context-loading">正在准备记录清单…</p>:context?<details className="ai-context"><summary>{context.label} · {context.itemCount} 个事项 · {context.recordCount} 条投入记录<span>查看将发送的事项</span></summary><p>点击“生成建议”时，将把你的问题及此范围内的事项内容、相关投入记录发送给已配置的 AI 服务。</p>{context.items.length?<ul>{context.items.map(item=><li key={item.id}><strong>{item.title}</strong><small>{item.path}</small></li>)}</ul>:<p>当前范围没有事项。可以更换范围后再生成。</p>}{context.truncated&&<p className="ai-limit" role="status">记录较多，本次仅发送上方列出的限量事项与相关记录。可缩小范围以查看更完整的细节。</p>}</details>:null}
 {contextError&&<p className="ai-error" role="alert">{contextError} <Button subtle disabled={running} onClick={()=>setContextAttempt(value=>value+1)}>重新读取范围</Button></p>}
 <div className="ai-prompts" aria-label="AI 快捷建议">{prompts.map(([label,text])=><Button key={label} type="button" subtle title="添加到问题末尾，保留已写内容" disabled={running||!!applying} onClick={()=>addPrompt(text)}>{label}</Button>)}</div>
 <Field label="希望 AI 帮你做什么"><textarea aria-label="给 AI 的问题" rows={3} maxLength={4000} placeholder="例如：帮我找出本周最值得推进的三件事，并说明原因。" value={prompt} readOnly={running||!!applying} onChange={e=>setPrompt(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&e.ctrlKey&&!e.nativeEvent.isComposing){e.preventDefault();void generate();}}}/></Field>
 <div className="ai-compose-actions"><small>Ctrl+Enter 生成 · 逐条确认后才修改事项</small>{running?<Button disabled={cancelling} onClick={()=>void cancel()}>{cancelling?'正在停止…':'停止生成'}</Button>:<Button primary disabled={loading||!status?.configured||contextLoading||!context||!prompt.trim()||!!applying} onClick={()=>void generate()}>{state.phase==='error'||state.phase==='cancelled'?'重试生成':'生成建议'}</Button>}</div>
 </div>
 {(error||state.error)&&<p role="alert" className="ai-error">{error||state.error}</p>}
 {(state.phase!=='idle'||state.text||state.suggestions.length>0)&&<section className="ai-response" aria-label="AI 建议结果"><header><h3>{running?'正在生成建议':state.phase==='cancelled'?'已停止，保留已收到的内容':'建议与分析'}</h3><span role="status">{running?'生成中…':state.phase==='done'?'生成完成':state.phase==='cancelled'?'已停止':state.phase==='error'?'生成未完成':''}</span></header>{state.context&&<small className="ai-response-scope">本次分析：{state.context.label} · {state.context.itemCount} 个事项</small>}{state.text?<div className="ai-response-text">{state.text}</div>:running?<p className="muted">正在等待服务响应…</p>:null}
 {state.suggestions.length>0&&<div className="ai-suggestions"><h3>待确认的修改 <span>{state.suggestions.filter(s=>s.state==='pending').length}</span></h3>{state.suggestions.map(suggestion=><article className={`ai-suggestion ${suggestion.state==='applied'?'is-applied':''}`} key={suggestion.id}><header><div><h4>{suggestion.label}</h4><p>{suggestion.target}</p></div>{suggestion.state==='applied'?<span className="ai-applied" role="status">已应用</span>:<Button disabled={running||!!applying} aria-label={`确认应用 ${suggestion.label}`} onClick={()=>void apply(suggestion.id)}>{applying===suggestion.id?'正在应用…':'确认应用'}</Button>}</header>{suggestion.reason&&<p className="ai-suggestion-reason">{suggestion.reason}</p>}<div className="ai-change"><div><span>修改前</span><pre>{suggestion.before||'无'}</pre></div><div><span>修改后</span><pre>{suggestion.after||'无'}</pre></div></div>{(applyError?.id===suggestion.id||suggestion.error)&&<p role="alert" className="ai-error">{applyError?.id===suggestion.id?applyError.text:suggestion.error}</p>}</article>)}</div>}
 </section>}
 </>}
 </div></Modal>;
}
