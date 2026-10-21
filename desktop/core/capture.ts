import {captureItem,type ItemType} from './item-kind';
import {localDate,shiftDate,type JournalState} from './types';
import {outlineIndex,outlinePath} from './outline';
import {captureDraftErrors} from './capture-validation';

export interface CaptureDraft {
 title:string;description?:string;itemType:ItemType;parentQuery:string|null;tagNames:string[];
 plannedDate:string|null;dueAt:string|null;remindAt:string|null;estimateMinutes:number|null;eventAt:string|null;eventEnd:string|null;
}
export type CaptureField=Exclude<keyof CaptureDraft,'title'|'itemType'|'description'>;
export interface CaptureToken {key:string;raw:string;field:CaptureField;start:number;end:number}
export interface CaptureIssue {message:string;field:keyof CaptureDraft|null}
export interface CaptureResult {draft:CaptureDraft;tokens:CaptureToken[];issues:CaptureIssue[];errors:string[];hints:string[]}
const dateAtom='(?:今天|明天|后天|昨天|前天|(?:下周|本周|周|星期)[一二三四五六日天]|\\d{4}[-/]\\d{1,2}[-/]\\d{1,2}|\\d{1,2}月\\d{1,2}[日号]?)';
const timeAtom='(?:(?:上午|下午|晚上|中午|早上)?\\d{1,2}(?:[:：]\\d{2}|点(?:半|\\d{1,2}分?)?))';
const dateValue=`(?:${dateAtom}(?:[ T]*${timeAtom})?|${timeAtom})`;
const clean=(s:string)=>s.replace(/^(["“'])(.*)["”']$/s,'$2');

/** Local calendar semantics. Date-only values remain date-only; never silently discard a clock. */
export function parseCaptureDate(raw:string,now:string):string|null {
 const value=raw.trim(),today=localDate(now),dateMatch=new RegExp(`^${dateAtom}`).exec(value);
 let date=today,rest=value;
 if(dateMatch){const word=dateMatch[0];rest=value.slice(word.length).trim().replace(/^T/,'');
  const shifts:Record<string,number>={今天:0,明天:1,后天:2,昨天:-1,前天:-2};
  if(Object.hasOwn(shifts,word))date=shiftDate(today,shifts[word]);
  else if(/^(下周|本周|周|星期)/.test(word)){
   const target='一二三四五六日'.indexOf(word.at(-1)==='天'?'日':word.at(-1)!),weekday=(new Date(`${today}T12:00:00`).getDay()+6)%7;
   const delta=target-weekday+(word.startsWith('下周')?7:word.startsWith('本周')?0:target<weekday?7:0);date=shiftDate(today,delta);
  }else{const nums=word.match(/\d+/g)!;date=nums.length===3?`${nums[0]}-${nums[1].padStart(2,'0')}-${nums[2].padStart(2,'0')}`:`${today.slice(0,4)}-${nums[0].padStart(2,'0')}-${nums[1].padStart(2,'0')}`;}
  if(localDate(`${date}T12:00:00`)!==date)return null;
 }
 if(!rest)return dateMatch?date:null;
 const clock=/^(上午|下午|晚上|中午|早上)?(\d{1,2})(?:[:：](\d{2})|点(?:(半)|(\d{1,2})分?)?)$/.exec(rest);
 if(!clock)return null;let hour=Number(clock[2]);const minute=clock[4]?30:Number(clock[3]??clock[5]??0);
 if(clock[1]&&hour>12||hour>23||minute>59)return null;
 if(['下午','晚上','中午'].includes(clock[1])&&hour<12)hour+=12;if(['上午','早上'].includes(clock[1])&&hour===12)hour=0;
 const d=new Date(`${date}T${String(hour).padStart(2,'0')}:${String(minute).padStart(2,'0')}:00`);
 return Number.isFinite(d.getTime())?d.toISOString():null;
}

/** Parse only. No writes, random IDs, system clock, or data mutation. */
export function parseCapture(raw:string,now:string,defaultType:ItemType='task',literalKeys:string[]=[]):CaptureResult {
 const captured=captureItem(raw,defaultType),[body,...content]=captured.title.split(/\r?\n/),tokens:CaptureToken[]=[],issues:CaptureIssue[]=[],hints:string[]=[];
 const issue=(message:string,field:keyof CaptureDraft|null=null)=>issues.push({message,field});
 const draft:CaptureDraft={title:body,description:content.join('\n').trim(),itemType:captured.itemType,parentQuery:null,tagNames:[],plannedDate:null,dueAt:null,remindAt:null,estimateMinutes:null,eventAt:null,eventEnd:null};
 const occupied=new Set<number>(),literals=new Set(literalKeys),protectedRanges:[number,number][]=[];
 for(const m of body.matchAll(/(?:^|\s)(["“'][^"”']*["”'])/g)){const start=m.index!+m[0].indexOf(m[1]);protectedRanges.push([start,start+m[1].length]);}
 const add=(start:number,rawToken:string,field:CaptureField,apply:()=>void)=>{
  const end=start+rawToken.length,key=`${field}:${start}:${rawToken}`;
  if(literals.has(key)||start>0&&body[start-1]==='\\'||protectedRanges.some(([a,b])=>start>=a&&start<b)||Array.from({length:end-start},(_,i)=>start+i).some(i=>occupied.has(i)))return;
  apply();tokens.push({key,raw:rawToken,field,start,end});for(let i=start;i<end;i++)occupied.add(i);
 };
 const scan=(pattern:RegExp,fn:(match:RegExpMatchArray,start:number,token:string)=>void)=>{for(const m of body.matchAll(pattern)){const prefix=m[1]??'',token=m[0].slice(prefix.length);fn(m,m.index!+prefix.length,token);}};
 scan(/(^|\s)([#%])("[^"]+"|'[^']+'|[^\s,，；;]+)/g,(m,start,token)=>add(start,token,m[2]==='#'?'parentQuery':'tagNames',()=>{
  const name=clean(m[3]);if(m[2]==='#'){if(draft.parentQuery)issue('只能指定一个归属路径。','parentQuery');draft.parentQuery=name;}else if(!draft.tagNames.includes(name))draft.tagNames.push(name);
 }));
 const assignDate=(start:number,token:string,field:'plannedDate'|'dueAt'|'remindAt'|'eventAt',value:string)=>add(start,token,field,()=>{
  if(draft[field])issue('同一个时间属性出现多次，请保留一个。',field);const parsed=parseCaptureDate(value,now);
  if(!parsed){issue(`无法识别时间：${value}`,field);return;}
  if(field==='plannedDate'&&parsed.length!==10){issue('计划开始目前精确到日；具体时刻请设置提醒或事件。','plannedDate');return;}
  if(field==='remindAt'&&parsed.length===10){issue('提醒需要具体时刻，例如明天9:00提醒。','remindAt');return;}
  draft[field]=parsed;
 });
 const names:Record<string,'plannedDate'|'dueAt'|'remindAt'|'eventAt'>={开始:'plannedDate',计划开始:'plannedDate',截止:'dueAt',提醒:'remindAt',事件:'eventAt'};
 scan(new RegExp(`(^|\\s)(计划开始|开始|截止|提醒|事件)[:：]?\\s*(${dateValue})(?=$|[\\s,，；;])`,'g'),(m,start,token)=>assignDate(start,token,names[m[2]],m[3]));
 scan(new RegExp(`(^|\\s)(${dateValue})前?(计划开始|开始|截止|提醒)(?=$|[\\s,，；;])`,'g'),(m,start,token)=>assignDate(start,token,names[m[3]],m[2]));
 scan(/(^|\s)(?:估计|预计)[:：]?\s*(\d+(?:\.\d+)?)\s*(分钟|小时|个番茄|番茄|分|m|h)(?=$|[\s,，；;])/g,(m,start,token)=>add(start,token,'estimateMinutes',()=>{
  if(draft.estimateMinutes!==null)issue('估计重复，请保留一个。','estimateMinutes');draft.estimateMinutes=Number(m[2])*(/小时|h/.test(m[3])?60:/番茄/.test(m[3])?25:1);
 }));
 if(draft.itemType==='event'){
  scan(new RegExp(`(^|\\s)(${dateValue})(?:[-–~至](${timeAtom}))?(?=$|[\\s,，；;])`,'g'),(m,start,token)=>add(start,token,'eventAt',()=>{
   if(draft.eventAt){issue('事件日期重复，请保留一个。','eventAt');return;}draft.eventAt=parseCaptureDate(m[2],now);
   if(!draft.eventAt){issue('事件日期无效。','eventAt');return;}
   if(m[3]){if(draft.eventAt.length===10){issue('事件时间段需要开始时刻。','eventAt');return;}draft.eventEnd=parseCaptureDate(`${localDate(draft.eventAt)} ${m[3]}`,now);if(!draft.eventEnd||draft.eventEnd<=draft.eventAt)issue('事件结束必须晚于开始；跨日事件可在预览中修改。','eventEnd');}
  }));
  if(!draft.eventAt)draft.eventAt=localDate(now);
 }
 draft.title=body.split('').filter((_,i)=>!occupied.has(i)).join('').replace(/\\([#%])/g,'$1').replace(/\s+/g,' ').trim().replace(/^[,，；;]+|[,，；;]+$/g,'').trim();
 const unparsed=draft.title.replace(/"[^"]*"|'[^']*'|“[^”]*”/g,'');
 if(draft.itemType==='task'&&new RegExp(dateAtom).test(unparsed))hints.push('正文中的日期保留为文字；加“开始 / 截止 / 提醒”可明确用途。');
 if(/(?:^|\s)(?:开始|计划开始|截止|提醒|估计|预计)[:：]/.test(unparsed))issue('有未识别的明确属性，请修正或用引号保留为文字。');
 return {draft,tokens,issues,errors:[...new Set([...issues.map(i=>i.message),...captureDraftErrors(draft)])],hints};
}

export function captureDestinations(state:JournalState,query:string){
 const index=outlineIndex(state),path=(id:string)=>outlinePath(index,id).map(n=>n.title).join('/');
 return index.ordered.filter(n=>outlinePath(index,n.id).every(a=>!(a.record as import('./types').Task).deletedAt&&!(a.record as import('./types').Task).archived&&(a.record as import('./types').Task).status==='open')).filter(n=>n.title===query||path(n.id)===query.replace(/\s*\/\s*/g,'/')).map(n=>({id:n.id,path:path(n.id)}));
}
