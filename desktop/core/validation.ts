import {localDate} from './types';
import {isDateDeadline,deadlineTime} from './deadlines';
export const text=(v:unknown,max=2000)=>{if(typeof v!=='string')throw new Error('请输入文字。');if(v.length>max)throw new Error(`内容不能超过 ${max} 字。`);return v.trim();};
export const required=(v:unknown,max=120)=>{const s=text(v,max);if(!s)throw new Error('请填写名称。');return s;};
export const number=(v:unknown,min=1,max=1440)=>{if(typeof v!=='number'||!Number.isFinite(v)||v<min||v>max)throw new Error(`请输入 ${min}–${max} 之间的数值。`);return v;};
export const day=(v:unknown)=>{const s=required(v,10);if(!/^\d{4}-\d{2}-\d{2}$/.test(s)||localDate(`${s}T12:00:00`)!==s)throw new Error('日期无效。');return s;};
export const instant=(v:unknown)=>{const s=required(v,40);if(!Number.isFinite(Date.parse(s)))throw new Error('时间无效。');return new Date(s).toISOString();};
export const deadline=(v:unknown)=>typeof v==='string'&&isDateDeadline(v)?day(v):instant(v);
export function validateSchedule(task:{plannedDate:string|null;dueAt?:string|null}){if(task.plannedDate&&task.dueAt&&deadlineTime(task.dueAt)<Date.parse(`${task.plannedDate}T00:00:00`))throw new Error('截止时间不能早于计划开始日期。');}
