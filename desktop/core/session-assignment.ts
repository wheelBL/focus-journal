import {randomUUID} from 'node:crypto';
import {createCapture} from './capture-command';
import {defaultCaptureParent} from './capture-destination';
import {isTask} from './item-kind';
import {outlineIndex,outlinePath} from './outline';
import {text,required} from './validation';
import type {JournalState,Session} from './types';

/** Attach preserved evidence; never reconstruct a timed session as manual effort. */
export function assignSession(s:JournalState,p:Record<string,unknown>,now:string):Session {
  const session=s.sessions.find(r=>r.id===p.id);
  if(!session)throw new Error('找不到这段投入记录。');
  if(session.status!=='ended')throw new Error('请先结束计时，再补充事项。');
  if(session.taskId!==null)throw new Error('这段时间已经关联了事项。');
  const task=p.taskId?s.tasks.find(t=>t.id===p.taskId):createCapture(s,{
    parentId:p.parentId===undefined?defaultCaptureParent(s):p.parentId,
    draft:{itemType:'task',title:required(p.title),description:'',tagNames:[],parentQuery:'',estimateMinutes:null,plannedDate:null,dueAt:null,eventAt:null,eventEnd:null,remindAt:null}
  },now);
  if(!task||!isTask(task))throw new Error('请选择可记录投入的事项。');
  const index=outlineIndex(s);
  for(const node of outlinePath(index,task.id)){
    if(('deletedAt' in node.record&&node.record.deletedAt)||node.record.archived)throw new Error('请先恢复已删除或归档的事项及其父项。');
  }
  const overlap=s.sessions.some(r=>r.id!==session.id&&r.taskId===task.id&&r.segments.some(a=>
    session.segments.some(b=>Date.parse(a.start)<Date.parse(b.end)&&Date.parse(a.end)>Date.parse(b.start)&&a.durationMs>0&&b.durationMs>0)));
  if(overlap)throw new Error('这段时间与同一事项的已有投入重叠，请选择其他事项，或先校正已有投入。');
  s.audit.push({id:randomUUID(),entityId:session.id,before:JSON.stringify(session),reason:'计时结束后补充事项',createdAt:now});
  session.taskId=task.id;
  if(p.summary!==undefined)session.summary=text(p.summary);
  session.updatedAt=now;
  task.startedAt=s.sessions.filter(r=>r.taskId===task.id&&r.start).map(r=>r.start!).sort((a,b)=>Date.parse(a)-Date.parse(b))[0]??null;
  return session;
}
