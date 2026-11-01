import {isInformation,isGroup} from './item-kind';
import {blockedReason} from './item-state';
import {deadlineTime} from './deadlines';
import {localDate,shiftDate,type DatePoint,type FilterCondition,type FilterField,type FilterGroup,type FilterOperator,type FilterRule,type ItemFilter,type JournalState,type Task} from './types';
import {outlinePath,branchIds,type OutlineIndex} from './outline';

export const fieldLabels:Record<FilterField,string>={responsibility:'责任安排',assignee:'接手人',completionBy:'完成归属',handedOffAt:'交接日期',focusDate:'重点日期',itemType:'条目类型',status:'结束状态',availability:'可执行情况',plannedDate:'计划开始',dueAt:'截止时间',completedAt:'实际完成',tags:'标签',title:'名称',description:'说明',isProject:'项目标记',estimateMinutes:'原始估计（分钟）',actualMinutes:'实际投入（本项分钟）',scope:'所属范围（含后代）',actionable:'可执行'};
export const operatorLabels:Record<FilterOperator,string>={is:'是','is-not':'不是',before:'早于',after:'晚于',period:'处于',between:'介于',set:'已设置',unset:'未设置',all:'包含全部',any:'包含任一',none:'不包含',contains:'包含','not-contains':'不包含',greater:'大于',less:'小于'};
export const anchorLabels={now:'此刻',today:'今天零点',tomorrow:'明天零点','week-start':'本周一零点','next-week':'下周一零点','month-start':'本月一日零点','next-month':'下月一日零点'};
export const periodLabels={today:'今天','this-week':'本周','next-7-days':'未来 7 天（含今天）','this-month':'本月'};
export const condition=(field:FilterField,op:FilterOperator,value?:FilterCondition['value'],end?:FilterCondition['end']):FilterCondition=>({kind:'condition',field,op,...value===undefined?{}:{value},...end===undefined?{}:{end}});
export const group=(children:FilterRule[]=[],mode:'all'|'any'='all'):FilterGroup=>({kind:'group',mode,children});
export const relative=(anchor:keyof typeof anchorLabels,days=0):DatePoint=>({kind:'relative',anchor,...days?{days}:{}});
export const isDateField=(field:FilterField)=>['plannedDate','dueAt','completedAt','focusDate','handedOffAt'].includes(field);
export function operators(field:FilterField):FilterOperator[]{
 if(isDateField(field))return ['period','before','after','between','set','unset'];
 if(field==='tags')return ['all','any','none','set','unset'];
 if(field==='title'||field==='description'||field==='assignee')return ['contains','not-contains','set','unset'];
 if(field==='estimateMinutes'||field==='actualMinutes')return ['greater','less','between','set','unset'];
 return ['is','is-not'];
}
export function defaultCondition(field:FilterField,op=operators(field)[0]):FilterCondition{
 if(op==='set'||op==='unset')return condition(field,op);
 if(isDateField(field))return op==='period'?condition(field,op,'today'):condition(field,op,relative('today'),op==='between'?relative('tomorrow'):undefined);
 if(field==='tags')return condition(field,op,[]);
 if(field==='estimateMinutes'||field==='actualMinutes')return condition(field,op,0,op==='between'?60:undefined);
 return condition(field,op,field==='responsibility'?'self':field==='completionBy'?'self':field==='itemType'?'task':field==='status'?'open':field==='availability'?'active':['isProject','actionable'].includes(field)?true:'');
}

export function datePointTime(point:DatePoint,now:string):number{
 if(point.kind==='fixed')return Date.parse(point.date.length===10?`${point.date}T00:00:00`:point.date);
 const today=localDate(now),weekday=new Date(`${today}T12:00:00`).getDay(),monday=shiftDate(today,-((weekday+6)%7));
 let value=Date.parse(now);
 if(point.anchor==='today')value=Date.parse(`${today}T00:00:00`);
 else if(point.anchor==='tomorrow')value=Date.parse(`${shiftDate(today,1)}T00:00:00`);
 else if(point.anchor==='week-start')value=Date.parse(`${monday}T00:00:00`);
 else if(point.anchor==='next-week')value=Date.parse(`${shiftDate(monday,7)}T00:00:00`);
 else if(point.anchor==='month-start')value=Date.parse(`${today.slice(0,7)}-01T00:00:00`);
 else if(point.anchor==='next-month'){const d=new Date(`${today.slice(0,7)}-01T00:00:00`);d.setMonth(d.getMonth()+1);value=d.getTime();}
 const result=new Date(value);if(point.days)result.setDate(result.getDate()+point.days);return result.getTime();
}
function periodBounds(period:string,now:string):[number,number]{
 if(period==='today')return [datePointTime(relative('today'),now),datePointTime(relative('tomorrow'),now)];
 if(period==='this-week')return [datePointTime(relative('week-start'),now),datePointTime(relative('next-week'),now)];
 if(period==='this-month')return [datePointTime(relative('month-start'),now),datePointTime(relative('next-month'),now)];
 return [datePointTime(relative('today'),now),datePointTime(relative('today',7),now)];
}
export function datePointLabel(p:DatePoint,now?:string){
 if(p.kind==='fixed')return p.date.replace('T',' ');
 const label=anchorLabels[p.anchor]+(p.days?` ${p.days>0?'+':''}${p.days} 天`:'');
 if(!now)return label;const d=new Date(datePointTime(p,now));return `${label}（${localDate(d)} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}）`;
}

/** Earlier saved views expressed the Unfinished preset as these two exclusions.
 * Extend only that preset; explicit or nested status selections keep their meaning.
 * Return the original rule when unchanged, and never mutate persisted filters. */
function currentUnfinishedRules(rules:FilterGroup):FilterGroup{
 let children=rules.children.map(c=>c.kind==='group'?currentUnfinishedRules(c):c);
 const statuses=children.filter(c=>c.kind==='condition'&&c.field==='status');
 const legacy=rules.mode==='all'&&statuses.length===2&&statuses.every(c=>c.kind==='condition'&&c.op==='is-not')&&statuses.some(c=>c.kind==='condition'&&c.value==='done')&&statuses.some(c=>c.kind==='condition'&&c.value==='cancelled')&&!children.some(c=>c.kind==='group'&&hasRuleField(c,'status'));
 if(legacy)children=[...children,condition('status','is-not','handed-off')];
 return legacy||children.some((c,i)=>c!==rules.children[i])?{...rules,children}:rules;
}
export function rulesFor(f:ItemFilter):FilterGroup{
 if(f.rules)return currentUnfinishedRules(f.rules);
 const c:FilterRule[]=[];
 if(f.view==='done')c.push(condition('status','is','done'));
 else if(f.view!=='all'&&f.completed==='any')c.push(condition('status','is','open'));
 else if(!f.showDone&&f.completed==='any')c.push(...unfinishedRules());
 if(f.view==='actions')c.push(condition('actionable','is',true));
 if(f.view==='unplanned')c.push(condition('plannedDate','unset'));
 if(f.projectsOnly)c.push(condition('isProject','is',true));
 if(f.tagIds.length)c.push(condition('tags',f.tagMode,[...f.tagIds]));
 if(f.planned==='today')c.push(condition('plannedDate','period','today'));
 if(f.planned==='unplanned'&&f.view!=='unplanned')c.push(condition('plannedDate','unset'));
 if(f.planned==='through-today')c.push(group([condition('plannedDate','before',relative('tomorrow')),condition('plannedDate','unset')],'any'));
 if(f.completed!=='any'){c.push(condition('status','is','done'));c.push(condition('completedAt','period',f.completed));}
 if(f.due==='overdue'){c.push(condition('status','is','open'));c.push(condition('dueAt','before',relative('now')));}
 else if(f.due!=='any')c.push(condition('dueAt','period',f.due));
 return group(c.filter((v,i,all)=>all.findIndex(a=>JSON.stringify(a)===JSON.stringify(v))===i));
}
export function withRules(f:ItemFilter,rules:FilterGroup):ItemFilter{
 rules=currentUnfinishedRules(rules);
 const direct=rules.mode==='all'?rules.children.filter((r):r is FilterCondition=>r.kind==='condition'):[];
 const status=direct.find(r=>r.field==='status'&&r.op==='is')?.value;
 const view=direct.some(r=>r.field==='actionable'&&r.value===true)?'actions':status==='done'?'done':status==='open'&&direct.some(r=>r.field==='plannedDate'&&r.op==='unset')?'unplanned':'all';
 return {...f,view,showDone:allowsStatus(rules,'done'),tagIds:[],tagMode:'all',planned:'any',completed:'any',due:'any',projectsOnly:false,rules};
}
/** Project status constraints from the rule tree; cached UI flags are not authoritative. */
export function allowsStatus(rule:FilterRule,status:Task['status']):boolean{
 if(rule.kind==='group')return rule.mode==='all'?rule.children.every(c=>allowsStatus(c,status)):rule.children.some(c=>allowsStatus(c,status));
 return rule.field!=='status'||(rule.op==='is'?rule.value===status:rule.value!==status);
}
export function hasRuleField(rule:FilterRule,field:FilterField):boolean{return rule.kind==='group'?rule.children.some(c=>hasRuleField(c,field)):rule.field===field;}
export function hasTodayFocusRule(f:ItemFilter):boolean{
 const r=rulesFor(f);return r.mode==='all'&&r.children.some(c=>c.kind==='condition'&&c.field==='focusDate'&&c.op==='period'&&c.value==='today');
}
export function simpleStatusValue(rules:FilterCondition[]):string{
 const status=rules.filter(c=>c.field==='status');
 if(!status.length)return 'any';
 if(status.length===1&&status[0].op==='is')return String(status[0].value);
 if(status.length===3&&status.every(c=>c.op==='is-not'&&['done','cancelled','handed-off'].includes(String(c.value)))&&status.some(c=>c.value==='done')&&status.some(c=>c.value==='cancelled'))return 'unfinished';
 return 'custom';
}
export const unfinishedRules=()=>[condition('status','is-not','done'),condition('status','is-not','cancelled'),condition('status','is-not','handed-off')];
/** A simple toggle must not rewrite nested AND/OR status logic. */
export function canToggleCompleted(f:ItemFilter):boolean{
 const r=rulesFor(f);if(!hasRuleField(r,'status'))return true;
 const direct=r.children.filter((c):c is FilterCondition=>c.kind==='condition');
 return r.mode==='all'&&!r.children.some(c=>c.kind==='group'&&hasRuleField(c,'status'))&&['any','open','unfinished'].includes(simpleStatusValue(direct));
}
/** Compare saved meaning, not duplicated legacy fields or derived checkbox state. */
export function filterSignature(f:ItemFilter):string{
 return JSON.stringify({query:f.query,scopeId:f.scopeId,trash:!!f.trash,sort:f.sort??'smart',rules:rulesFor(f)});
}
export function replaceFields(f:ItemFilter,fields:FilterField[],replacement:FilterRule[]):ItemFilter{
 const r=rulesFor(f),children=r.mode==='all'?r.children.filter(c=>c.kind!=='condition'||!fields.includes(c.field)):[r];
 return withRules(f,group([...children,...replacement]));
}
export function selectView(f:ItemFilter,view:ItemFilter['view']):ItemFilter{
 const c:FilterRule[]=view==='all'?[]:[condition('status','is',view==='done'?'done':'open')];
 if(view==='actions')c.push(condition('actionable','is',true));
 if(view==='unplanned')c.push(condition('plannedDate','unset'));
 return replaceFields(f,view==='unplanned'?['status','actionable','plannedDate']:['status','actionable'],c);
}

export function validateRules(value:unknown,state:JournalState):FilterGroup{
 let count=0;const fail=()=>{throw new Error('筛选条件无效，请检查字段、日期和条件值。');};
 const point=(p:unknown)=>{if(!p||typeof p!=='object')return false;const d=p as DatePoint;
  if(d.kind==='relative')return Object.hasOwn(anchorLabels,d.anchor)&&(d.days===undefined||Number.isInteger(d.days)&&Math.abs(d.days)<=36500);
  if(d.kind!=='fixed'||typeof d.date!=='string'||!/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})?)?$/.test(d.date))return false;
  const day=d.date.slice(0,10);return Number.isFinite(datePointTime(d,new Date().toISOString()))&&localDate(`${day}T12:00:00`)===day;
 };
 const visit=(v:unknown,depth:number):FilterRule=>{
  if(!v||typeof v!=='object'||Array.isArray(v)||++count>200||depth>10)return fail();const r=v as FilterRule;
  if(r.kind==='group'){if(!['all','any'].includes(r.mode)||!Array.isArray(r.children))return fail();return group(r.children.map(c=>visit(c,depth+1)),r.mode);}
  if(r.kind!=='condition'||!Object.hasOwn(fieldLabels,r.field)||!operators(r.field).includes(r.op))return fail();
  if(r.op==='set'||r.op==='unset')return condition(r.field,r.op);
  let valid=false;
  if(isDateField(r.field))valid=r.op==='period'?typeof r.value==='string'&&Object.hasOwn(periodLabels,r.value):point(r.value)&&(r.op!=='between'||point(r.end));
  else if(r.field==='tags')valid=Array.isArray(r.value)&&r.value.length<=100&&r.value.every(id=>typeof id==='string'&&state.tags.some(t=>t.id===id));
  else if(r.field==='itemType')valid=['task','note','event','group'].includes(r.value as string);
  else if(r.field==='status')valid=['open','done','cancelled','handed-off'].includes(r.value as string);
  else if(r.field==='responsibility')valid=['self','handed-off','following'].includes(r.value as string);
  else if(r.field==='completionBy')valid=['self','other','shared','unknown'].includes(r.value as string);
  else if(r.field==='availability')valid=['active','paused'].includes(r.value as string);
  else if(r.field==='isProject'||r.field==='actionable')valid=typeof r.value==='boolean';
  else if(r.field==='scope')valid=state.tasks.some(t=>t.id===r.value)||state.schemaVersion<13&&r.value==='inbox';
  else if(r.field==='estimateMinutes'||r.field==='actualMinutes')valid=typeof r.value==='number'&&Number.isFinite(r.value)&&r.value>=0&&(r.op!=='between'||typeof r.end==='number'&&Number.isFinite(r.end)&&r.end>=r.value);
  else valid=typeof r.value==='string'&&r.value.trim().length>0&&r.value.length<=120;
  if(!valid)return fail();
  if(r.op==='between'&&isDateField(r.field)&&(r.value as DatePoint).kind==='fixed'&&(r.end as DatePoint).kind==='fixed'&&datePointTime(r.value as DatePoint,'2026-01-01')>datePointTime(r.end as DatePoint,'2026-01-01'))return fail();
  return condition(r.field,r.op,structuredClone(r.value),r.op==='between'?structuredClone(r.end):undefined);
 };
 const result=visit(value,0);if(result.kind!=='group')return fail();return result;
}

export function matchesRules(r:FilterRule,t:Task,index:OutlineIndex,now:string):boolean{
 if(r.kind==='group')return r.mode==='all'?r.children.every(c=>matchesRules(c,t,index,now)):r.children.some(c=>matchesRules(c,t,index,now));
 const field=r.field;
 if(isGroup(t)&&['status','availability','plannedDate','dueAt','completedAt','focusDate','estimateMinutes','actualMinutes','responsibility','assignee','completionBy','handedOffAt','actionable'].includes(field))return false;
 if(isInformation(t)&&field==='status')return r.op==='is-not';
 if(isInformation(t)&&['plannedDate','dueAt','completedAt','focusDate','status','availability','estimateMinutes','actualMinutes'].includes(field))return false;
 if(isDateField(field)){
  const value=field==='handedOffAt'?t.ownership?.at:t[field as 'plannedDate'|'dueAt'|'completedAt'|'focusDate'];if(r.op==='set')return !!value;if(r.op==='unset')return !value;if(!value)return false;
  const time=field==='dueAt'?deadlineTime(value):Date.parse(value.length===10?`${value}T00:00:00`:value);
  if(r.op==='period'){const [a,b]=periodBounds(String(r.value),now);return time>=a&&time<b;}
  const a=datePointTime(r.value as DatePoint,now);if(r.op==='before')return time<a;if(r.op==='after')return time>a;
  const end=r.end as DatePoint,b=datePointTime(end,now);
  // A selected calendar end date includes that whole day; a relative anchor is an exclusive boundary.
  return time>=a&&(end.kind==='fixed'&&end.date.length===10?time<datePointTime({kind:'fixed',date:shiftDate(end.date,1)},now):time<b);
 }
 if(field==='tags'){const ids=t.tagIds??[],values=(r.value??[]) as string[];if(r.op==='set')return ids.length>0;if(r.op==='unset')return !ids.length;if(r.op==='all')return values.every(id=>ids.includes(id));if(r.op==='none')return values.every(id=>!ids.includes(id));return values.some(id=>ids.includes(id));}
 if(field==='estimateMinutes'||field==='actualMinutes'){
  const n=field==='estimateMinutes'?t.estimateMinutes:(index.stats.get(t.id)?.ownMs??0)/60000;
  if(r.op==='set')return n!==null;if(r.op==='unset')return n===null;if(n===null)return false;
  return r.op==='greater'?n>Number(r.value):r.op==='less'?n<Number(r.value):n>=Number(r.value)&&n<=Number(r.end);
 }
 if(field==='title'||field==='description'||field==='assignee'){
  const value=(field==='assignee'?t.ownership?.assignee??'':t[field]??'').toLocaleLowerCase(),text=String(r.value??'').trim().toLocaleLowerCase();
  if(r.op==='set')return !!value.trim();if(r.op==='unset')return !value.trim();if(!text)return false;
  return r.op==='contains'?value.includes(text):!value.includes(text);
 }
 if(field==='completionBy'&&t.status!=='done')return false;
 const actual=field==='responsibility'?(t.ownership?t.ownership.followUp?'following':'handed-off':'self'):field==='completionBy'?(t.completionBy??'unknown'):field==='itemType'?(t.itemType??'task'):field==='status'?t.status:field==='availability'?(outlinePath(index,t.id).some(n=>(n.record as Task).availability==='paused')?'paused':'active'):field==='isProject'?!!t.isProject:field==='scope'?branchIds(index,String(r.value)).has(t.id):!t.ownership&&!blockedReason(index,t.id);
 const expected=field==='scope'?true:r.value;return r.op==='is'?actual===expected:actual!==expected;
}

export function describeRule(r:FilterRule,state:JournalState,now?:string):string{
 if(r.kind==='group')return r.children.length?`${r.mode==='all'?'全部满足':'满足任一'}：${r.children.map(c=>c.kind==='group'?`（${describeRule(c,state,now)}）`:describeRule(c,state,now)).join(r.mode==='all'?'；':' 或 ')}`:r.mode==='all'?'不限条件':'任一组没有条件，暂无匹配';
 let value='';if(r.op!=='set'&&r.op!=='unset'){
  if(isDateField(r.field))value=r.op==='period'?periodLabels[r.value as keyof typeof periodLabels]:datePointLabel(r.value as DatePoint,now)+(r.op==='between'?` 至 ${datePointLabel(r.end as DatePoint,now)}`:'');
  else if(r.field==='tags')value=(r.value as string[]).map(id=>state.tags.find(t=>t.id===id)?.name??'已移除标签').join('、')||'尚未选择标签';
  else if(r.field==='itemType')value=r.value==='note'?'笔记／信息':r.value==='event'?'事件':r.value==='group'?'分组':'事项';
  else if(r.field==='responsibility')value=({self:'本人负责','handed-off':'已交接',following:'待他人跟进'})[r.value as 'self'|'handed-off'|'following'];
  else if(r.field==='completionBy')value=({self:'本人完成',other:'他人完成',shared:'共同完成',unknown:'未注明'})[r.value as 'self'|'other'|'shared'|'unknown'];
  else if(r.field==='availability')value=r.value==='paused'?'已暂停（含父级影响）':'可做安排';
  else if(r.field==='status')value=({open:'未完成',done:'已完成',cancelled:'已取消','handed-off':'已交接（关闭）'})[r.value as Task['status']];
  else if(r.field==='scope')value=state.tasks.find(t=>t.id===r.value)?.title??'收件箱';
  else value=typeof r.value==='boolean'?(r.value?'是':'否'):String(r.value??'')+(r.op==='between'?` 至 ${r.end}`:'');
 }
 return `${fieldLabels[r.field]} ${operatorLabels[r.op]} ${value}`.trim();
}
export function ruleTagIds(r:FilterRule):string[]{return r.kind==='group'?r.children.flatMap(ruleTagIds):r.field==='tags'&&Array.isArray(r.value)?r.value:[];}
export function remapFilterTag(f:ItemFilter,oldId:string,newId:string|null):ItemFilter{
 const visit=(r:FilterRule):FilterRule|null=>{
  if(r.kind==='group'){const children=r.children.flatMap(c=>{const updated=visit(c);return updated?[updated]:[];});return children.length||!r.children.length?group(children,r.mode):null;}
  if(r.field!=='tags'||!Array.isArray(r.value)||!r.value.includes(oldId))return r;
  const values=[...new Set(r.value.flatMap(id=>id===oldId?newId?[newId]:[]:[id]))];return values.length?{...r,value:values}:null;
 };
 return {...f,tagIds:[...new Set(f.tagIds.flatMap(id=>id===oldId?newId?[newId]:[]:[id]))],...f.rules?{rules:(visit(f.rules) as FilterGroup|null)??group()}: {}};
}
