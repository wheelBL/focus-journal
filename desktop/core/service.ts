import {appendActivity,validateActivityState} from './activity-log';
import {validateOwnership,completionLabels} from './activity';
import {changeOwnership,setCompletion} from './ownership';
import {breakContinuation} from './break-state';
import {floatingTimerSource} from './floating-timer';
import {clearBreak,offerBreak,startBreak,finishBreak} from './break-cycle';
import {assignSession} from './session-assignment';
import {setSessionStart} from './session-start';
import {timerTargetMs} from './timer-target';
import {JOURNAL_SCHEMA_VERSION} from './types';
import {sessionTitle} from './session-label';
import {deleteSession,restoreSession} from './session-trash';
import {saveManualSession} from './manual-session';
import {saveCalendarSelection} from './calendar-command';
import {defaultCaptureParent} from './capture-destination';
import {configureRecurrence,generateTaskSuccessors,validateRecurrence,localDay,advanceEventReminder} from './recurrence';
import {applyBatch,isBatchLifecycle,batchImpact} from './batch';
import {text,required,number,day,deadline,instant,validateSchedule} from './validation';
import {createCapture,validateInformation} from './capture-command';
import {captureItem,isNote,isEvent,isTask,requireAction} from './item-kind';
import {effectiveItemReminder,scheduledItems,reminderTime,setItemReminder,validateItemReminder} from './item-reminders';
import {isDateDeadline,deadlineTime} from './deadlines';
import {blockedReason} from './item-state';
import {nextReviewDate,validateReviewSchedule} from './item-reviews';
import {validateReminderSettings,pendingReminders,reminderSettings} from './reminders';
import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import {attachTag,renameTag,deleteTag,organizingUndo,tagName} from './organizing';
import {validateFilter,tagKey} from './filters';
import { emptyState, localDate, taskMs, type Command, type JournalState, type JournalStore, type Session, type Snapshot, type WorkClock } from './types';
import {assertOutline,assertParentAvailable,branchIds,currentPosition,ensureOutlineFields,inheritedProjects,migrateOutline,moveBranch,moveRelative,openDescendants,outlineIndex,syncProjectOwnership,type OutlinePosition} from './outline';

const realClock: WorkClock={now:()=>Date.now(),monotonic:()=>performance.now()};
export class JournalService {
  private state: JournalState;
  private revision=0;
  private anchor: number;
  private checkpointAt: number;
  private lastMove:OutlinePosition|null=null;
  private stateHistory:{label:string;apply:(s:JournalState)=>void}[]=[];
  private history:{label:string;apply:(s:JournalState)=>void}[]=[];
  constructor(private store: JournalStore,private clock: WorkClock=realClock,public demo=false,private appVersion='development') {
    const loaded=store.load();this.state=migrateOutline(loaded);
    if(JSON.stringify(loaded)!==JSON.stringify(this.state))store.save(this.state);
    this.anchor=clock.monotonic(); this.checkpointAt=clock.monotonic();
    // A stopped host is not evidence of continued work. Keep the last durable checkpoint.
    if(this.state.sessions.some(s=>s.status!=='ended')) this.commit(s=>{
      for(const session of s.sessions.filter(x=>x.status!=='ended')) {session.status='paused';session.recovered=true;}
    });
  }
  private iso() { return new Date(this.clock.now()).toISOString(); }
  private active(state=this.state) { return state.sessions.filter(s=>s.status!=='ended'); }
  private targetSession(state:JournalState,p:Record<string,unknown>) {
    const sessions=this.active(state);
    if(p.sessionId!==undefined)return sessions.find(s=>s.id===p.sessionId);
    if(p.taskId!==undefined){if(typeof p.taskId!=='string')throw new Error('请选择要操作的计时器。');return sessions.find(s=>s.taskId===p.taskId);}
    if(sessions.length>1)throw new Error('请选择要操作的计时器。');
    return sessions[0];
  }
  private task(state:JournalState,id:unknown) { const task=state.tasks.find(t=>t.id===id); if(!task) throw new Error('找不到这个任务。'); return task; }
  private live(at=this.clock.monotonic(),now=this.iso()): JournalState {
    const s=structuredClone(this.state),delta=Math.max(0,at-this.anchor);
    for(const active of this.active(s))if(active.status==='running') {
      const segment=active.segments.at(-1)!;
      segment.durationMs+=delta;segment.end=now;active.durationMs+=delta;active.updatedAt=now;
    }
    return s;
  }
  private commit(change:(state:JournalState,now:string)=>void,command?:Command) {
    const at=this.clock.monotonic(),now=this.iso();
    const draft=this.live(at,now);change(draft,now);generateTaskSuccessors(this.state,draft,now);ensureOutlineFields(draft);assertOutline(draft);syncProjectOwnership(draft);
    for(const task of draft.tasks)if((task.status!=='open'&&task.status!=='handed-off'||task.deletedAt||task.archived)&&task.reminder){task.reminder.state='dismissed';task.reminder.snoozedUntil=null;}
    for(const task of draft.tasks)if(task.status!=='open'&&task.reviewSchedule?.enabled){task.reviewSchedule.enabled=false;task.reviewSchedule.nextDate=null;}
    const oldTasks=new Map(this.state.tasks.map(t=>[t.id,t]));
    for(const task of draft.tasks){const old=oldTasks.get(task.id);if(old&&JSON.stringify(old)!==JSON.stringify(task))task.updatedAt=now;if(old&&(old.parentId!==task.parentId||old.order!==task.order))draft.moves.push({id:randomUUID(),itemId:task.id,fromParent:old.parentId??null,toParent:task.parentId??null,fromProject:old.projectId,toProject:task.projectId,fromOrder:old.order??0,toOrder:task.order??0,createdAt:now});}
    for(const t of draft.tasks){const old=oldTasks.get(t.id);if(t.status==='done'&&old?.status!=='done')t.completionBy=(t.id===command?.payload?.id?command?.payload?.completionBy as import('./activity').CompletionBy:undefined)??(t.ownership?'other':'self');if(t.status!=='done')delete t.completionBy;validateOwnership(t);}
    if(command)appendActivity(this.state,draft,{...command,meta:{...command.meta,version:this.appVersion}},now);
    validateInformation(draft);
    const active=this.active(draft),owned=active.filter(s=>s.taskId!==null);
    if(new Set(owned.map(s=>s.taskId)).size!==owned.length)throw new Error('同一事项只能保留一个计时器，请先结束或恢复原计时器。');
    const index=outlineIndex(draft);for(const session of active)if(session.status==='running'&&session.taskId!==null){const reason=blockedReason(index,session.taskId);if(reason)throw new Error(`${reason} 请先暂停这件事的计时，再调整。`);}
    this.store.save(draft);this.state=draft;this.revision++;this.anchor=at;this.checkpointAt=this.clock.monotonic();
  }
  private checkpoint() {
    const at=this.clock.monotonic(),now=this.iso(),delta=Math.max(0,at-this.anchor);
    const running=this.state.sessions.filter(s=>s.status==='running').map(s=>{
      const next=structuredClone(s),segment=next.segments.at(-1)!;
      segment.durationMs+=delta;segment.end=now;next.durationMs+=delta;next.updatedAt=now;return next;
    });
    if(!running.length)return;
    const updates=new Map(running.map(s=>[s.id,s]));
    const next={...this.state,sessions:this.state.sessions.map(s=>updates.get(s.id)??s)};
    if(this.store.saveSessionCheckpoint)this.store.saveSessionCheckpoint(running);else this.store.save(next);
    // Only publish after durability succeeds. Clock consumers overlay these records;
    // elapsed time alone does not invalidate the workspace's content revision.
    this.state=next;this.anchor=at;this.checkpointAt=this.clock.monotonic();
  }
  snapshot(): Snapshot {
    const state=this.live(),timers=this.active(state).map(active=>({sessionId:active.id,taskId:active.taskId,durationMs:active.durationMs,targetMinutes:active.targetMinutes,...active.targetOffsetMs!==undefined?{targetOffsetMs:active.targetOffsetMs}:{},paused:active.status==='paused',recovered:active.recovered}));
    return {revision:this.revision,stateUndoLabel:this.stateHistory.at(-1)?.label??null,undoLabel:this.history.at(-1)?.label??null,state,timers,timer:timers[0]??null,now:this.iso(),dataPath:this.store.path,demo:this.demo};
  }
  clockSnapshot():import('./types').ClockSnapshot {
    const sessions=structuredClone(this.active()),delta=Math.max(0,this.clock.monotonic()-this.anchor),now=this.iso();
    for(const active of sessions)if(active.status==='running'){const segment=active.segments.at(-1)!;segment.durationMs+=delta;segment.end=now;active.durationMs+=delta;active.updatedAt=now;}
    return {revision:this.revision,now,sessions,timers:sessions.map(a=>({sessionId:a.id,taskId:a.taskId,durationMs:a.durationMs,targetMinutes:a.targetMinutes,...a.targetOffsetMs!==undefined?{targetOffsetMs:a.targetOffsetMs}:{},paused:a.status==='paused',recovered:a.recovered}))};
  }
  reminderSnapshot(){const clock=this.clockSnapshot();return {alerts:pendingReminders(this.state,clock.sessions),settings:reminderSettings(this.state.settings)};}
  floatingTimerSnapshot(){return floatingTimerSource(this.state,this.clockSnapshot());}
  tick(): string[] {
    const s=this.state,running=this.clockSnapshot().sessions.filter(x=>x.status==='running'),reminders:string[]=[];
    const due=new Set(running.filter(x=>(!x.reminded&&x.durationMs>=timerTargetMs(x))||(x.reminder?.state==='snoozed'&&Date.parse(x.reminder.snoozedUntil!)<=this.clock.now())).map(x=>x.id));
    const itemDue=new Set(scheduledItems(s).filter(t=>['scheduled','snoozed'].includes(effectiveItemReminder(t)!.state)&&Date.parse(reminderTime(t)!)<=this.clock.now()).map(t=>t.id));
    const restDue=!!s.settings.breakUntil&&Date.parse(s.settings.breakUntil)<=this.clock.now();
    if(due.size||itemDue.size||restDue)this.commit(draft=>{
      for(const session of this.active(draft))if(due.has(session.id)){
        session.reminded=true;session.reminder={state:'pending',snoozedUntil:null};reminders.push(`「${sessionTitle(draft,session.taskId)}」本次目标时间已到，计时会继续，直到你主动结束。`);
      }
      for(const task of draft.tasks)if(itemDue.has(task.id)){const reminder=effectiveItemReminder(task)!;reminder.state='pending';reminder.snoozedUntil=null;}
      if(restDue){finishBreak(draft,true);reminders.push('休息结束了，欢迎回来。准备好后，再开始下一次专注。');}
    });
    else if(running.length&&this.clock.monotonic()-this.checkpointAt>=10000)this.checkpoint();
    return reminders;
  }
  suspend() { if(this.active().some(s=>s.status==='running'))this.commit(s=>{for(const a of this.active(s)){a.status='paused';a.recovered=true;}}); }
  shutdown() { if(this.active().length)this.commit(s=>{for(const a of this.active(s)){a.status='paused';a.recovered=true;}});this.store.close(); }
  private operationRecorder:((operation:string,entry:string,result:'success'|'failed')=>void)|null=null;
  setOperationRecorder(record:(operation:string,entry:string,result:'success'|'failed')=>void){this.operationRecorder=record;}
  execute(command:Command):Snapshot{try{const result=this.executeCommand(command);if(command.meta?.source!=='ai')try{this.operationRecorder?.(command.type,command.meta?.entry??'system.command','success');}catch{}return result;}catch(error){if(command.meta?.source!=='ai')try{this.operationRecorder?.(command.type,command.meta?.entry??'system.command','failed');}catch{}throw error;}}
  private executeCommand(command:Command): Snapshot {
    const p=command.payload??{};
    if(command.type==='item-review.mark'&&p.batchId&&this.state.itemReviews.some(r=>r.batchId===p.batchId))return this.snapshot();
    const before=structuredClone(this.state);let moved:OutlinePosition|undefined,undo=false,organizing=false,stateUndone=false;
    const lifecycle=['item.change','task.status','item.handoff','item.reclaim','item.completion'].includes(command.type)||command.type==='focus.stop'&&p.complete===true||command.type==='items.batch'&&isBatchLifecycle(p.action);
    const undoLabel=command.type==='recurrence.set'?'重复安排':lifecycle?'事项状态':command.type==='items.batch'?'批量整理':command.type==='item.focus'?'今日重点':command.type==='event.save'?'事件时间':command.type==='outline.move'?'移动事项':command.type.startsWith('tag.')?'修改标签':command.type==='outline.patch'&&p.field!=='estimateMinutes'?'编辑事项':command.type==='task.plan'?'修改计划':command.type==='task.save'&&p.id?'编辑事项':null;
    this.commit((s,now)=>{
      switch(command.type) {
        case 'item.handoff': {changeOwnership(s,p,now);break;}
        case 'item.reclaim': {changeOwnership(s,p,now,true);break;}
        case 'item.completion': {setCompletion(this.task(s,p.id),p,now);break;}
        case 'items.batch': {applyBatch(s,p,now);break;}
        case 'calendar.save': {saveCalendarSelection(s,p,now);break;}
        case 'capture.create': {const item=createCapture(s,p,now);if(p.start===true){requireAction(item);this.startSession(s,{taskId:item.id,skipEstimate:true,mode:p.mode},now);}break;}
        case 'item.focus': {const task=this.task(s,p.id);requireAction(task);if(task.status!=='open'||task.deletedAt)throw new Error('请选择未完成事项。');task.focusDate=p.date?day(p.date):null;break;}
        case 'recurrence.set': {configureRecurrence(this.task(s,p.id),p.rule,now);break;}
        case 'event.save': {const task=this.task(s,p.id);if(!isEvent(task))throw new Error('请选择事件。');task.eventAt=deadline(p.at);task.eventEnd=p.end?instant(p.end):null;if(task.recurrence){task.recurrence.anchor=localDay(task.eventAt);if(task.recurrence.until&&task.recurrence.until<task.recurrence.anchor)throw new Error('事件日期晚于重复结束日，请先调整重复范围。');if(task.reminder&&task.recurrence.reminderOffsetMs!==undefined)task.reminder={at:new Date(Date.parse(task.eventAt.length===10?`${task.eventAt}T00:00:00`:task.eventAt)+task.recurrence.reminderOffsetMs).toISOString(),state:'scheduled',snoozedUntil:null};}break;}
        case 'item-reminder.set': {const task=this.task(s,p.id);setItemReminder(task,p.at);if(task.recurrence&&isEvent(task)){delete task.recurrence.reminderOffsetMs;if(task.reminder)configureRecurrence(task,task.recurrence,now);}break;}
        case 'item-reminder.snooze':
        case 'item-reminder.dismiss': {
          const task=scheduledItems(s).find(t=>t.id===p.id&&effectiveItemReminder(t)?.state==='pending');if(!task)throw new Error('这个提醒已经处理。');
          effectiveItemReminder(task)!.state=command.type==='item-reminder.snooze'?'snoozed':'dismissed';effectiveItemReminder(task)!.snoozedUntil=command.type==='item-reminder.snooze'?new Date(this.clock.now()+300000).toISOString():null;if(command.type==='item-reminder.dismiss'&&!task.ownership)advanceEventReminder(task,now);break;
        }
        case 'item-review.configure': {
          const task=this.task(s,p.id),enabled=p.enabled===true;if(enabled&&(task.status!=='open'||task.deletedAt))throw new Error('请先重新打开或恢复事项，再开启审视。');
          task.reviewSchedule=validateReviewSchedule({enabled,nextDate:enabled?day(p.nextDate):null,interval:p.interval,lastReviewedAt:task.reviewSchedule?.lastReviewedAt??null});
          if(enabled&&p.pause===true){task.availability='paused';const ids=branchIds(outlineIndex(s),task.id);for(const a of this.active(s))if((a.taskId!==null&&ids.has(a.taskId))&&a.status==='running'){a.status='paused';a.updatedAt=now;}}break;
        }
        case 'item-review.defer': {
          const task=this.task(s,p.id);if(!task.reviewSchedule?.enabled||task.status!=='open'||task.deletedAt)throw new Error('此事项没有开启审视。');
          const nextDate=day(p.nextDate);if(nextDate<localDate(this.clock.now()))throw new Error('稍后审视请选择今天或之后的日期。');task.reviewSchedule.nextDate=nextDate;break;
        }
        case 'item-review.mark': {
          const batchId=required(p.batchId,100),root=this.task(s,p.id),branch=branchIds(outlineIndex(s),root.id);
          if(p.childIds!==undefined&&(!Array.isArray(p.childIds)||p.childIds.some(id=>typeof id!=='string'||!branch.has(id))))throw new Error('请只选择此事项的子项一起审视。');
          const ids=new Set([root.id,...(p.childIds as string[]|undefined)??[]]),decision=p.decision??'none';if(!['none','pause','resume'].includes(String(decision)))throw new Error('审视决定无效。');
          for(const id of ids){const task=this.task(s,id),schedule=task.reviewSchedule;if(!schedule?.enabled||task.status!=='open'||task.deletedAt)throw new Error('选择的事项已结束或未开启审视，请刷新后重试。');
            const beforeSchedule=structuredClone(schedule),beforeAvailability=task.availability??'active';
            const nextDate=nextReviewDate(localDate(this.clock.now()),schedule.interval);task.reviewSchedule=validateReviewSchedule({...schedule,enabled:nextDate!==null,nextDate,lastReviewedAt:now});
            if(id===root.id&&decision!=='none')task.availability=decision==='pause'?'paused':'active';
            s.itemReviews.push({id:randomUUID(),itemId:id,batchId,reviewedAt:now,note:text(p.note??''),nextDate,beforeSchedule,afterSchedule:structuredClone(task.reviewSchedule),beforeAvailability,afterAvailability:task.availability??'active',undoneAt:null});
          }
          if(decision==='pause')for(const a of this.active(s))if((a.taskId!==null&&branch.has(a.taskId))&&a.status==='running'){a.status='paused';a.updatedAt=now;}
          break;
        }
        case 'item-review.undo': {
          const last=s.itemReviews.filter(r=>!r.undoneAt).at(-1);if(!last||last.batchId!==p.batchId)throw new Error('只能撤销最近一次标记已审视。');
          const records=s.itemReviews.filter(r=>r.batchId===last.batchId&&!r.undoneAt);
          for(const r of records){const task=this.task(s,r.itemId);if(task.status!=='open'||task.deletedAt||JSON.stringify(task.reviewSchedule)!==JSON.stringify(r.afterSchedule)||task.availability!==r.afterAvailability)throw new Error('事项或审视安排已有新变化，未撤销；请检查当前安排。');}
          for(const r of records){const task=this.task(s,r.itemId);task.reviewSchedule=structuredClone(r.beforeSchedule);task.availability=r.beforeAvailability;r.undoneAt=now;}
          const index=outlineIndex(s);for(const a of this.active(s))if(a.status==='running'&&a.taskId!==null&&blockedReason(index,a.taskId)){a.status='paused';a.updatedAt=now;}
          break;
        }
        case 'outline.create': {
          const captured=captureItem(typeof p.title==='string'?p.title:'',p.kind==='note'?'note':p.kind==='event'?'event':'task'),title=required(captured.title),parentId=p.parentId==null?null:required(p.parentId,100);assertParentAvailable(s,parentId);
          if(!['item','task','project','note','event',undefined].includes(p.kind as string|undefined))throw new Error('事项类型无效。');
          const id=randomUUID(),order=(outlineIndex(s).children.get(parentId)??[]).length;
          s.tasks.push({id,projectId:null,title,itemType:captured.itemType,eventAt:isEvent(captured)?localDate(now):null,isProject:p.kind==='project'&&isTask(captured),description:'',archived:false,tagIds:[],outcome:'',nextAction:'',estimateMinutes:null,plannedDate:null,dueAt:null,status:'open',createdAt:now,startedAt:null,completedAt:null,parentId,order});s.settings.selectedTaskId=id;
          if(p.afterId){const anchor=outlineIndex(s).nodes.get(String(p.afterId));if(!anchor||anchor.parentId!==parentId)throw new Error('新增位置已经改变。');moveRelative(s,id,anchor.id,'after');}break;
        }
        case 'outline.patch': {
          const task=this.task(s,p.id);
          if(!['title','description','itemType'].includes(String(p.field)))requireAction(task);
          if(p.field==='itemType'){if(p.value!=='task'||isTask(task))throw new Error('仅支持将信息条目转为事项。');task.itemType='task';task.eventAt=null;task.eventEnd=null;task.recurrence=null;}
          else if(p.field==='title')task.title=required(p.value);
          else if(p.field==='description')task.description=text(p.value);
          else if(p.field==='isProject'){if(typeof p.value!=='boolean')throw new Error('项目标记无效。');task.isProject=p.value;}
          else if(p.field==='outcome'||p.field==='nextAction')task[p.field]=text(p.value);
          else if(p.field==='plannedDate'){task.plannedDate=p.value?day(p.value):null;validateSchedule(task);}
          else if(p.field==='dueAt'){task.dueAt=p.value?deadline(p.value):null;validateSchedule(task);}
          else if(p.field==='estimateMinutes'){if(task.estimateMinutes!==null||taskMs(s,task.id)>0)throw new Error('原始估计已保留或已有投入，请调整剩余估计。');task.estimateMinutes=p.value==null?null:number(p.value);}
          else throw new Error('这个字段不能直接修改。');break;
        }
        case 'tag.attach': attachTag(s,p.id,p.name);break;
        case 'tag.detach': {const task=this.task(s,p.id);task.tagIds=(task.tagIds??[]).filter(id=>id!==p.tagId);break;}
        case 'tag.rename': renameTag(s,p.id,p.name);break;
        case 'tag.delete': deleteTag(s,p.id);break;
        case 'view.save': {
          const name=required(p.name,60),filter=validateFilter(p.filter,s),id=p.id?required(p.id,100):randomUUID();
          const existing=s.views.find(v=>v.id===id);if(p.id&&!existing)throw new Error('视图不存在。');
          if(s.views.some(v=>v.id!==id&&v.name===name))throw new Error('已有同名视图。');
          if(existing)Object.assign(existing,{name,filter});else s.views.push({id,name,filter});break;
        }
        case 'view.delete': {if(!s.views.some(v=>v.id===p.id))throw new Error('视图不存在。');s.views=s.views.filter(v=>v.id!==p.id);break;}
        case 'item.undo': {const previous=this.stateHistory.at(-1);if(!previous)throw new Error('没有可撤销的事项状态调整。');previous.apply(s);stateUndone=true;break;}
        case 'organize.undo': {const previous=this.history.at(-1);if(!previous)throw new Error('没有可以撤销的整理操作。');previous.apply(s);organizing=true;break;}
        case 'outline.move': {
          const position=String(p.position);if(!['inside','before','after','root'].includes(position))throw new Error('移动位置无效。');
          moved=currentPosition(s,required(p.id,100));moveRelative(s,moved.id,p.targetId==null?null:required(p.targetId,100),position as 'inside'|'before'|'after'|'root');break;
        }
        case 'outline.undo': {
          if(!this.lastMove)throw new Error('没有可以撤销的移动。');const previous=this.lastMove;
          const index=outlineIndex(s);const before=previous.beforeId&&index.nodes.get(previous.beforeId)?.parentId===previous.parentId?previous.beforeId:null;
          moveBranch(s,previous.id,previous.parentId,before);undo=true;break;
        }
        case 'project.save': {
          const title=required(p.name),description=text(p.description??'');
          if(p.id){const item=this.task(s,p.id);item.title=title;item.description=description;}
          else s.tasks.push({id:randomUUID(),projectId:null,title,description,isProject:true,archived:false,tagIds:[],outcome:'',nextAction:'',estimateMinutes:null,plannedDate:null,status:'open',createdAt:now,startedAt:null,completedAt:null,parentId:null,order:s.tasks.length});break;
        }
        case 'project.archive': {
          const item=this.task(s,p.id);if(!item.isProject)throw new Error('此事项不是项目。');
          if(!item.archived&&(openDescendants(s,item.id).length||this.active(s).some(a=>a.taskId===item.id)))throw new Error('请先处理未完成子项和当前计时。');item.archived=!item.archived;break;
        }
        case 'task.save': {
          const existing=p.id?this.task(s,p.id):undefined;
          const captured=existing?{title:required(p.title),itemType:existing.itemType??'task'}:captureItem(typeof p.title==='string'?p.title:'',p.itemType==='note'?'note':p.itemType==='event'?'event':'task');
          const title=required(captured.title),projectId=p.projectId==null?(existing?existing.projectId:defaultCaptureParent(s)):required(p.projectId);
          if(p.parentId===undefined&&projectId!==null&&(!existing||p.projectId!==undefined))assertParentAvailable(s,projectId);
          if(!isTask(captured)&&(p.start||p.estimateMinutes!=null||p.plannedDate||p.dueAt||isNote(captured)&&p.remindAt))throw new Error('笔记／信息无需计划或计时，请先转为事项。');
          const outcome=p.outcome===undefined?(existing?.outcome??''):text(p.outcome),nextAction=p.nextAction===undefined?(existing?.nextAction??''):text(p.nextAction);
          if(p.id) {
            const task=this.task(s,p.id);const oldPosition=currentPosition(s,task.id);if(p.parentId!==undefined&&p.parentId!==task.parentId)moveBranch(s,task.id,p.parentId===null?null:required(p.parentId,100));else if(p.parentId===undefined&&p.projectId!==undefined&&task.projectId!==projectId)moveBranch(s,task.id,projectId);if(task.parentId!==oldPosition.parentId)moved=oldPosition;Object.assign(task,{title,outcome,nextAction});
            if(p.plannedDate!==undefined)task.plannedDate=p.plannedDate?day(p.plannedDate):null;
            if(p.dueAt!==undefined)task.dueAt=p.dueAt?deadline(p.dueAt):null;if(p.remindAt!==undefined)setItemReminder(task,p.remindAt);validateSchedule(task);
            if(task&&task.estimateMinutes===null&&p.estimateMinutes!=null){if(taskMs(s,task.id)>0)throw new Error('已有投入，请记录剩余估计，不补写历史初始估计。');task.estimateMinutes=number(p.estimateMinutes);}
          } else {
            const parentId=p.parentId===undefined?projectId:p.parentId===null?null:required(p.parentId,100);assertParentAvailable(s,parentId);
            const id=randomUUID();s.tasks.push({id,projectId,parentId,title,itemType:captured.itemType,eventAt:isEvent(captured)?localDate(now):null,outcome,nextAction,estimateMinutes:p.estimateMinutes==null?null:number(p.estimateMinutes),plannedDate:p.plannedDate?day(p.plannedDate):null,dueAt:p.dueAt?deadline(p.dueAt):null,status:'open',createdAt:now,startedAt:null,completedAt:null});
            if(p.remindAt!==undefined)setItemReminder(s.tasks.at(-1)!,p.remindAt);validateSchedule(s.tasks.at(-1)!);s.settings.selectedTaskId=id;if(p.start===true)this.startSession(s,{taskId:id,skipEstimate:true,mode:p.mode},now);
          }break;
        }
        case 'task.select': {const task=this.task(s,p.id);requireAction(task);if(task.status!=='open')throw new Error('请选择未完成的任务。');s.settings.selectedTaskId=task.id;break;}
        case 'task.plan': {
          const task=this.task(s,p.id);requireAction(task);const planned=p.date?day(p.date):null;const before=task.plannedDate;
          if(p.dueAt!==undefined)task.dueAt=p.dueAt?deadline(p.dueAt):null;validateSchedule({...task,plannedDate:planned});
          if(before!==planned) {task.plannedDate=planned;s.notes.push({id:randomUUID(),kind:'migration',taskId:task.id,text:`${task.title}：计划开始 ${before??'未设置'} → ${planned??'未设置'}${p.reason?` · ${text(p.reason)}`:''}`,createdAt:now});}break;
        }
        case 'task.status': {
          const task=this.task(s,p.id);requireAction(task);if(!['open','done','cancelled'].includes(String(p.status)))throw new Error('状态无效。');
          if(p.status==='open'){assertParentAvailable(s,task.parentId??null);task.ownership=null;}
          const children=openDescendants(s,task.id);if(p.status!=='open'&&children.length&&!['done','cancelled'].includes(String(p.children)))throw new Error(`还有 ${children.length} 个未完成子事项，请先处理。`);
          for(const target of [task,...p.status!=='open'&&p.children?children:[]]){const status=target===task?p.status:p.children;const active=this.active(s).find(a=>a.taskId===target.id);if(active&&status!=='open'){active.status='ended';active.end=now;active.updatedAt=now;}target.status=status as typeof target.status;target.completedAt=status==='done'?now:null;}break;
        }
        case 'item.change': {
          const task=this.task(s,p.id),ids=branchIds(outlineIndex(s),task.id),branch=s.tasks.filter(t=>ids.has(t.id));
          if(p.action==='pause'){task.availability='paused';for(const session of this.active(s))if((session.taskId!==null&&ids.has(session.taskId))&&session.status==='running'){session.status='paused';session.updatedAt=now;}}
          else if(p.action==='resume'){task.availability='active';}
          else if(p.action==='delete'){
            if(branch.filter(t=>!t.deletedAt).length>1&&p.confirmBranch!==true)throw new Error('移入回收站会影响整支子事项，请确认影响后再操作。');
            for(const target of branch)target.deletedAt??=now;
            for(const session of this.active(s))if((session.taskId!==null&&ids.has(session.taskId))){session.status='ended';session.end=now;session.updatedAt=now;}
          }else if(p.action==='restore'){
            assertParentAvailable(s,task.parentId??null);const deletedAt=task.deletedAt;for(const target of branch)if(target.deletedAt===deletedAt)target.deletedAt=null;
          }else throw new Error('事项操作无效。');break;
        }
        case 'focus.switch': {
          this.task(s,p.taskId);const active=this.active(s).find(a=>a.taskId===p.taskId);if(!active){this.startSession(s,{...p,mode:'switch'},now);break;}
          for(const other of this.active(s))if(other.id!==active.id&&other.status==='running'){other.status='ended';other.end=now;other.updatedAt=now;}
          if(active.status==='paused'){active.status='running';active.recovered=false;active.segments.push({start:now,end:now,durationMs:0});}s.settings.selectedTaskId=active.taskId;clearBreak(s);break;
        }
        case 'focus.start-unassigned': {this.startSession(s,p,now,true);break;}
        case 'focus.set-start': {setSessionStart(s,p,now);break;}
        case 'session.assign': {assignSession(s,p,now);if(p.rest===true)startBreak(s,now,p.id);break;}
        case 'focus.start': {
          this.startSession(s,p,now);break;
        }
        case 'focus.pause': {const a=this.targetSession(s,p);if(!a||a.status!=='running')throw new Error('没有正在计时的专注。');a.status='paused';break;}
        case 'focus.resume': {
          const a=this.targetSession(s,p);if(!a||a.status!=='paused')throw new Error('没有暂停的专注。');
          if(p.mode==='switch')for(const other of this.active(s))if(other.id!==a.id&&other.status==='running'){other.status='ended';other.end=now;other.updatedAt=now;}
          a.status='running';a.recovered=false;clearBreak(s);a.segments.push({start:now,end:now,durationMs:0});break;
        }
        case 'focus.stop': {
          const a=this.targetSession(s,p);if(!a)throw new Error('没有正在进行的专注。');a.status='ended';a.end=now;a.updatedAt=now;
          if(p.complete===true){if(a.taskId===null)throw new Error('请先补充事项，再标记完成。');const task=this.task(s,a.taskId);if(openDescendants(s,task.id).length)throw new Error(`还有 ${openDescendants(s,task.id).length} 个未完成子事项，请先处理或仅结束本次专注。`);task.status='done';task.completedAt=now;}if(p.rest===true)startBreak(s,now,a.id);else offerBreak(s,a.id);break;
        }
        case 'reminder.snooze':
        case 'reminder.dismiss': {
          if(!p.sessionId)throw new Error('请选择要处理的提醒。');
          const a=this.targetSession(s,p);if(!a||a.status!=='running'||a.reminder?.state!=='pending')throw new Error('这个到时提醒已经处理。');
          a.reminder=command.type==='reminder.snooze'?{state:'snoozed',snoozedUntil:new Date(this.clock.now()+5*60000).toISOString()}:{state:'dismissed',snoozedUntil:null};a.updatedAt=now;break;
        }
        case 'reminder.snooze-all': {
          if(s.settings.rest?.phase==='ready')s.settings.rest.notify=false;
          for(const task of scheduledItems(s))if(effectiveItemReminder(task)!.state==='pending'){const r=effectiveItemReminder(task)!;r.state='snoozed';r.snoozedUntil=new Date(this.clock.now()+300000).toISOString();r.at=r.snoozedUntil;}
          for(const a of this.active(s))if(a.status==='running'&&a.reminder?.state==='pending'){a.reminder={state:'snoozed',snoozedUntil:new Date(this.clock.now()+5*60000).toISOString()};a.updatedAt=now;}break;
        }
        case 'reminder.settings': {s.settings.reminders=validateReminderSettings(p.settings);break;}
        case 'session.summary': {
          const session=s.sessions.find(x=>x.id===p.id);if(!session)throw new Error('记录不存在。');
          session.summary=text(p.summary??'');session.updatedAt=now;if(p.rest===true)startBreak(s,now,p.id);if(session.taskId===null){if(p.nextAction!==undefined||p.remainingMinutes!=null)throw new Error('请先补充事项，再调整估计。');break;}const task=this.task(s,session.taskId);
          if(p.nextAction!==undefined)task.nextAction=text(p.nextAction);
          if(p.remainingMinutes!=null)s.estimates.push({id:randomUUID(),taskId:task.id,remainingMinutes:number(p.remainingMinutes,0),spentMinutes:taskMs(s,task.id)/60000,reason:session.summary,createdAt:now});break;
        }
        case 'estimate.add': {
          const task=this.task(s,p.taskId);requireAction(task);s.estimates.push({id:randomUUID(),taskId:task.id,remainingMinutes:number(p.remainingMinutes,0),spentMinutes:taskMs(s,task.id)/60000,reason:text(p.reason??''),createdAt:now});break;
        }
        case 'note.add': {
          const kind=p.kind==='event'?'event':'note';const taskId=p.taskId?this.task(s,p.taskId).id:null;
          s.notes.push({id:randomUUID(),kind,text:required(p.text,2000),taskId,createdAt:now});break;
        }
        case 'session.delete': {deleteSession(s,p.id,now,p.summary);break;}
        case 'session.restore': {restoreSession(s,p.id,now);break;}
        case 'session.manual': {saveManualSession(s,p,now);break;}
        case 'review.save': {
          const task=this.task(s,p.taskId);requireAction(task);const existing=s.reviews.find(x=>x.taskId===task.id);
          const values={outcome:text(p.outcome??''),reason:text(p.reason??''),adjustment:text(p.adjustment??''),updatedAt:now};
          if(existing)Object.assign(existing,values);else s.reviews.push({id:randomUUID(),taskId:task.id,...values});
          if(p.nextAction!==undefined)task.nextAction=text(p.nextAction);break;
        }
        case 'break.start': {startBreak(s,now,p.sessionId);break;}
        case 'break.finish': {finishBreak(s,false);break;}
        case 'break.acknowledge': {if(s.settings.rest?.phase==='ready')s.settings.rest.notify=false;break;}
        case 'break.continue': {
          if(s.settings.rest?.phase!=='ready')throw new Error('休息状态已变化，请查看当前计时。');
          const next=breakContinuation(s);
          if(next.sessionId){const a=this.active(s).find(r=>r.id===next.sessionId)!;a.status='running';a.recovered=false;a.segments.push({start:now,end:now,durationMs:0});clearBreak(s);}
          else this.startSession(s,{taskId:next.taskId},now,next.taskId===null);break;
        }
        case 'break.stop': {clearBreak(s);break;}
        case 'settings.save': {s.settings.targetMinutes=number(p.targetMinutes,1,240);s.settings.breakMinutes=number(p.breakMinutes,1,60);break;}
        default: throw new Error('不支持的操作。');
      }
      // Completing/cancelling a timed item in the tree also finishes work, bypassing focus.stop.
      if(!s.settings.rest&&!this.active(s).some(r=>r.status==='running')){
        const previouslyActive=new Set(before.sessions.filter(r=>r.status!=='ended').map(r=>r.id));
        const ended=s.sessions.findLast(r=>r.status==='ended'&&previouslyActive.has(r.id));if(ended)offerBreak(s,ended.id);
      }
    },command);
    if(moved)this.lastMove=moved;if(undo)this.lastMove=null;
    if(stateUndone)this.stateHistory.pop();
    if(organizing)this.history.pop();
    else if(undoLabel&&JSON.stringify({tasks:before.tasks,tags:before.tags,views:before.views})!==JSON.stringify({tasks:this.state.tasks,tags:this.state.tags,views:this.state.views})){
      const afterState=this.state,positions=command.type==='items.batch'&&p.action==='move'?batchImpact(before,p.ids as string[],'move').roots.map(id=>({old:currentPosition(before,id),expected:currentPosition(afterState,id)})):[];
      const position=moved,restoreFields=organizingUndo(before,this.state),after=structuredClone(this.state.tasks),apply=(s:JournalState)=>{if(position){const index=outlineIndex(s);moveBranch(s,position.id,position.parentId,position.beforeId&&index.nodes.get(position.beforeId)?.parentId===position.parentId?position.beforeId:null);}restoreFields(s);
        for(const {old,expected} of positions)if(JSON.stringify(currentPosition(s,old.id))===JSON.stringify(expected)){const index=outlineIndex(s);moveBranch(s,old.id,old.parentId,old.beforeId&&index.nodes.get(old.beforeId)?.parentId===old.parentId?old.beforeId:null);}
        if(lifecycle)for(const generated of after.filter(t=>t.recurrencePreviousId&&!before.tasks.some(b=>b.id===t.id))){const current=s.tasks.find(t=>t.id===generated.id);if(!current)continue;if(JSON.stringify(current)!==JSON.stringify(generated)||s.sessions.some(r=>r.taskId===generated.id)||s.tasks.some(t=>t.parentId===generated.id))throw new Error('下一次事项已有变化，未撤销；请保留其进展并手动重新打开本次事项。');s.tasks=s.tasks.filter(t=>t.id!==generated.id);s.projects=s.projects.filter(p=>p.id!==generated.id);const source=s.tasks.find(t=>t.id===generated.recurrencePreviousId);if(source)source.recurrenceNextId=null;}
        if(lifecycle)for(const old of before.tasks){const expected=after.find(t=>t.id===old.id),task=s.tasks.find(t=>t.id===old.id);if(!expected||!task)continue;const fields=['status','completedAt','availability','deletedAt','reviewSchedule','ownership','completionBy'] as const;for(const field of fields)if(JSON.stringify(old[field])!==JSON.stringify(expected[field])&&JSON.stringify(task[field])===JSON.stringify(expected[field]))(task as any)[field]=structuredClone(old[field]);}
        for(const task of s.tasks)if(task.status!=='open'&&!task.deletedAt&&openDescendants(s,task.id).length)throw new Error('子项已发生新的变化，请先处理子项再撤销。');};
      const history=lifecycle?this.stateHistory:this.history;history.push({label:undoLabel,apply});if(history.length>50)history.shift();
    }
    const result=this.snapshot();
    if(['focus.start','focus.start-unassigned','focus.resume'].includes(command.type)&&result.timers.filter(t=>!t.paused).length>1)result.focusReminder='每次只做一件事情，更容易专注。当前有多个事项同时计时，各项投入会分别累计。';
    if(command.type==='task.status'&&p.status!=='open'||command.type==='focus.stop'&&p.complete===true){const taskId=p.id??result.state.sessions.find(r=>r.id===p.sessionId)?.taskId,parent=result.state.tasks.find(t=>t.id===result.state.tasks.find(t=>t.id===taskId)?.parentId);if(parent&&parent.status==='open'&&!openDescendants(result.state,parent.id).length)result.itemNotice=`子项已结束，可以检查父项「${parent.title}」是否完成；父项保持未完成。`;}
    return result;
  }
  private startSession(s:JournalState,p:Record<string,unknown>,now:string,unassigned=false){
    if(!unassigned&&this.active(s).some(a=>a.taskId===p.taskId))throw new Error('这个事项已有计时器，请先结束或恢复原计时器。');
    const task=unassigned?null:this.task(s,p.taskId),reason=task?blockedReason(outlineIndex(s),task.id):null;if(reason)throw new Error(reason);
    if(task&&task.estimateMinutes===null&&p.estimateMinutes!=null){if(taskMs(s,task.id)>0)throw new Error('已有投入，请调整剩余估计。');task.estimateMinutes=number(p.estimateMinutes);}
    const target=number(p.targetMinutes??s.settings.targetMinutes,1,240);
    if(p.mode==='switch')for(const a of this.active(s))if(a.status==='running'){a.status='ended';a.end=now;a.updatedAt=now;}
    if(task){task.startedAt??=now;s.settings.selectedTaskId=task.id;}clearBreak(s);
    s.sessions.push({id:randomUUID(),taskId:task?.id??null,date:localDate(this.clock.now()),start:now,end:null,status:'running',targetMinutes:target,segments:[{start:now,end:now,durationMs:0}],durationMs:0,manual:false,summary:'',reminded:false,recovered:false,updatedAt:now});
    if(p.startedAt!==undefined)setSessionStart(s,{sessionId:s.sessions.at(-1)!.id,startedAt:p.startedAt},now);
  }
  exportJson() { return JSON.stringify({format:'focus-journal',version:JOURNAL_SCHEMA_VERSION,exportedAt:this.iso(),state:this.live()},null,2); }
  exportCsv() {
    const s=this.live();const cell=(v:unknown)=>{let t=String(v??'');if(/^[=+@\-\t\r]/.test(t))t="'"+t;return '"'+t.replaceAll('"','""')+'"';};
    const rows:unknown[][]=[['日期','项目','任务','开始时间','结束时间','实际分钟','记录方式','进展']];
    for(const record of s.sessions){const task=s.tasks.find(t=>t.id===record.taskId);rows.push([record.date,s.projects.find(p=>p.id===task?.projectId)?.name,sessionTitle(s,record.taskId),record.start??'',record.end??'',Math.round(record.durationMs/600)/100,record.manual?'手动':'计时',record.summary]);}
    return '\uFEFF'+rows.map(r=>r.map(cell).join(',')).join('\r\n');
  }
  importJson(content:string) {
    if(this.active().length)throw new Error('请先结束专注，再恢复备份。');
    return this.restoreState(parseJournalBackup(content));
  }
  importSyncedState(state:JournalState) {
    if(this.active().some(s=>s.status==='running'))throw new Error('请先暂停正在计时的事项，再同步。');
    const next=parseJournalBackup(JSON.stringify({format:'focus-journal',version:JOURNAL_SCHEMA_VERSION,state}));
    next.settings=structuredClone(this.state.settings);clearBreak(next);
    if(!next.tasks.some(t=>t.id===next.settings.selectedTaskId))next.settings.selectedTaskId=null;
    return this.restoreState(next);
  }
  private restoreState(next:JournalState) {
    for(const session of next.sessions)if(session.status!=='ended'){session.status='paused';session.recovered=true;}
    this.store.save(next);this.state=next;this.revision++;this.lastMove=null;this.history=[];this.stateHistory=[];this.anchor=this.clock.monotonic();this.checkpointAt=this.anchor;return this.snapshot();
  }
  seedDemo() {
    if(this.state.tasks.some(t=>t.id!=='inbox'))return;
    const date=localDate(this.clock.now()),at=(time:string)=>new Date(`${date}T${time}:00`).toISOString();
    this.commit(s=>{
      s.projects.push({id:'knowledge',name:'个人知识库',description:'让知识更容易整理和复用',archived:false,createdAt:at('08:30')});
      s.tasks.push({id:'design',projectId:'knowledge',title:'写导入功能设计草稿',outcome:'主要流程、异常情况和待确认问题',nextAction:'先列出导入的主要流程',estimateMinutes:50,plannedDate:date,status:'open',createdAt:at('08:40'),startedAt:null,completedAt:null},
        ...['整理参考资料','更新索引规则'].map((title,i)=>({id:`later-${i}`,projectId:'knowledge',title,outcome:'',nextAction:'',estimateMinutes:25,plannedDate:null,status:'open' as const,createdAt:at('08:40'),startedAt:null,completedAt:null})));
      s.notes.push({id:'thought',kind:'note',text:'先梳理主要流程，再考虑异常情况',taskId:null,createdAt:at('08:45')});s.settings.selectedTaskId='design';
    });
  }
  seedTreeDemo(){
    if(this.state.tasks.some(t=>t.id!=='inbox'))return;this.seedDemo();
    this.commit(s=>{
      const now=this.iso(),today=localDate(now);
      const project=(id:string,name:string,parentId:string|null,description:string)=>s.projects.push({id,name,parentId,description,order:s.projects.length,archived:false,createdAt:now});
      const task=(id:string,title:string,parentId:string,estimateMinutes:number|null=25,nextAction='',outcome='',done=false)=>s.tasks.push({id,title,parentId,projectId:null,order:s.tasks.length,estimateMinutes,nextAction,outcome,plannedDate:null,status:done?'done':'open',createdAt:now,startedAt:null,completedAt:done?now:null});
      project('focus-app','专注记迭代',null,'用更短的操作路径，把估计、实践和复盘连起来。');
      project('tree-design','任务树与动线','focus-app','让多项目和深层任务在一个工作区里可见、可操作。');
      project('personal','生活与学习',null,'给重要但不紧急的事情留一点时间。');
      s.tasks.find(t=>t.id==='design')!.nextAction='先列出导入的主要流程，再逐个补齐异常情况';
      task('input-types','梳理文件来源','design',25,'列出 Markdown、网页剪藏和本地 PDF','明确第一批支持的输入类型',true);
      task('error-flow','设计异常处理','design',50,'先处理重复文件，保留用户的原始内容','一张包含异常分支的导入流程图');
      task('duplicates','重复文件如何处理','error-flow',25,'比较文件名与内容指纹','区分同名文件和重复内容');
      task('same-name','同名、不同内容','duplicates',25,'列出覆盖、保留两份和跳过三种选择');
      task('confirm-copy','补齐覆盖前的确认文案','same-name',null,'先写出用户需要确认的两件事','一句简洁、明确的确认提示');
      task('missing-file','处理文件失效','error-flow',25,'让用户能找到失效文件并重试');
      task('outline-api','确认导入接口','design',25,'列出调用时必须提供的字段');
      task('knowledge-review','整理本周阅读笔记','knowledge',50,'先整理昨天标记的三条摘录');
      task('write-summary','写一段主题小结','knowledge-review',25);
      task('link-notes','连接相关笔记','knowledge-review',25);
      task('tree-everything','验证全部任务一屏浏览','tree-design',25,'展开各个项目，检查状态和投入列','不进入项目也能找到每一项任务',true);
      task('tree-nesting','验证多层任务拆分','tree-design',50,'把一个复杂任务连续拆到可执行的一步');
      task('tree-drag','验证拖拽后的归属','tree-nesting',25,'把整棵分支移到另一个项目，核对路径和累计投入');
      task('tree-inline','打磨行内编辑','tree-design',25,'双击改名，再填写估计与安排日期');
      task('tree-start','检查直接开始计时','tree-design',25,'从任意任务行开始，确认今日同步出现记录');
      task('release-plan','准备下一次试用','focus-app',50);
      task('release-notes','记录本轮使用反馈','release-plan',25);
      task('backup-check','核对备份与恢复','release-plan',25);
      task('learning','继续 TypeScript 学习','personal',50,'从昨天卡住的类型错误开始');
      task('read-types','读完泛型示例','learning',25);
      task('practice-types','改写一个实际小例子','learning',25);
      task('weekly-plan','安排本周运动','personal',15,'选两个不会被会议挤掉的时间段');
      task('inbox-one','想一下下周的阅读主题','inbox',null);
      const addRecord=(id:string,taskId:string,minutes:number,ago:number,summary:string)=>{const end=new Date(this.clock.now()-ago*60000).toISOString(),start=new Date(Date.parse(end)-minutes*60000).toISOString();s.sessions.push({id,taskId,date:localDate(start),start,end,status:'ended',targetMinutes:25,segments:[{start,end,durationMs:minutes*60000}],durationMs:minutes*60000,manual:false,summary,reminded:false,recovered:false,updatedAt:end});const owner=s.tasks.find(t=>t.id===taskId)!;owner.startedAt=start;};
      addRecord('tree-demo-record-a','design',20,120,'主要流程已经列出，接下来细化异常分支。');
      addRecord('tree-demo-record-b','duplicates',15,85,'同名文件需要先比较内容，再决定是否覆盖。');
      addRecord('tree-demo-record-c','tree-everything',25,45,'确认各个项目可以同时展开，已完成任务仍能回看。');
      s.tasks.find(t=>t.id==='tree-inline')!.plannedDate=today;
      s.reviews.push({id:'tree-demo-review',taskId:'tree-everything',outcome:'全部任务可同时展开，保留各自所属层级。',reason:'先确认信息结构，减少后续反复调整。',adjustment:'用真实任务量验证滚动与键盘操作。',updatedAt:now});
    });
  }
}

export function parseJournalBackup(content:string):JournalState {
  let parsed:unknown;try{parsed=JSON.parse(content);}catch{throw new Error('文件不是有效 JSON。');}
  const data=parsed as {format?:string;version?:number;state?:JournalState};
  if(!data||data.format!=='focus-journal'||![1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19].includes(data.version??0)||!data.state)throw new Error('这不是支持的专注记备份。');
  validateState(data.state);return migrateOutline(data.state);
}
function validateState(s:JournalState) {
  const invalid=()=>{throw new Error('备份数据无效或不完整。');};
  const bool=(v:unknown)=>{if(typeof v!=='boolean')invalid();};
  const stamp=(v:unknown)=>{if(instant(v)!==v)invalid();};
  const nullableStamp=(v:unknown)=>{if(v!==null)stamp(v);};
  if(!s||typeof s!=='object'||![1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19].includes(s.schemaVersion))throw new Error('备份版本不受支持。');
  for(const k of ['projects','tasks','sessions','notes','estimates','reviews','audit'] as const){
    if(!Array.isArray(s[k])||s[k].length>100000)invalid();
    const ids=new Set();
    for(const item of s[k]){if(!item||typeof item!=='object')invalid();required(item.id,100);if(ids.has(item.id))invalid();ids.add(item.id);}
  }
  if(s.schemaVersion>=16&&!Array.isArray(s.deletedSessions))invalid();
  if(s.deletedSessions!==undefined&&(!Array.isArray(s.deletedSessions)||s.deletedSessions.length>100000))invalid();
  const archivedIds=new Set<string>(),liveSessionIds=new Set(s.sessions.map(r=>r.id));
  for(const r of s.deletedSessions??[]){required(r?.id,100);if(archivedIds.has(r.id)||liveSessionIds.has(r.id))invalid();archivedIds.add(r.id);}
  const projectIds=new Set(s.projects.map(p=>p.id)),taskIds=new Set(s.tasks.map(t=>t.id)),sessionIds=new Set([...s.sessions.map(r=>r.id),...archivedIds]);
  if(s.schemaVersion<13&&!s.projects.some(p=>p.id==='inbox'&&!p.archived))invalid();
  for(const p of s.projects){required(p.name);text(p.description);bool(p.archived);stamp(p.createdAt);}
  for(const t of s.tasks){
    if(t.status==='handed-off'&&s.schemaVersion<19)invalid();validateOwnership(t);if(t.ownership)validateItemReminder(t.ownership.reminder);if(s.schemaVersion>=19&&t.status==='open'&&t.ownership)invalid();
    required(t.title);text(t.outcome);text(t.nextAction);
    if(t.itemType!==undefined&&!['task','note','event'].includes(t.itemType))invalid();if(t.updatedAt!==undefined)stamp(t.updatedAt);

    if(!(s.schemaVersion>=13&&t.projectId===null)&&!projectIds.has(t.projectId as string)||!['open','done','cancelled','handed-off'].includes(t.status))invalid();
    if(t.estimateMinutes!==null)number(t.estimateMinutes);
    if(t.plannedDate!==null)day(t.plannedDate);
    validateItemReminder(t.reminder);
    if(t.recurrence){validateRecurrence(t.recurrence);if(isNote(t)||isEvent(t)&&(t.recurrence.mode!=='calendar'||t.recurrence.anchor!==localDay(t.eventAt!)))invalid();}
    for(const id of [t.recurrenceNextId,t.recurrencePreviousId])if(id!=null&&(!taskIds.has(id)||id===t.id))invalid();
    if(t.dueAt!==undefined&&t.dueAt!==null){if(typeof t.dueAt==='string'&&isDateDeadline(t.dueAt))day(t.dueAt);else stamp(t.dueAt);}validateSchedule(t);
    stamp(t.createdAt);nullableStamp(t.startedAt);nullableStamp(t.completedAt);
    if((t.status==='done')!==(t.completedAt!==null))invalid();
    if(s.schemaVersion>=8){if(!['active','paused'].includes(t.availability??''))invalid();nullableStamp(t.deletedAt);}
    if(t.reviewSchedule!==undefined&&t.reviewSchedule!==null){validateReviewSchedule(t.reviewSchedule);if(t.status!=='open'&&t.reviewSchedule.enabled)invalid();}
  }
  try{validateInformation(s);}catch{invalid();}
  if(s.schemaVersion>=2){assertOutline(s);const owners=inheritedProjects(s);for(const t of s.tasks)if(owners.get(t.id)!==t.projectId)invalid();}
  if(s.schemaVersion>=4){
    if(!Array.isArray(s.tags)||!Array.isArray(s.views)||s.tags.length>100000||s.views.length>1000)invalid();
    const tagIds=new Set<string>(),names=new Set<string>();for(const tag of s.tags){required(tag.id,100);if(tagIds.has(tag.id)||tagName(tag.name)!==tag.name||names.has(tagKey(tag.name)))invalid();tagIds.add(tag.id);names.add(tagKey(tag.name));}
    for(const t of s.tasks){bool(t.isProject);bool(t.archived);text(t.description);if(!Array.isArray(t.tagIds)||new Set(t.tagIds).size!==t.tagIds.length||t.tagIds.some(id=>!tagIds.has(id)))invalid();}
    const viewIds=new Set<string>();for(const v of s.views){required(v.id,100);required(v.name,60);if(viewIds.has(v.id))invalid();viewIds.add(v.id);validateFilter(v.filter,s);}
    const expected=s.tasks.filter(t=>t.isProject);if(s.projects.length!==expected.length+(s.schemaVersion<13?1:0))invalid();for(const t of expected){const p=s.projects.find(p=>p.id===t.id);if(!p||p.name!==t.title||p.description!==t.description||p.archived!==t.archived||p.parentId!==t.parentId||p.order!==t.order||p.createdAt!==t.createdAt)invalid();}
    if(s.schemaVersion<13&&s.tasks.some(t=>t.id==='inbox'))invalid();
  }
  const checkSession=(r:Session)=>{
    if(!r||!(r.taskId===null&&s.schemaVersion>=14)&&!taskIds.has(r.taskId as string)||!['running','paused','ended'].includes(r.status)||!Array.isArray(r.segments)||r.segments.length>100000)invalid();
    day(r.date);number(r.durationMs,0,365*86400000);number(r.targetMinutes,1,240);text(r.summary);
    if(r.targetOffsetMs!==undefined){if(s.schemaVersion<17)invalid();number(r.targetOffsetMs,0,365*86400000);}
    if(r.reminder!==undefined){if(!r.reminder||!['pending','snoozed','dismissed'].includes(r.reminder.state)||!r.reminded)invalid();nullableStamp(r.reminder.snoozedUntil);if((r.reminder.state==='snoozed')!==(r.reminder.snoozedUntil!==null))invalid();}
    bool(r.manual);bool(r.reminded);bool(r.recovered);stamp(r.updatedAt);nullableStamp(r.start);nullableStamp(r.end);
    let sum=0;
    for(const seg of r.segments){if(!seg)invalid();stamp(seg.start);stamp(seg.end);number(seg.durationMs,0,365*86400000);sum+=seg.durationMs;}
    if(r.segments.length&&(!r.start||Math.abs(sum-r.durationMs)>1))invalid();
    if(r.status!=='ended'&&(!r.segments.length||r.end!==null))invalid();
    if(r.status==='ended'&&r.start&&!r.end)invalid();
    if(!r.segments.length&&(r.start!==null||r.end!==null||!r.manual))invalid();
  };
  for(const r of s.sessions){checkSession(r);if(r.taskId!==null&&r.status!=='ended'&&s.tasks.find(t=>t.id===r.taskId)?.status!=='open')invalid();}
  for(const r of s.deletedSessions??[]){checkSession(r);stamp(r.deletedAt);if(r.status!=='ended')invalid();}
  const active=s.sessions.filter(x=>x.status!=='ended'&&x.taskId!==null);if(new Set(active.map(x=>x.taskId)).size!==active.length)invalid();
  for(const n of s.notes){required(n.text,2000);stamp(n.createdAt);if(!['note','event','migration'].includes(n.kind)||(n.taskId!==null&&!taskIds.has(n.taskId)))invalid();}
  for(const e of s.estimates){number(e.remainingMinutes,0);if(e.spentMinutes!==undefined)number(e.spentMinutes,0,1e10);text(e.reason);stamp(e.createdAt);if(!taskIds.has(e.taskId))invalid();}
  if(s.schemaVersion>=8||s.moves!==undefined){if(!Array.isArray(s.moves)||s.moves.length>200000)invalid();const ids=new Set<string>();for(const m of s.moves){required(m.id,100);if(ids.has(m.id)||!taskIds.has(m.itemId))invalid();ids.add(m.id);for(const id of [m.fromParent,m.toParent,m.fromProject,m.toProject])if(id!==null&&id!=='inbox'&&!taskIds.has(id))invalid();number(m.fromOrder,0,1e10);number(m.toOrder,0,1e10);stamp(m.createdAt);}}
  if(s.schemaVersion>=9||s.itemReviews!==undefined){if(!Array.isArray(s.itemReviews)||s.itemReviews.length>200000)invalid();const ids=new Set<string>(),batches=new Set<string>();for(const r of s.itemReviews){required(r.id,100);required(r.batchId,100);if(ids.has(r.id)||!taskIds.has(r.itemId)||batches.has(r.batchId+'\n'+r.itemId))invalid();ids.add(r.id);batches.add(r.batchId+'\n'+r.itemId);stamp(r.reviewedAt);nullableStamp(r.undoneAt);text(r.note);validateReviewSchedule(r.beforeSchedule);validateReviewSchedule(r.afterSchedule);if(r.nextDate!==null)day(r.nextDate);if(r.nextDate!==r.afterSchedule.nextDate||r.afterSchedule.lastReviewedAt!==r.reviewedAt||!['active','paused'].includes(r.beforeAvailability)||!['active','paused'].includes(r.afterAvailability))invalid();}}
  const reviewed=new Set();
  for(const r of s.reviews){text(r.outcome);text(r.reason);text(r.adjustment);stamp(r.updatedAt);if(!taskIds.has(r.taskId)||reviewed.has(r.taskId))invalid();reviewed.add(r.taskId);}
  for(const a of s.audit){stamp(a.createdAt);text(a.reason);if(!sessionIds.has(a.entityId)||typeof a.before!=='string')invalid();let before:Session;try{before=JSON.parse(a.before);}catch{invalid();}checkSession(before!);if(before!.id!==a.entityId)invalid();}
  validateActivityState(s);
  if(!s.settings)invalid();if(s.settings.reminders!==undefined)validateReminderSettings(s.settings.reminders);number(s.settings.targetMinutes,1,240);number(s.settings.breakMinutes,1,60);nullableStamp(s.settings.breakUntil);
  if(s.settings.rest!=null){const rest=s.settings.rest;required(rest.id,100);if(!['offered','running','ready'].includes(rest.phase))invalid();number(rest.minutes,1,60);bool(rest.notify);if(rest.sessionId!==null&&!s.sessions.some(r=>r.id===rest.sessionId&&r.status==='ended'))invalid();if((rest.phase==='running')!==(s.settings.breakUntil!==null)||rest.notify&&rest.phase!=='ready'||s.sessions.some(r=>r.status==='running'))invalid();}
  else if(s.schemaVersion>=15&&s.settings.breakUntil!==null)invalid();
  if(s.settings.selectedTaskId!==null&&!taskIds.has(s.settings.selectedTaskId))invalid();
}
