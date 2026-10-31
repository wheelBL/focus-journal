import {randomUUID} from 'node:crypto';
import {instant,required} from './validation';
import {localDate,type JournalState} from './types';

/** Change only the first work segment; later work and every pause stay intact. */
export function setSessionStart(state:JournalState,p:Record<string,unknown>,now:string){
 const id=required(p.sessionId,100),record=state.sessions.find(s=>s.id===id);
 if(!record||record.status==='ended'||!record.start||!record.segments.length)throw new Error('请选择正在计时或暂停的记录；已经结束的投入请使用校正。');
 if(p.expectedStart!==undefined&&p.expectedStart!==record.start)throw new Error('开始时间已在别处调整，请重新打开后再保存。');
 const start=instant(p.startedAt),first=record.segments[0],at=Date.parse(start),delta=Date.parse(first.start)-at;
 if(at>Date.parse(now))throw new Error('计时开始时间不能在未来。');
 if(at>Date.parse(first.end)||first.durationMs+delta<0)throw new Error('开始时间不能晚于第一段投入的结束，已有暂停片段会保留。');
 if(Math.abs(delta)>86400000)throw new Error('单次调整开始时间不能超过 24 小时，请核对日期。');
 if(record.taskId!==null&&delta>0&&state.sessions.some(other=>other.id!==id&&other.taskId===record.taskId&&other.segments.some(seg=>seg.durationMs>0&&at<Date.parse(seg.end)&&Date.parse(first.start)>Date.parse(seg.start))))throw new Error('补入的时间与同一事项的已有投入重叠，请调整开始时间，避免重复累计。');
 state.audit.push({id:randomUUID(),entityId:id,before:JSON.stringify(record),reason:'调整计时开始时间，并从当前投入重新计算下一次提醒',createdAt:now});
 first.start=start;first.durationMs+=delta;
 record.start=start;record.date=localDate(start);record.durationMs+=delta;record.updatedAt=now;
 // A remaining focus target counts active effort, not wall time, so pauses cannot consume it.
 record.targetOffsetMs=record.durationMs;record.reminded=false;delete record.reminder;
 const owner=state.tasks.find(t=>t.id===record.taskId);
 if(owner){owner.startedAt=state.sessions.filter(s=>s.taskId===owner.id&&s.start).map(s=>s.start!).sort((a,b)=>Date.parse(a)-Date.parse(b))[0]??null;owner.updatedAt=now;}
}
