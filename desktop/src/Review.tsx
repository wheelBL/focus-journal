import {ActivityRecords} from './ActivityRecords';
import {recordOperation} from './operation-entry';
import React,{useId,useState} from 'react';
import {Clock20Regular,CheckmarkCircle20Filled} from '@fluentui/react-icons';
import {EffortReview} from './EffortReview';
import {WorkspaceContext} from './WorkspaceContext';
import {ItemReviewWorkspace} from './ItemReview';
import {reviewQueue} from '../core/item-reviews';
import {localDate} from '../core/types';
import {useWorkspaceJournal} from './ui';

type ReviewTab='items'|'effort'|'activity';
function savedTab():ReviewTab{try{const t=window.sessionStorage.getItem('review-tab');return t==='activity'?'activity':t==='effort'?'effort':'items';}catch{return 'items';}}
export function Review(){
 const {data}=useWorkspaceJournal(),[tab,setTab]=useState<ReviewTab>(savedTab),id=useId(),due=reviewQueue(data.state,localDate(data.now)).length;
 const select=(value:ReviewTab)=>{recordOperation('navigation.review','review.'+value);setTab(value);try{window.sessionStorage.setItem('review-tab',value);}catch{/* This optional device preference must never prevent reviewing work. */}};
 const tabs=[['items',`事项审视${due?` · ${due}`:''}`],['effort','投入复盘'],['activity','活动记录']] as const;
 const keys=(event:React.KeyboardEvent<HTMLDivElement>)=>{
  if(event.nativeEvent.isComposing||event.ctrlKey||event.altKey||event.metaKey||!(event.target instanceof HTMLElement)||event.target.getAttribute('role')!=='tab')return;
  const at=tabs.findIndex(([value])=>value===tab),next=event.key==='Home'?'items':event.key==='End'?'activity':['ArrowLeft','ArrowRight'].includes(event.key)?tabs[(at+(event.key==='ArrowRight'?1:tabs.length-1))%tabs.length][0]:null;
  if(!next)return;event.preventDefault();event.stopPropagation();select(next);event.currentTarget.querySelector<HTMLElement>(`[data-review-tab="${next}"]`)?.focus();
 };
 return <section className="review-module"><WorkspaceContext><h2 className="context-heading">回顾</h2><nav className="context-nav" aria-label="回顾方式侧栏"><button className={tab==='items'?'selected':''} aria-current={tab==='items'?'page':undefined} aria-controls={`${id}-panel`} onClick={()=>select('items')}><CheckmarkCircle20Filled/><span>事项审视</span>{due>0&&<small>{due}</small>}</button><button className={tab==='effort'?'selected':''} aria-current={tab==='effort'?'page':undefined} aria-controls={`${id}-panel`} onClick={()=>select('effort')}><Clock20Regular/><span>投入复盘</span></button><button className={tab==='activity'?'selected':''} aria-current={tab==='activity'?'page':undefined} aria-controls={`${id}-panel`} onClick={()=>select('activity')}>活动记录</button></nav></WorkspaceContext><div className="review-module-tabs" role="tablist" aria-label="回顾方式" onKeyDown={keys}>{tabs.map(([value,label])=><button key={value} id={`${id}-${value}`} role="tab" data-review-tab={value} tabIndex={tab===value?0:-1} aria-selected={tab===value} aria-controls={`${id}-panel`} onClick={()=>select(value)}>{label}</button>)}</div><div role="tabpanel" id={`${id}-panel`} aria-labelledby={`${id}-${tab}`}>{tab==='items'?<ItemReviewWorkspace/>:tab==='effort'?<EffortReview/>:<ActivityRecords/>}</div></section>;
}
