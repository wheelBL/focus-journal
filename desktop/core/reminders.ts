import {breakContinuation} from './break-state';
import {sessionTitle} from './session-label';
import {effectiveItemReminder,scheduledItems,reminderTime} from './item-reminders';
import type {JournalState,ReminderSettings,ReminderView,Settings,Session} from './types';

export const defaultReminderSettings=():ReminderSettings=>({sound:true,volume:60,repeatSeconds:30});
export const reminderSettings=(settings:Settings)=>({...defaultReminderSettings(),...settings.reminders});
export function validateReminderSettings(value:unknown):ReminderSettings{
 const v=value as ReminderSettings;
 if(!v||typeof v.sound!=='boolean'||typeof v.volume!=='number'||!Number.isFinite(v.volume)||v.volume<0||v.volume>100||![15,30,60,120].includes(v.repeatSeconds))throw new Error('提醒设置无效，请选择有效的音量和重复间隔。');
 return {sound:v.sound,volume:v.volume,repeatSeconds:v.repeatSeconds};
}
export function pendingReminders(state:JournalState,active:Session[]=state.sessions):ReminderView[]{
 const rest=state.settings.rest,runningCount=active.filter(r=>r.status==='running').length;
 const breakAlerts:ReminderView[]=rest?.phase==='ready'&&rest.notify?[{kind:'break',sessionId:`break:${rest.id}`,taskId:null,title:'欢迎回来，准备继续了吗？',durationMs:0,targetMinutes:state.settings.targetMinutes,breakMinutes:state.settings.breakMinutes,continuationTitle:breakContinuation(state).title}]:[];
 return [...breakAlerts,...scheduledItems(state).filter(t=>effectiveItemReminder(t)!.state==='pending').map(t=>({kind:'task' as const,sessionId:`item:${t.id}`,taskId:t.id,title:t.ownership?`跟进 ${t.ownership.assignee} · ${t.title}`:t.title,remindAt:reminderTime(t),durationMs:0,targetMinutes:0})),...active.filter(s=>s.status==='running'&&s.reminder?.state==='pending').map(s=>({sessionId:s.id,taskId:s.taskId,title:sessionTitle(state,s.taskId),breakMinutes:state.settings.breakMinutes,canRest:runningCount===1,durationMs:s.durationMs,targetMinutes:s.targetMinutes,...s.targetOffsetMs!==undefined?{targetOffsetMs:s.targetOffsetMs}:{}}))];
}

// One audio channel for every timer. Each acknowledgement/snooze ends its alert cycle.
// Monotonic time avoids bursts after wall-clock changes. At most one cue per tick,
// an initial cue plus three repeats per alert cycle, never overlapping the 2s chime.
export class ReminderCadence{
 private entries=new Map<string,{count:number;last:number}>();
 private lastCue=-Infinity;
 next(now:number,alerts:ReminderView[],settings:ReminderSettings):boolean{
  const ids=new Set(alerts.map(a=>a.sessionId));for(const id of this.entries.keys())if(!ids.has(id))this.entries.delete(id);
  if(!settings.sound||settings.volume===0||now-this.lastCue<3000)return false;
  const due=alerts.filter(a=>{const e=this.entries.get(a.sessionId);return !e||(e.count<4&&now-e.last>=settings.repeatSeconds*1000);});
  if(!due.length)return false;
  for(const a of due)this.entries.set(a.sessionId,{count:(this.entries.get(a.sessionId)?.count??0)+1,last:now});
  this.lastCue=now;return true;
 }
 clear(){this.entries.clear();this.lastCue=-Infinity;}
}

export function reminderBounds(area:{x:number;y:number;width:number;height:number},count:number,kind?:ReminderView['kind']){
 const width=Math.min(520,area.width),height=Math.min(count===1&&kind==='break'?290:190+Math.max(1,Math.min(count,3))*220,area.height);
 return {x:Math.round(area.x+(area.width-width)/2),y:Math.round(area.y+Math.min(area.height*.13,area.height-height)),width,height};
}
