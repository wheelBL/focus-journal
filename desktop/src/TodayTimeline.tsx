import React from 'react';
import {ChevronLeft20Regular,ChevronRight20Regular,Circle20Filled,CheckmarkCircle20Filled} from '@fluentui/react-icons';
import {localDate,shiftDate,type Session} from '../core/types';
import {sessionTitle} from '../core/session-label';
import {useJournal,Button,timeText,minuteText} from './ui';
export function DateNav({step=1}:{step?:number}){const {date,setDate,data}=useJournal();return <div className="date-nav"><Button subtle aria-label="前一天或上一周期" onClick={()=>setDate(shiftDate(date,-step))}><ChevronLeft20Regular/></Button><input type="date" aria-label="查看日期" value={date} onChange={e=>e.target.value&&setDate(e.target.value)}/><Button subtle aria-label="后一天或下一周期" onClick={()=>setDate(shiftDate(date,step))}><ChevronRight20Regular/></Button>{date!==localDate(data.now)&&<Button subtle onClick={()=>setDate(localDate(data.now))}>今天</Button>}</div>;}
export function JournalRow({time,children,active=false}:{time:string;children:React.ReactNode;active?:boolean}){return <div className={`journal-row ${active?'active-entry':''}`}><div className="time-gutter"><span>{time}</span><Circle20Filled/></div><div className="entry-body">{children}</div></div>;}

export function SessionRow({session}:{session:Session}){
 const {data,dialog}=useJournal();const task=data.state.tasks.find(t=>t.id===session.taskId);
 return <article className="session-entry"><div className="session-heading"><CheckmarkCircle20Filled/><button className="task-link" onClick={()=>dialog(task?{type:'detail',id:task.id}:{type:'assign',id:session.id})}>{sessionTitle(data.state,session.taskId)}</button><span className="muted">{!task?'待补充事项':session.manual?'手动记录':task.status==='done'?'已完成':task.status==='cancelled'?'已取消 · 投入保留':'已记录 · 继续进行'}</span></div><div className="session-meta">{session.start?`${timeText(session.start)}–${timeText(session.end)}${localDate(session.start)!==localDate(session.end??session.start)?' · 跨日':''}`:'具体时间未指定'}<strong>{minuteText(session.durationMs)}</strong>{session.segments.length>1&&<span>已扣除暂停</span>}<Button subtle onClick={()=>dialog({type:task?'manual':'assign',id:session.id})}>{task?'校正':'补充事项'}</Button></div>{session.summary?<p className="session-summary">{session.summary}</p>:<button className="text-button muted" onClick={()=>dialog({type:'summary',id:session.id})}>补充本次推进了什么</button>}</article>;
}
