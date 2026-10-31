import type {Task,JournalState} from './types';
import {required,text,instant} from './validation';
import {branchIds,outlineIndex,assertParentAvailable} from './outline';
import {isInformation} from './item-kind';
import {completionLabels,type CompletionBy,validateOwnership} from './activity';
export function changeOwnership(s:JournalState,p:Record<string,unknown>,now:string,reclaim=false){
 const root=s.tasks.find(t=>t.id===p.id);if(!root||!['open','handed-off'].includes(root.status)||root.deletedAt||isInformation(root))throw Error('请选择未结束的事项进行交接或接手。');
 const descendants=branchIds(outlineIndex(s),root.id),ids=p.ids===undefined?[root.id]:p.ids;
 if(!Array.isArray(ids)||!ids.length||ids.length>1000||ids.some(id=>typeof id!=='string'||!descendants.has(id)))throw Error('请选择本项或其子项。');
 if(!ids.includes(root.id))throw Error('请包含当前事项。');
 for(const id of new Set(ids)){
  const t=s.tasks.find(t=>t.id===id)!;if(isInformation(t)||!['open','handed-off'].includes(t.status)||t.deletedAt)throw Error('选中项包含已结束事项、笔记或事件，请重新选择。');
  if(reclaim){assertParentAvailable(s,t.parentId??null);t.ownership=null;t.status='open';continue;}
  const at=p.at?instant(p.at):now;if(at>now||at<t.createdAt)throw Error('交接时间应在创建之后，且不能晚于现在。');
  if(p.followUp!==undefined&&typeof p.followUp!=='boolean')throw Error('跟进安排无效。');
  const followUp=p.followUp===true,remindAt=p.followUpAt?instant(p.followUpAt):null;
  if(remindAt&&!followUp)throw Error('请先选择继续跟进，再设置跟进时间。');
  const sessions=s.sessions.filter(r=>r.taskId===id&&r.status!=='ended');if(sessions.length&&p.confirmTimers!==true)throw Error('交接会结束并保存选中事项的计时，请确认。');
  for(const r of sessions){r.status='ended';r.end=now;r.updatedAt=now;}
  t.ownership={assignee:required(p.assignee,120),followUp,at,note:text(p.note??'',2000),reminder:remindAt?{at:remindAt,state:'scheduled',snoozedUntil:null}:null};t.status='handed-off';t.completedAt=null;t.focusDate=null;delete t.completionBy;validateOwnership(t);
 }
}
export function setCompletion(t:Task,p:Record<string,unknown>,now:string){
 if(isInformation(t)||t.status!=='done')throw Error('请选择已完成的事项。');
 const by=p.by;if(typeof by!=='string'||!Object.hasOwn(completionLabels,by))throw Error('请选择完成归属。');
 t.completionBy=by as CompletionBy;
 if(p.at!==undefined){const at=instant(p.at);if(at>now||at<t.createdAt)throw Error('实际完成时间应在创建之后，且不能晚于现在。');t.completedAt=at;}
}
