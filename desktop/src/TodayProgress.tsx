import React,{useState} from 'react';
import {dayProgress} from '../core/today';
import {periodEffort} from '../core/review';
import {useJournal,Button,minuteText} from './ui';

export function TodayProgress({date}:{date:string}){
 const {data,dialog}=useJournal(),[expanded,setExpanded]=useState(false),rows=dayProgress(data.state,date);
 const stats=periodEffort(data.state.sessions,date,date),completed=rows.filter(r=>r.completed).length;
 return <section className="today-progress" aria-label="今日进展"><div className="today-section-heading"><h2>推进了什么</h2><span className="muted">按事项汇总</span></div>
  <div className="today-progress-stats"><span>推进 <strong>{rows.filter(r=>r.task).length}</strong> 件</span><span>完成 <strong>{completed}</strong> 件</span><span title="各事项投入分别累计，包含并行记录">累计投入 <strong>{minuteText(stats.cumulativeMs)}</strong></span><span title="仅计算有起止时间的记录，并合并重叠时段">去重覆盖 <strong>{minuteText(stats.coveredMs)}</strong></span></div>
  {(expanded?rows:rows.slice(0,6)).map(row=><article className="today-progress-row" data-progress-id={row.task?.id??'unassigned'} key={row.task?.id??'unassigned'}>
   <span className={`progress-status ${row.completed?'done':''}`}>{row.completed?'已完成':row.lastSession?.status==='running'?'计时中':row.task?'已推进':'待归属'}</span>
   <div><button className="task-link" onClick={()=>dialog(row.task?{type:'detail',id:row.task.id}:{type:'assign',id:row.lastSession!.id})}>{row.task?.title??'待补充事项的投入'}</button><p>{row.summary|| (row.completed?'已完成，还没有记录成果。':'还没有写下这次的进展。')}</p></div><strong className="progress-duration">{minuteText(row.minutesMs)}</strong>
   <Button subtle disabled={!row.task&&row.lastSession?.status!=='ended'} onClick={()=>dialog(!row.task?{type:'assign',id:row.lastSession!.id}:row.lastSession?{type:'summary',id:row.lastSession.id}:{type:'review',id:row.task.id})}>{!row.task?'补充事项':row.summary?'编辑进展':'补充进展'}</Button>
  </article>)}
  {!rows.length&&<p className="muted">开始计时、补记投入或完成事项后，这里会汇总今天的推进。没有记录不表示没有推进。</p>}
  {rows.length>6&&<Button subtle onClick={()=>setExpanded(!expanded)}>{expanded?'收起进展':`查看全部 ${rows.length} 件`}</Button>}
 </section>;
}
