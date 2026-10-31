import React,{useEffect,useRef,useState} from 'react';
import {localDate,shiftDate,type JournalState} from '../core/types';
import {reviewQueue} from '../core/item-reviews';
import {branchIds,outlineIndex,outlinePath} from '../core/outline';
import {Button,Field,useWorkspaceJournal} from './ui';
import {useDialogAction} from './useDialogAction';
import {readLocal,writeLocal} from './workspace-state';
import {Projects} from './Projects';
import './item-review.css';

const POSITION_KEY='focus-journal-item-review-position',POSITION_EVENT='journal:review-position';
type ReviewMode='due'|'upcoming'|'all';
type ReviewDraft={note:string;later:string;children:string[];defer:boolean;batchId:string};
type ReviewPosition={date:string;mode:ReviewMode;selected:string|null;skipped:string[];handled:string[];reviewed:number;drafts:Record<string,ReviewDraft>};
const blankDraft=(today:string):ReviewDraft=>({note:'',later:shiftDate(today,1),children:[],defer:false,batchId:''});
function restorePosition(key:string,state:JournalState,today:string):ReviewPosition{
 const known=new Set(state.tasks.map(t=>t.id)),cached=readLocal<any>(key,null),legacy=readLocal<any>(POSITION_KEY,null);
 // Migrate only a legacy position that belongs to a record in this workspace.
 const saved=cached&&typeof cached==='object'?cached:known.has(legacy?.selected)?legacy:null;
 const ids=(value:unknown)=>Array.isArray(value)?value.filter((id):id is string=>typeof id==='string'&&known.has(id)).slice(0,10000):[];
 const drafts:Record<string,ReviewDraft>={};
 if(saved?.drafts&&typeof saved.drafts==='object')for(const [id,value] of Object.entries(saved.drafts).slice(-200)){
  const d=value as Partial<ReviewDraft>;if(!known.has(id)||!d||typeof d!=='object')continue;
  drafts[id]={note:typeof d.note==='string'?d.note.slice(0,2000):'',later:typeof d.later==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(d.later)?d.later:shiftDate(today,1),children:ids(d.children),defer:d.defer===true,batchId:typeof d.batchId==='string'&&d.batchId.length<=100?d.batchId:''};
 }
 return {date:today,mode:['due','upcoming','all'].includes(saved?.mode)?saved.mode:'due',selected:known.has(saved?.selected)?saved.selected:null,skipped:saved?.date===today?ids(saved.skipped):[],handled:saved?.date===today?ids(saved.handled):[],reviewed:saved?.date===today&&Number.isSafeInteger(saved.reviewed)&&saved.reviewed>=0?saved.reviewed:0,drafts};
}

/** Review navigation and drafts are device state; only explicit decisions write review history. */
export function ItemReviewWorkspace(){
 const {data,run,dialog,notify,busy}=useWorkspaceJournal(),today=localDate(data.now),key=`${POSITION_KEY}.${encodeURIComponent(data.dataPath)}`;
 const [position,setPosition]=useState(()=>restorePosition(key,data.state,today)),currentPosition=useRef(position),active=useRef(true),action=useDialogAction();
 const {mode,selected,skipped,handled,reviewed,drafts}=position,locked=busy||action.saving;
 const commit=(change:(value:ReviewPosition)=>ReviewPosition)=>{
  const next=change(currentPosition.current);currentPosition.current=next;writeLocal(key,next);
  if(active.current)setPosition(next);
  // A write may finish after leaving this page. A newly opened review page sees its result too.
  window.dispatchEvent(new CustomEvent(POSITION_EVENT,{detail:{key,value:next}}));
 };
 useEffect(()=>{active.current=true;const changed=(event:Event)=>{const detail=(event as CustomEvent<{key:string;value:ReviewPosition}>).detail;if(detail?.key===key){currentPosition.current=detail.value;setPosition(detail.value);}};window.addEventListener(POSITION_EVENT,changed);return()=>{active.current=false;window.removeEventListener(POSITION_EVENT,changed);};},[key]);
 useEffect(()=>{if(currentPosition.current.date!==today)commit(p=>({...p,date:today,skipped:[],handled:[],reviewed:0}));},[today]);
 const queue=reviewQueue(data.state,today,mode),due=reviewQueue(data.state,today),seen=(id:string)=>skipped.includes(id)||handled.includes(id);
 const current=queue.find(t=>t.id===selected&&!seen(t.id))??queue.find(t=>!seen(t.id))??null;
 const index=outlineIndex(data.state),branch=current?branchIds(index,current.id):new Set<string>(),dueChildren=due.filter(t=>current&&t.id!==current.id&&branch.has(t.id)),last=data.state.itemReviews.filter(r=>!r.undoneAt).at(-1);
 const draft=current?drafts[current.id]??blankDraft(today):blankDraft(today),{note,defer,later}=draft,children=draft.children.filter(id=>dueChildren.some(t=>t.id===id));
 useEffect(()=>{if(currentPosition.current.selected!==(current?.id??null))commit(p=>({...p,selected:current?.id??null}));},[current?.id]);
 const updateDraft=(change:Partial<ReviewDraft>)=>{if(!current||locked)return;action.dismiss(()=>commit(p=>{const entries={...p.drafts};delete entries[current.id];entries[current.id]={...(p.drafts[current.id]??blankDraft(today)),...change};return {...p,drafts:Object.fromEntries(Object.entries(entries).slice(-200))};}));};
 const select=(id:string)=>{if(locked)return;action.dismiss(()=>commit(p=>({...p,selected:id,skipped:p.skipped.filter(x=>x!==id),handled:p.handled.filter(x=>x!==id)})));};
 const skip=()=>{if(!current||locked)return;action.dismiss(()=>commit(p=>({...p,skipped:[...new Set([...p.skipped,current.id])],selected:queue.find(t=>t.id!==current.id&&!p.skipped.includes(t.id)&&!p.handled.includes(t.id))?.id??null})));};
 const mark=async(decision:'none'|'pause'|'resume')=>{
  if(!current)return;const id=current.id;
  if(await action.perform(async()=>{
   const batchId=draft.batchId||crypto.randomUUID();commit(p=>({...p,drafts:{...p.drafts,[id]:{...draft,batchId}}}));
   const result=await run({type:'item-review.mark',payload:{id,batchId,childIds:children,note,decision}}),marked=new Set([id,...children]);
   commit(p=>{const remaining={...p.drafts};delete remaining[id];return {...p,reviewed:p.reviewed+marked.size,handled:[...new Set([...p.handled,...marked])],drafts:remaining,selected:reviewQueue(result.state,today,p.mode).find(t=>!p.skipped.includes(t.id)&&!p.handled.includes(t.id)&&!marked.has(t.id))?.id??null};});
  })&&active.current)notify('已记录审视；只有明确选择的子项一起标记。');
 };
 const postpone=async(date:string)=>{
  if(!current)return;const id=current.id;
  if(await action.perform(async()=>{
   const result=await run({type:'item-review.defer',payload:{id,nextDate:date}});
   // Deferring is not a review: keep its unsent note for the next visit.
   commit(p=>({...p,handled:[...new Set([...p.handled,id])],drafts:{...p.drafts,[id]:{...(p.drafts[id]??draft),defer:false,later:date}},selected:reviewQueue(result.state,today,p.mode).find(t=>t.id!==id&&!p.skipped.includes(t.id)&&!p.handled.includes(t.id))?.id??null}));
  })&&active.current)notify('已推迟这次审视，没有记为已审视；未提交的说明仍保留。');
 };
 const undo=async()=>{
  if(!last)return;const records=data.state.itemReviews.filter(r=>r.batchId===last.batchId&&!r.undoneAt),ids=new Set(records.map(r=>r.itemId));
  await action.perform(async()=>{await run({type:'item-review.undo',payload:{batchId:last.batchId}});commit(p=>({...p,reviewed:Math.max(0,p.reviewed-records.length),handled:p.handled.filter(id=>!ids.has(id)),skipped:p.skipped.filter(id=>!ids.has(id)),selected:records[0]?.itemId??null}));});
 };
 return <div className="item-review-workspace" aria-busy={action.saving}>
  <header className="item-review-heading"><div><h2>事项审视</h2><p>还值得做吗？有没有卡住？拆分和时间安排需要调整吗？</p></div><div><strong>本轮已审视 {reviewed}</strong><span> · 待审视 {due.length}</span>{last&&<Button subtle disabled={locked} onClick={()=>void undo()}>撤销刚才的已审视</Button>}</div></header>
  {action.error&&<p role="alert" className="form-error">{action.error}</p>}{action.saving&&<p role="status" className="muted">正在保存审视决定…</p>}
  <div className="item-review-layout"><aside className="review-queue"><label>审视队列<select aria-label="审视队列范围" disabled={locked} value={mode} onChange={e=>{const value=e.target.value as ReviewMode;action.dismiss(()=>commit(p=>({...p,mode:value,skipped:[],handled:[],selected:null})));}}><option value="due">待审视 · 今天及以前</option><option value="upcoming">即将审视</option><option value="all">全部已设置</option></select></label>
   {queue.map(t=><button className={current?.id===t.id?'selected':''} disabled={locked} key={t.id} onClick={()=>select(t.id)}><strong>{t.title}</strong><small>{outlinePath(index,t.id).slice(0,-1).map(n=>n.title).join(' / ')||'最外层'}</small><span>{t.reviewSchedule!.nextDate}{skipped.includes(t.id)?' · 本轮跳过':handled.includes(t.id)?' · 本轮已处理':''}{drafts[t.id]?.note?' · 有草稿':''}</span></button>)}
   {!queue.length&&<p>这个队列暂时没有事项。在右侧详情或事项右键菜单中设置定期审视。</p>}{skipped.length>0&&<Button subtle disabled={locked} onClick={()=>action.dismiss(()=>commit(p=>({...p,skipped:[],selected:null})))}>重新查看本轮跳过项</Button>}
  </aside><div className="review-current">{current?<><section className="review-decision"><div className="review-current-top"><strong>正在审视：{current.title}</strong><span>审视日 {current.reviewSchedule!.nextDate}</span></div>
   <div className="review-decision-actions"><Button primary disabled={locked} onClick={()=>void mark('none')}>已审视，查看下一项</Button><Button disabled={locked} onClick={()=>updateDraft({defer:!defer})}>稍后审视</Button><Button subtle disabled={locked} onClick={skip}>跳过，先看下一项</Button><details><summary>作出决定</summary><div className="actions"><Button disabled={locked} onClick={()=>void mark('pause')}>{current.availability==='paused'?'继续暂停':'暂停事项'}并标记已审视</Button><Button disabled={locked} onClick={()=>void mark('resume')}>恢复可做并标记已审视</Button><Button disabled={locked} onClick={()=>dialog({type:'schedule',id:current.id,putAside:true})}>暂时放下，下次再看…</Button><Button disabled={locked} onClick={()=>dialog({type:'state',id:current.id,action:'cancel'})}>决定不做，取消事项…</Button></div></details></div>
   {defer&&<div className="review-defer"><Button disabled={locked} onClick={()=>void postpone(shiftDate(today,1))}>明天再看</Button><Button disabled={locked} onClick={()=>void postpone(shiftDate(today,7))}>一周后再看</Button><input aria-label="稍后审视日期" disabled={locked} type="date" min={today} value={later} onChange={e=>updateDraft({later:e.target.value})}/><Button disabled={locked||!later||later<today} onClick={()=>void postpone(later)}>按此日期推迟</Button></div>}
   <details className="review-optional"><summary>一句说明 / 同时审视子项（可选）{dueChildren.length?` · ${dueChildren.length} 个子项也待审视`:''}{note?' · 有草稿':''}</summary><Field label="审视说明（可留空）"><input aria-label="审视说明" disabled={locked} maxLength={2000} value={note} onChange={e=>updateDraft({note:e.target.value})}/></Field>{note&&<small className="muted">未提交的说明会随事项保留；标记已审视后才写入历史。</small>}{dueChildren.length>0&&<fieldset disabled={locked}><legend>明确选择一起标记的待审视子项</legend>{dueChildren.map(t=><label key={t.id}><input type="checkbox" checked={children.includes(t.id)} onChange={e=>updateDraft({children:e.target.checked?[...children,t.id]:children.filter(id=>id!==t.id)})}/>{t.title}</label>)}</fieldset>}</details>
  </section><Projects key={current.id} reviewRoot={current.id}/></>:<div className="review-empty"><h3>{queue.length?'本轮其余事项已处理或跳过':'当前没有待看的事项'}</h3><p>可以中断后再回来；打开、编辑、计时都不会自动记为已审视。</p></div>}</div></div>
 </div>;
}
