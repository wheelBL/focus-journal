import {branchIds,outlineIndex,outlinePath} from './outline';
import {localDate,shiftDate,type JournalState,type ReviewSchedule,type Task} from './types';

export function nextReviewDate(date:string,interval:ReviewSchedule['interval']):string|null {
 if(interval.unit==='once')return null;
 if(interval.unit==='days'||interval.unit==='weeks')return shiftDate(date,interval.count*(interval.unit==='weeks'?7:1));
 const [year,month,day]=date.split('-').map(Number),target=new Date(`${date}T12:00:00`);target.setDate(1);target.setFullYear(year,month-1+interval.count,1);const end=new Date(target);end.setMonth(end.getMonth()+1,0);const last=end.getDate();
 target.setDate(Math.min(day,last));return localDate(target);
}
export function validateReviewSchedule(value:unknown):ReviewSchedule {
 const v=value as ReviewSchedule,validDate=(d:unknown)=>typeof d==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(d)&&localDate(`${d}T12:00:00`)===d;
 if(!v||typeof v.enabled!=='boolean'||!v.interval||!['once','days','weeks','months'].includes(v.interval.unit)||!Number.isInteger(v.interval.count)||v.interval.count<1||v.interval.count>120||v.enabled&&!validDate(v.nextDate)||v.nextDate!==null&&!validDate(v.nextDate)||v.lastReviewedAt!==null&&(typeof v.lastReviewedAt!=='string'||!Number.isFinite(Date.parse(v.lastReviewedAt))||new Date(v.lastReviewedAt).toISOString()!==v.lastReviewedAt))throw new Error('审视安排无效，请填写有效日期和 1–120 的间隔。');
 return structuredClone(v);
}
export function reviewQueue(state:JournalState,today:string,mode:'due'|'upcoming'|'all'='due'):Task[]{
 const index=outlineIndex(state),items=state.tasks.filter(t=>t.status==='open'&&t.reviewSchedule?.enabled&&t.reviewSchedule.nextDate&&!outlinePath(index,t.id).some(n=>(n.record as Task).deletedAt)&&(mode==='all'||(mode==='due'?t.reviewSchedule.nextDate<=today:t.reviewSchedule.nextDate>today)));
 const ids=new Set(items.map(t=>t.id)),groups=new Map<string,Task[]>();
 for(const item of items){const root=outlinePath(index,item.id).find(n=>ids.has(n.id))!.id;const group=groups.get(root)??[];group.push(item);groups.set(root,group);}
 const order=new Map(index.ordered.map((n,i)=>[n.id,i]));
 return [...groups.values()].sort((a,b)=>a.map(t=>t.reviewSchedule!.nextDate!).sort()[0].localeCompare(b.map(t=>t.reviewSchedule!.nextDate!).sort()[0])).flatMap(group=>group.sort((a,b)=>(order.get(a.id)??0)-(order.get(b.id)??0)));
}
export function reviewChanges(state:JournalState,id:string){
 const item=state.tasks.find(t=>t.id===id),since=item?.reviewSchedule?.lastReviewedAt;if(!since)return null;
 const ids=branchIds(outlineIndex(state),id),items=state.tasks.filter(t=>ids.has(t.id));
 return {since,created:items.filter(t=>t.createdAt>since).length,completed:items.filter(t=>t.completedAt&&t.completedAt>since).length,records:state.sessions.filter(s=>(s.taskId!==null&&ids.has(s.taskId))&&s.updatedAt>since).length};
}
