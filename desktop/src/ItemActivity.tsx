import React,{useMemo} from 'react';
import {useWorkspaceJournal} from './ui';
import {activityLabels} from '../core/activity';
const sourceLabels={user:'本人操作',ai:'AI 建议后确认',api:'API',sync:'同步',system:'系统'};
const fieldLabels:Record<string,string>={ownership:'责任安排',completionBy:'完成归属',status:'结束状态',title:'名称',dueAt:'截止时间',plannedDate:'计划开始',description:'说明',sessions:'投入',created:'创建'};
const value=(v:unknown)=>v===null||v===undefined?'未设置':typeof v==='object'?JSON.stringify(v,null,2):String(v);
export function ItemActivity({id}:{id:string}){const {data}=useWorkspaceJournal(),records=useMemo(()=>(data.state.activities??[]).filter(a=>a.changes.some(c=>c.entityId===id)).slice(-40).reverse(),[data.state.activities,id]);return <details className="inspector-history"><summary>活动历史 · {records.length}{records.length===40?'（最近）':''}</summary>{records.length?records.map(a=><article className="activity-row" key={a.id}><strong>{activityLabels[a.operation]??a.operation}</strong><small>{new Date(a.at).toLocaleString('zh-CN')} · {sourceLabels[a.source]}</small>{a.changes.filter(c=>c.entityId===id).map((c,i)=><details key={i}><summary>{fieldLabels[c.field]??c.field}</summary><pre>{value(c.before)} → {value(c.after)}</pre></details>)}</article>):<p className="muted">新版本启用后发生的活动会保存在这里；历史操作不补造。</p>}</details>;}
