import {primaryModifier,shortcutLabel} from './platform';
import React,{useEffect,useRef,useState} from 'react';
import type {AiAssistantState,AiContextPreview,AiScope} from '../core/ai-assistant-types';
import type {AiSettingsStatus} from '../core/ai-types';
import {aiErrorText} from './ai-api';
import {AiConversation} from './AiConversation';
import {Button,Field,Modal,useWorkspaceJournal} from './ui';
import './ai.css';

const idle:AiAssistantState={id:'',phase:'idle',text:'',error:null,context:null,suggestions:[],conversationId:'',scope:null,turns:[]};
const prompts=[
 ['整理事项','梳理这些事项的层级、重复和含糊之处，提出少量具体的整理建议，保留已有内容。'],
 ['拆解下一步','把范围内适合开始的事项拆成清晰的小步骤，优先给出现在能做的第一步，避免过度拆分。'],
 ['安排审视','检查范围内逾期或需要重新判断的原有事项，通过真实的事项审视安排（item-review.configure / item-review.defer）提出合适的审视日期与频率。保留原事项、截止日期与已有投入，不要创建“审视”收件箱任务。信息不足时先询问我。'],
 ['复盘投入','根据已记录的投入与进展，总结实际推进了什么、估计与实践的差异，并建议下一步调整。'],
] as const;
type QuestionDraft={prompt:string;scope:AiScope};
const draftStorageKey='journal.ai-question-drafts.v1',questionDrafts=new WeakMap<object,Map<string,QuestionDraft>>();
const validScope=(value:unknown):value is AiScope=>!!value&&typeof value==='object'&&['today','recent','all','item'].includes((value as AiScope).kind)&&((value as AiScope).kind!=='item'||typeof (value as AiScope).itemId==='string');
function draftStore(bridge:object|undefined){if(!bridge)return null;let store=questionDrafts.get(bridge);if(!store){store=new Map();try{const saved=JSON.parse(window.localStorage.getItem(draftStorageKey)??'[]');if(Array.isArray(saved))for(const entry of saved.slice(-24))if(Array.isArray(entry)&&typeof entry[0]==='string'&&typeof entry[1]?.prompt==='string'&&entry[1].prompt.length<=4000&&validScope(entry[1].scope))store.set(entry[0],entry[1]);}catch{}questionDrafts.set(bridge,store);}return store;}
const sameScope=(first:AiScope|null,second:AiScope)=>!!first&&first.kind===second.kind&&(first.kind!=='item'||first.itemId===second.itemId);

export function AiAssistant({itemId,onClose,onSettings}:{itemId?:string;onClose:()=>void;onSettings:()=>void}){
 const bridge=window.journalAI,journal=useWorkspaceJournal(),draftKey=JSON.stringify([journal?.data.dataPath??'',itemId??'']),drafts=draftStore(bridge);
 const [initialDraft]=useState(()=>drafts?.get(draftKey));
 const [scrollRequest,setScrollRequest]=useState(0);
 const [status,setStatus]=useState<AiSettingsStatus|null>(null),[state,setState]=useState<AiAssistantState>(idle),[scope,setScope]=useState<AiScope>(initialDraft?.scope??{kind:itemId?'item':'today',...(itemId?{itemId}:{})});
 const [context,setContext]=useState<AiContextPreview|null>(null),[contextLoading,setContextLoading]=useState(!!bridge),[contextError,setContextError]=useState(''),[contextAttempt,setContextAttempt]=useState(0);
 const [prompt,setPrompt]=useState(initialDraft?.prompt??''),[error,setError]=useState(''),[notice,setNotice]=useState(''),[draftError,setDraftError]=useState(''),[loading,setLoading]=useState(!!bridge),[cancelling,setCancelling]=useState(false),[resetting,setResetting]=useState(false),[applying,setApplying]=useState<string|null>(null),[applyError,setApplyError]=useState<{runId:string;id:string;text:string}|null>(null);
 useEffect(()=>{if(!drafts)return;drafts.delete(draftKey);drafts.set(draftKey,{prompt,scope});if(drafts.size>24)drafts.delete(drafts.keys().next().value!);try{window.localStorage.setItem(draftStorageKey,JSON.stringify([...drafts]));setDraftError('');}catch{setDraftError('问题草稿暂时只能在本次打开期间保留，无法保存到本机。');}},[drafts,draftKey,prompt,scope]);
 const stateRef=useRef(state),scopeRef=useRef(scope),submitted=useRef(''),generatePending=useRef(false),cancelPending=useRef(false),resetPending=useRef(false),applyPending=useRef(false),alive=useRef(true),updates=useRef(0),request=useRef(0);
 stateRef.current=state;scopeRef.current=scope;
 const accept=(next:AiAssistantState)=>{if(!alive.current)return;const previous=stateRef.current,last=previous.turns.at(-1),turns=Array.isArray(next.turns)?next.turns:next.phase!=='idle'||next.text||next.suggestions.length?[{id:next.id||last?.id||'legacy',scope:next.scope??scopeRef.current,prompt:submitted.current||last?.prompt||'',phase:next.phase,text:next.text,error:next.error,context:next.context,suggestions:next.suggestions}]:[];const normalized={...idle,...next,scope:next.scope??(turns.length?scopeRef.current:null),turns};stateRef.current=normalized;setState(normalized);};
 useEffect(()=>{alive.current=true;if(!bridge)return()=>{alive.current=false;};let valid=true;const before=updates.current;
  const off=bridge.onChanged(next=>{updates.current++;accept(next);});
  void Promise.all([bridge.status(),bridge.get()]).then(([connection,result])=>{if(!valid)return;setStatus(connection);if(updates.current===before){accept(result);if(!initialDraft&&!itemId&&validScope(result.scope))setScope(result.scope);}}).catch(e=>{if(valid)setError(aiErrorText(e));}).finally(()=>{if(valid)setLoading(false);});
  return()=>{valid=false;alive.current=false;request.current++;off();};
 },[bridge]);
 useEffect(()=>{if(!bridge)return;let valid=true;setContextLoading(true);setContextError('');setContext(null);void bridge.context(scope).then(preview=>{if(valid)setContext(preview);}).catch(e=>{if(valid)setContextError(aiErrorText(e));}).finally(()=>{if(valid)setContextLoading(false);});return()=>{valid=false;};},[bridge,scope,contextAttempt]);
 const running=state.phase==='running',scopeChanged=!!state.scope&&state.turns.length>0&&!sameScope(state.scope,scope),blocked=!!applying||resetting;
 const addPrompt=(text:string)=>{const next=prompt.trim()?`${prompt}\n\n${text}`:text;if(next.length>4000){setError('问题最多 4000 字，请先精简后再添加建议；已有内容已保留。');return;}setError('');setPrompt(next);};
 const generate=async()=>{if(!bridge||!status?.configured||!context||!prompt.trim()||generatePending.current||running||applyPending.current||resetPending.current)return;const token=++request.current,before=updates.current,text=prompt.trim(),old=stateRef.current;submitted.current=text;setScrollRequest(value=>value+1);generatePending.current=true;setError('');setApplyError(null);setNotice(scopeChanged?'已按新范围开始对话，上一范围的对话不会发送。':'');const previous=scopeChanged?[]:old.turns.map(turn=>({...turn,suggestions:turn.suggestions.map(suggestion=>suggestion.state==='pending'?{...suggestion,state:'historical' as const}:suggestion)}));accept({...old,id:`pending-${token}`,phase:'running',text:'',error:null,context,suggestions:[],scope,turns:[...previous,{id:`pending-${token}`,scope,prompt:text,phase:'running',text:'',error:null,context,suggestions:[]}]});
  try{const result=await bridge.generate({scope,prompt:text});if(alive.current&&token===request.current){if(updates.current===before)accept(result);if(result.phase==='done')setPrompt(current=>current.trim()===text?'':current);}}
  catch(e){if(alive.current&&token===request.current){const message=aiErrorText(e);setError(message);accept({...stateRef.current,phase:'error',error:null,turns:stateRef.current.turns.map((turn,index,list)=>index===list.length-1?{...turn,phase:'error',error:null}:turn)});}}
  finally{if(token===request.current)generatePending.current=false;}
 };
 const cancel=async()=>{if(!bridge||cancelPending.current)return false;const token=++request.current,before=updates.current;cancelPending.current=true;setCancelling(true);setError('');try{const result=await bridge.cancel();if(token===request.current&&updates.current===before)accept(result);return true;}catch(e){if(alive.current)setError(aiErrorText(e));return false;}finally{cancelPending.current=false;if(token===request.current)generatePending.current=false;if(alive.current)setCancelling(false);}};
 const close=()=>{if(applyPending.current||resetPending.current)return;if(bridge&&stateRef.current.phase==='running'){void cancel().then(stopped=>{if(stopped&&alive.current)onClose();});return;}onClose();};
 const reset=async()=>{if(!bridge?.reset||running||generatePending.current||applyPending.current||resetPending.current)return;const token=++request.current,before=updates.current,authored=prompt;resetPending.current=true;setResetting(true);setError('');try{const result=await bridge.reset();if(alive.current&&token===request.current){if(updates.current===before)accept(result);setPrompt(current=>current===authored?'':current);setApplyError(null);submitted.current='';setNotice('已开始新对话。此前内容不会作为本次对话上下文。');}}catch(e){if(alive.current)setError(aiErrorText(e));}finally{resetPending.current=false;if(alive.current)setResetting(false);}};
 const apply=async(suggestionId:string)=>{const current=stateRef.current;if(!bridge||applyPending.current||running||resetPending.current||!sameScope(current.scope,scope)||current.phase!=='done'||!current.suggestions.some(s=>s.id===suggestionId&&s.state==='pending'))return;const token=++request.current,before=updates.current;applyPending.current=true;setApplying(suggestionId);setApplyError(null);try{const result=await bridge.apply({runId:current.id,suggestionId});if(token===request.current&&updates.current===before)accept(result);}catch(e){if(alive.current)setApplyError({runId:current.id,id:suggestionId,text:aiErrorText(e)});}finally{applyPending.current=false;if(alive.current)setApplying(null);}};
 const followup=state.turns.length>0&&!scopeChanged,retry=state.phase==='error'||state.phase==='cancelled';
 return <Modal title="AI 助手" wide onClose={close} busy={blocked}><div className="ai-assistant">
 <p className="ai-intro">同一范围可以继续追问，建议由你逐条确认后应用。已保存的对话仅保留在本机。</p>
 {!bridge?<p className="ai-unavailable">AI 助手仅在正式桌面版中可用。</p>:<>
 {loading&&<p role="status">正在读取 AI 助手…</p>}
 {!loading&&!status?.configured&&<div className="ai-setup"><strong>先连接你的 AI 服务</strong><p>支持兼容 OpenAI 的服务，包括 DeepSeek。</p><Button primary disabled={running||blocked} onClick={()=>{close();onSettings();}}>打开 AI 设置</Button></div>}
 <div className="ai-conversation-actions"><strong>{state.turns.length?`当前对话 · ${state.turns.length} 轮`:'新对话'}</strong><div className="actions">{journal?.navigate&&<Button subtle disabled={running||blocked} onClick={()=>{try{window.sessionStorage.setItem('review-tab','items');}catch{}onClose();journal.navigate('review');}}>打开事项审视</Button>}<Button subtle disabled={loading||running||blocked||!bridge.reset} onClick={()=>void reset()}>{resetting?'正在开始…':'新对话'}</Button></div></div>
 {notice&&<p role="status" className="ai-conversation-notice">{notice}</p>}{draftError&&<p role="alert" className="ai-error">{draftError}</p>}{state.historyError&&<p role="alert" className="ai-error">{state.historyError}</p>}
 <AiConversation turns={state.turns} runId={state.id} canApply={state.phase==='done'&&!scopeChanged} running={running} applying={applying} applyError={applyError} onApply={id=>void apply(id)} scrollRequest={scrollRequest}/>
 <div className="ai-compose">
 <div className="ai-compose-context">
 <Field label="使用哪些记录"><select aria-label="AI 分析范围" disabled={running||blocked} value={scope.kind} onChange={e=>{setNotice('');setScope({kind:e.target.value as AiScope['kind'],...(e.target.value==='item'?{itemId:itemId??scope.itemId}:{})});}}>{(itemId||scope.kind==='item')&&<option value="item">{itemId?'当前事项及子项':'对话中的事项及子项'}</option>}<option value="today">今日</option><option value="recent">最近 7 天</option><option value="all">全部事项</option></select></Field>
 {scopeChanged&&<p className="ai-scope-change" role="status">分析范围已改变。下一次发送会开始新对话，不发送上一范围的对话；此前建议不能在当前范围应用。</p>}
 {contextLoading?<p role="status" className="ai-context-loading">正在准备记录清单…</p>:context?<details className="ai-context"><summary>{context.label} · {context.itemCount} 个事项 · {context.recordCount} 条投入记录<span>查看将发送的事项</span></summary><p>发送时，将把你的问题、此范围内的事项内容和相关投入记录发送给已配置的 AI 服务。同一范围会带上当前对话，继续追问。</p>{context.items.length?<ul>{context.items.map(item=><li key={item.id}><strong>{item.title}</strong><small>{item.path}</small></li>)}</ul>:<p>当前范围没有事项。可以更换范围后再生成。</p>}{context.truncated&&<p className="ai-limit" role="status">记录较多，本次仅发送上方列出的限量事项与相关记录。可缩小范围以查看更完整的细节。</p>}</details>:null}
 {contextError&&<p className="ai-error" role="alert">{contextError} <Button subtle disabled={running} onClick={()=>setContextAttempt(value=>value+1)}>重新读取范围</Button></p>}
 <div className="ai-prompts" aria-label="AI 快捷建议">{prompts.map(([label,text])=><Button key={label} type="button" subtle title="添加到问题末尾，保留已写内容" disabled={running||blocked} onClick={()=>addPrompt(text)}>{label}</Button>)}</div>
 </div>
 <Field label={followup?'继续追问':'希望 AI 帮你做什么'}><textarea aria-label="给 AI 的问题" rows={2} maxLength={4000} placeholder={followup?'继续补充要求或追问；会结合上面的对话与最新记录。':'例如：检查逾期事项，并安排一次真实的事项审视。'} value={prompt} readOnly={running||blocked} onChange={e=>setPrompt(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&primaryModifier(e)&&!e.nativeEvent.isComposing&&e.keyCode!==229){e.preventDefault();void generate();}}}/></Field>
 <div className="ai-compose-actions"><small>{shortcutLabel('Ctrl+Enter 发送')} · 关闭窗口会停止生成并保留已收到的内容</small>{running?<Button disabled={cancelling} onClick={()=>void cancel()}>{cancelling?'正在停止…':'停止生成'}</Button>:<Button primary disabled={loading||!status?.configured||contextLoading||!context||!prompt.trim()||blocked} onClick={()=>void generate()}>{retry?'重试生成':followup?'继续对话':'生成建议'}</Button>}</div>
 </div>{error&&<p role="alert" className="ai-error">{error}</p>}
 </>}
 </div></Modal>;
}
