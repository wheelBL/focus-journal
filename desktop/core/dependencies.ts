import {deadlineBoundary,isDateDeadline} from './deadlines';
import {isTask} from './item-kind';
import {localDate,shiftDate,type JournalState,type Task,type DependencyOffset,type DependencyPlan} from './types';
import {validateSchedule} from './validation';

export type DependencyCommand={type:'dependency.set';payload:{id:string;predecessorIds:string[];mode?:'follow'|'fixed'}}|{type:'dependency.chain';payload:{ids:string[]}};
export type DependencyStatus={waiting:boolean;predecessors:{id:string;done:boolean;reason:'open'|'cancelled'|'handed-off'|'deleted'|'archived'|null}[];missingBaseline:boolean;conflict:boolean};
const dayNumber=(d:string)=>Date.parse(`${d}T00:00:00Z`)/86400000;
const dueDay=(d:string)=>isDateDeadline(d)?d:localDate(d);
const diff=(a:string,b:string):DependencyOffset=>isDateDeadline(a)&&isDateDeadline(b)?{unit:'days',value:Math.max(0,dayNumber(b)-dayNumber(a))}:{unit:'milliseconds',value:Math.max(0,deadlineBoundary(b)-deadlineBoundary(a))};
function candidate(base:string,offset:DependencyOffset,precision:string|null|undefined):string {
 let ms:number;
 if(offset.unit==='days'){const date=shiftDate(dueDay(base),offset.value);ms=deadlineBoundary(date);if(!isDateDeadline(base))ms+=deadlineBoundary(base)-deadlineBoundary(dueDay(base));}
 else ms=deadlineBoundary(base)+offset.value;
 if(precision&&isDateDeadline(precision)){let d=localDate(ms);if(deadlineBoundary(d)<ms)d=shiftDate(d,1);return d;}
 if(!precision&&isDateDeadline(base)&&offset.unit==='days')return shiftDate(base,offset.value);
 return new Date(ms).toISOString();
}
function graph(s:JournalState){
 const tasks=new Map(s.tasks.map(t=>[t.id,t])),next=new Map<string,string[]>(),degree=new Map(s.tasks.map(t=>[t.id,0])),children=new Map<string,string[]>(),hidden=new Set<string>();
 for(const t of s.tasks){if(t.parentId){const a=children.get(t.parentId)??[];a.push(t.id);children.set(t.parentId,a);}if(t.deletedAt||t.archived)hidden.add(t.id);}const queueHidden=[...hidden];for(let i=0;i<queueHidden.length;i++)for(const id of children.get(queueHidden[i])??[])if(!hidden.has(id)){hidden.add(id);queueHidden.push(id);}
 const add=(a:string,b:string)=>{const v=next.get(a)??[];v.push(b);next.set(a,v);degree.set(b,degree.get(b)!+1);};
 for(const t of s.tasks){
  if(t.parentId&&tasks.has(t.parentId))add(t.id,t.parentId);
  const p=t.dependencyPlan;if(p===undefined)continue;if(!p)throw Error('前置关系无效。');
  if(!isTask(t)||t.recurrence||!p||typeof p!=='object'||Array.isArray(p)||Object.keys(p).sort().join(',')!=='mode,predecessors'||!['follow','fixed'].includes(p.mode)||!Array.isArray(p.predecessors)||!p.predecessors.length||p.predecessors.length>1000)throw Error('前置关系无效；重复事项需先取消重复。');
  const seen=new Set<string>();
  for(const edge of p.predecessors){const pre=tasks.get(edge?.id);if(!edge||Object.keys(edge).sort().join(',')!=='id,offset'||typeof edge.id!=='string'||!pre||!isTask(pre)||pre.recurrence||edge.id===t.id||seen.has(edge.id))throw Error('前置事项无效或重复；重复事项需先取消重复。');seen.add(edge.id);const o=edge.offset;if(o!==null&&(!o||typeof o!=='object'||Object.keys(o).sort().join(',')!=='unit,value'||!['days','milliseconds'].includes(o.unit)||!Number.isSafeInteger(o.value)||o.value<0||o.value>(o.unit==='days'?365000:31557600000000)))throw Error('前置间隔无效。');if(pre.dueAt&&o){try{const d=candidate(pre.dueAt,o,t.dueAt);if(!/^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(d)||!Number.isFinite(deadlineBoundary(d)))throw Error();}catch{throw Error('前置间隔超出可表示的日期范围，请缩短间隔。');}}add(edge.id,t.id);}
 }
 const queue=[...degree].filter(([,n])=>n===0).map(([id])=>id),order:string[]=[];
 for(let i=0;i<queue.length;i++){const id=queue[i];order.push(id);for(const n of next.get(id)??[]){degree.set(n,degree.get(n)!-1);if(!degree.get(n))queue.push(n);}}
 if(order.length!==s.tasks.length)throw Error('前置关系与事项层级形成循环，请调整关系或层级。');
 return {tasks,order,hidden};
}
export function validateDependencyGraph(s:JournalState):void {graph(s);}
export function deriveDependencyStatuses(s:JournalState):Map<string,DependencyStatus>{
 const tasks=new Map(s.tasks.map(t=>[t.id,t])),result=new Map<string,DependencyStatus>();
 for(const t of s.tasks){if(!t.dependencyPlan)continue;const predecessors=t.dependencyPlan.predecessors.map(e=>{const p=tasks.get(e.id)!;const done=p.status==='done';return {id:e.id,done,reason:done?null:p.deletedAt?'deleted' as const:p.archived?'archived' as const:p.status==='cancelled'?'cancelled' as const:p.status==='handed-off'?'handed-off' as const:'open' as const};});
 result.set(t.id,{waiting:predecessors.some(p=>!p.done),predecessors,missingBaseline:t.dependencyPlan.predecessors.some(e=>!tasks.get(e.id)?.dueAt||!e.offset),conflict:!!t.dueAt&&t.dependencyPlan.predecessors.some(e=>{const d=tasks.get(e.id)?.dueAt;return !!d&&deadlineBoundary(t.dueAt!)<deadlineBoundary(e.offset?candidate(d,e.offset,t.dueAt):d);})});}return result;
}
export function applyDependencyCommand(s:JournalState,command:DependencyCommand):void {
 const {tasks,hidden}=graph(s);
 const set=(id:string,ids:string[],mode?:'follow'|'fixed')=>{const t=tasks.get(id);if(!t||!isTask(t)||t.recurrence)throw Error('请选择非重复的普通任务。');if(!Array.isArray(ids)||ids.some(x=>typeof x!=='string')||new Set(ids).size!==ids.length||mode!==undefined&&!['follow','fixed'].includes(mode))throw Error('前置事项无效。');
  const previous=new Map(t.dependencyPlan?.predecessors.map(e=>[e.id,e])??[]),added=ids.some(key=>!previous.has(key)),removed=[...previous.keys()].some(key=>!ids.includes(key));if(!ids.length){delete t.dependencyPlan;return;}if(added&&(t.status!=='open'||hidden.has(id)))throw Error('请先恢复任务，再新增前置关系。');
  t.dependencyPlan={mode:mode??t.dependencyPlan?.mode??'follow',predecessors:ids.map(id=>{const p=tasks.get(id);if(!p||!isTask(p)||p.recurrence)throw Error('前置事项必须是非重复的普通任务。');if(!previous.has(id)&&(hidden.has(id)||p.status==='cancelled'||p.status==='handed-off'))throw Error('请选择可用或已完成的前置任务。');return removed&&p.dueAt&&t.dueAt?{id,offset:diff(p.dueAt,t.dueAt)}:previous.get(id)??{id,offset:p.dueAt&&t.dueAt?diff(p.dueAt,t.dueAt):null};})};
 };
 if(command.type==='dependency.set')set(command.payload.id,command.payload.predecessorIds,command.payload.mode);
 else {const ids=command.payload.ids;if(!Array.isArray(ids)||ids.length<2||ids.some(id=>typeof id!=='string')||new Set(ids).size!==ids.length)throw Error('请选择至少两个不同任务。');for(let i=1;i<ids.length;i++){const t=tasks.get(ids[i]);set(ids[i],[...new Set([...(t?.dependencyPlan?.predecessors.map(e=>e.id)??[]),ids[i-1]])],t?.dependencyPlan?.mode);}}
 validateDependencyGraph(s);
}
export function reconcileDependencies(before:JournalState,after:JournalState,options:{skipPropagation?:boolean}={}):void {
 const {tasks,order,hidden}=graph(after),old=new Map(before.tasks.map(t=>[t.id,t]));if(options.skipPropagation)return;
 for(const id of order){const t=tasks.get(id)!,plan=t.dependencyPlan;if(!plan)continue;const was=old.get(id),manual=!!was&&was.dueAt!==t.dueAt;
  if(manual){if(!t.dueAt){plan.mode='fixed';continue;}for(const e of plan.predecessors){const d=tasks.get(e.id)?.dueAt;if(d){if(plan.mode==='follow'&&deadlineBoundary(t.dueAt)<deadlineBoundary(d))throw Error(`「${t.title}」截止不能早于前置事项，请调整日期或移除关系。`);e.offset=diff(d,t.dueAt);}}continue;}
  if(plan.mode!=='follow'||t.status!=='open'||hidden.has(id))continue;
  const cleared=plan.predecessors.some(e=>old.get(e.id)?.dueAt&&!tasks.get(e.id)?.dueAt);if(cleared&&t.dueAt){for(const e of plan.predecessors){const d=tasks.get(e.id)?.dueAt;if(d)e.offset=diff(d,t.dueAt);}continue;}
  const candidates:string[]=[];
  for(const e of plan.predecessors){const pre=tasks.get(e.id)!;if(!pre.dueAt)continue;if(!e.offset)e.offset=t.dueAt?diff(pre.dueAt,t.dueAt):isDateDeadline(pre.dueAt)?{unit:'days',value:0}:{unit:'milliseconds',value:0};candidates.push(candidate(pre.dueAt,e.offset,t.dueAt));}
  if(!candidates.length)continue;const next=candidates.reduce((a,b)=>deadlineBoundary(a)>=deadlineBoundary(b)?a:b);if(next===t.dueAt)continue;
  if(t.plannedDate&&t.dueAt){const delta=dayNumber(dueDay(next))-dayNumber(dueDay(t.dueAt));t.plannedDate=shiftDate(t.plannedDate,delta);}t.dueAt=next;try{validateSchedule(t);}catch{throw Error(`「${t.title}」的计划开始与联动截止冲突，请先调整计划。`);}
 }
}
export function previewDependencyChange(state:JournalState,command:DependencyCommand):{state:JournalState;changedIds:string[]}{const draft=structuredClone(state);applyDependencyCommand(draft,command);reconcileDependencies(state,draft);const old=new Map(state.tasks.map(t=>[t.id,JSON.stringify(t)]));return {state:draft,changedIds:draft.tasks.filter(t=>old.get(t.id)!==JSON.stringify(t)).map(t=>t.id)};}
