import {useCalendarActions} from './CalendarActions';
import {CalendarTimeEntry} from './CalendarEntry';
import {sessionTitle} from '../core/session-label';
import React,{useState,useRef,useEffect,useMemo} from 'react';
import {recurringEvents} from '../core/recurrence';
import {WorkspaceContext} from './WorkspaceContext';
import {Add20Regular,Clock20Regular,ChevronLeft20Regular,ChevronRight20Regular,CalendarDay20Regular,CalendarWeekStart20Regular,CalendarMonth20Regular} from '@fluentui/react-icons';
import {useJournal,Button,minuteText,timeText,dateLabel} from './ui';
import {localDate,shiftDate,sessionMsOnDate} from '../core/types';
import {scheduledItems,reminderTime} from '../core/item-reminders';
import {calendarEntries} from './calendar-layout';
import {CalendarDayColumn} from './CalendarDayColumn';
import {readLocal,writeLocal} from './workspace-state';
import './calendar-interactions.css';
import {calendarItemColors,calendarColorStyle,type CalendarColorBook} from './calendar-colors';
import './calendar-colors.css';

type Layer='effort'|'reminder'|'event';
export function Calendar(){
 const {data,date,setDate,dialog}=useJournal();
 const colorStorageKey=`journal.calendar.colors.${data.dataPath}`;
 const [colorBook,setColorBook]=useState(()=>readLocal<CalendarColorBook>(colorStorageKey,{}));
 const colors=useMemo(()=>calendarItemColors(data.state,colorBook),[data.revision,colorBook,data.dataPath]);
 useEffect(()=>{if(colors.changed){writeLocal(colorStorageKey,colors.book);setColorBook(colors.book);}},[colors,colorStorageKey]);
 const colorStyle=(id:string|null)=>calendarColorStyle(colors.color(id));
 const [mode,setMode]=useState<'day'|'week'|'month'>(()=>{const m=readLocal<string>('journal.calendar.mode','week');return m==='day'||m==='month'?m:'week';});
 const [hourHeight,setHourHeight]=useState(()=>{const value=readLocal('journal.calendar.scale',48);return [48,72,96].includes(value)?value:48;});
 const [layers,setLayers]=useState<Record<Layer,boolean>>(()=>{const saved=readLocal<Partial<Record<Layer,boolean>>>('journal.calendar.layers',{});return {effort:saved?.effort!==false,reminder:saved?.reminder!==false,event:saved?.event!==false};});
 const actions=useCalendarActions(),scrollRef=useRef<HTMLDivElement>(null),oldScale=useRef(hourHeight);
 const weekday=(new Date(`${date}T12:00:00`).getDay()+6)%7,weekStart=shiftDate(date,-weekday),dates=mode==='day'?[date]:Array.from({length:7},(_,i)=>shiftDate(weekStart,i));
 const monthStart=date.slice(0,8)+'01',monthWeekday=(new Date(`${monthStart}T12:00:00`).getDay()+6)%7,monthDates=Array.from({length:42},(_,i)=>shiftDate(monthStart,i-monthWeekday));
 const unknown=layers.effort?data.state.sessions.filter(s=>!s.segments.length&&dates.includes(s.date)):[],reminders=layers.reminder?scheduledItems(data.state):[],events=layers.event?recurringEvents(data.state.tasks,mode==='month'?monthDates[0]:dates[0],mode==='month'?monthDates.at(-1)!:dates.at(-1)!):[];
 useEffect(()=>{writeLocal('journal.calendar.mode',mode);if(scrollRef.current)scrollRef.current.scrollTop=7*hourHeight;},[mode]);
 useEffect(()=>{writeLocal('journal.calendar.scale',hourHeight);if(scrollRef.current)scrollRef.current.scrollTop=scrollRef.current.scrollTop*hourHeight/oldScale.current;oldScale.current=hourHeight;},[hourHeight]);
 useEffect(()=>writeLocal('journal.calendar.layers',layers),[layers]);
 const add=(day=date,time='09:00')=>dialog({type:'task',remindAt:`${day}T${time}`});
 const range=(start:string,end:string,calendarMode?:'reminder'|'event'|'effort')=>dialog({type:'calendar',start,end,calendarMode});
 const navigate=(direction:number)=>{if(mode==='month'){const d=new Date(`${date}T12:00:00`);d.setDate(1);d.setMonth(d.getMonth()+direction);setDate(localDate(d));}else setDate(shiftDate(date,direction*(mode==='week'?7:1)));};
 const slots={gridTemplateColumns:`52px repeat(${dates.length},minmax(0,1fr))`},activeLayers=(Object.keys(layers) as Layer[]).filter(k=>layers[k]);
 const entries=dates.map(day=>({day,entries:calendarEntries(data.state,day,activeLayers)}));
 const compact=entries.flatMap(({day,entries})=>entries.filter(e=>e.height*hourHeight/48<18).map(entry=>({day,entry})));
 return <section className="page calendar-page">
  <WorkspaceContext><h2 className="context-heading">日历视图</h2><nav className="context-nav" aria-label="日历视图">{([['day','日视图',CalendarDay20Regular],['week','周视图',CalendarWeekStart20Regular],['month','月视图',CalendarMonth20Regular]] as const).map(([id,label,Icon])=><button key={id} className={mode===id?'selected':''} onClick={()=>setMode(id)}><Icon/><span>{label}</span></button>)}</nav><div className="context-section"><button className="context-link" onClick={()=>setDate(localDate(data.now))}>回到今天</button><p className="context-help">拖选时段，安排或补记。<br/>右键打开操作，双击快速提醒。<br/>选中空白列后按 Enter 也可添加。</p></div></WorkspaceContext>
  <header className="page-header"><div><p className="eyebrow">安排提醒，看见时间去了哪里</p><h1>投入日历</h1></div><div className="actions"><Button onClick={()=>add()}><Add20Regular/>添加提醒</Button><Button onClick={()=>range(`${date}T09:00`,`${date}T09:30`,'effort')}><Clock20Regular/>补记时间</Button><Button onClick={actions.openTrash}>已删除投入{data.state.deletedSessions.length?` (${data.state.deletedSessions.length})`:""}</Button></div></header>
  <div className="calendar-toolbar"><div className="date-nav"><Button subtle aria-label={mode==='month'?'上个月':'前一天或上一周期'} onClick={()=>navigate(-1)}><ChevronLeft20Regular/></Button>{mode==='month'?<strong>{date.slice(0,4)} 年 {Number(date.slice(5,7))} 月</strong>:<input type="date" aria-label="查看日期" value={date} onChange={e=>e.target.value&&setDate(e.target.value)}/>}<Button subtle aria-label={mode==='month'?'下个月':'后一天或下一周期'} onClick={()=>navigate(1)}><ChevronRight20Regular/></Button>{date!==localDate(data.now)&&<Button subtle onClick={()=>setDate(localDate(data.now))}>今天</Button>}</div>
   <div className="calendar-display-options" aria-label="显示内容">{([['effort','实际投入'],['reminder','事项提醒'],['event','事件']] as const).map(([id,label])=><button key={id} type="button" aria-label={`显示${label}`} aria-pressed={layers[id]} onClick={()=>setLayers(v=>({...v,[id]:!v[id]}))}>{layers[id]?'✓ ':''}{label}</button>)}{mode!=='month'&&<label>刻度<select aria-label="时间刻度" value={hourHeight} onChange={e=>setHourHeight(Number(e.target.value))}><option value={48}>紧凑</option><option value={72}>标准</option><option value={96}>宽松</option></select></label>}</div>
   <div className="segmented">{([['day','日'],['week','周'],['month','月']] as const).map(([v,label])=><button key={v} className={mode===v?'active':''} onClick={()=>setMode(v)}>{label}</button>)}</div></div>
  {mode==='month'?<div className="month-view"><div className="month-weekdays">{['一','二','三','四','五','六','日'].map(d=><span key={d}>周{d}</span>)}</div><div className="month-grid">{monthDates.map(d=>{
   const ms=data.state.sessions.reduce((n,s)=>n+sessionMsOnDate(s,d),0),done=data.state.tasks.filter(t=>t.completedAt&&localDate(t.completedAt)===d).length,items=reminders.filter(t=>localDate(reminderTime(t)!)===d);
   return <div key={d} className={`month-cell ${d.slice(0,7)!==date.slice(0,7)?'other-month':''} ${d===localDate(data.now)?'today-cell':''}`} tabIndex={0} aria-label={`${d}，双击添加提醒`} onDoubleClick={e=>{if(!(e.target as HTMLElement).closest('button'))add(d);}} onContextMenu={e=>{if((e.target as HTMLElement).closest('button'))return;e.preventDefault();range(`${d}T09:00`,`${d}T09:30`);}} onKeyDown={e=>{if(e.target===e.currentTarget&&e.key==='Enter'){e.preventDefault();add(d);}}}>
    <button className="month-day" aria-label={`查看 ${d} 的投入`} onClick={()=>{setDate(d);setMode('day');}}>{Number(d.slice(8))}</button>{layers.effort&&ms>0&&<strong>{minuteText(ms)}</strong>}{done>0&&<small>完成 {done} 件事</small>}
    {events.filter(t=>(t.eventAt!.length===10?t.eventAt:localDate(t.eventAt!))===d).map(t=><button className="month-reminder calendar-scheduled-event calendar-item-color" style={colorStyle(t.id)} data-item-id={t.id} key={`${t.id}-${t.eventAt}`} {...actions.entryProps('event',t.id)} onClick={()=>dialog({type:'detail',id:t.id})}>{t.recurrence?'↻ ':''}{t.eventAt!.length===10?'事件':timeText(t.eventAt!)} · {t.title}</button>)}{items.map(t=><button className="month-reminder calendar-item-color" style={colorStyle(t.id)} data-item-id={t.id} key={t.id} {...actions.entryProps('reminder',t.id)} title={`${timeText(reminderTime(t)!)} 提醒 ${t.title}`} onClick={()=>dialog({type:'detail',id:t.id})}>{timeText(reminderTime(t)!)} · {t.title}</button>)}</div>;
  })}</div></div>:<>
   <div className="calendar-head" style={slots}><span/>{dates.map(d=><button key={d} className={d===localDate(data.now)?'today':''} onClick={()=>{setDate(d);setMode('day');}}><span>{dateLabel(d)}</span><strong>{minuteText(data.state.sessions.reduce((n,s)=>n+sessionMsOnDate(s,d),0))}</strong></button>)}</div>
   <div className="calendar-all-day">{events.filter(t=>t.eventAt?.length===10&&dates.includes(t.eventAt)).map(t=><button key={`${t.id}-${t.eventAt}`} className="calendar-item-color calendar-scheduled-event" style={colorStyle(t.id)} data-item-id={t.id} {...actions.entryProps('event',t.id)} onClick={()=>dialog({type:'detail',id:t.id})}>{t.recurrence?'↻ ':''}{t.eventAt} · {t.title}</button>)}</div>
   {compact.length>0&&<details className="calendar-compact-list"><summary>短记录与提醒（{compact.length}）<span> · 展开查看名称和精确时间</span></summary><div>{compact.map(({day,entry})=><CalendarTimeEntry key={`${day}-${entry.kind}-${entry.kind==='effort'?`${entry.session.id}-${entry.index}`:`${entry.task.id}-${entry.at}`}`} entry={entry} date={day} compact hourHeight={hourHeight} colorStyle={colorStyle} actions={actions}/>)}</div></details>}
   <div ref={scrollRef} className="calendar-scroll"><div className="calendar-hours" style={slots}><div className="hour-labels" style={{height:24*hourHeight}}>{Array.from({length:24},(_,i)=><span key={i} style={{top:i*hourHeight}}>{String(i).padStart(2,'0')}:00</span>)}</div>{dates.map(d=><CalendarDayColumn key={d} day={d} hourHeight={hourHeight} now={data.now} onRange={range} onReminder={remindAt=>dialog({type:'task',remindAt})}>
    {entries.find(e=>e.day===d)!.entries.map(entry=><CalendarTimeEntry key={entry.kind==='effort'?`${entry.session.id}-${entry.index}`:`${entry.kind}-${entry.task.id}-${entry.at}`} entry={entry} hourHeight={hourHeight} colorStyle={colorStyle} actions={actions}/>)}</CalendarDayColumn>)}</div></div>
   {unknown.length>0&&<div className="untimed"><strong>时间未指定</strong>{unknown.map(s=><button key={s.id} className="calendar-item-color" data-item-id={s.taskId??undefined} style={colorStyle(s.taskId)} {...actions.entryProps('effort',s.id)} onClick={()=>actions.showRecord(s.id)}>{s.date.slice(5)} · {sessionTitle(data.state,s.taskId)} · {minuteText(s.durationMs)}</button>)}</div>}
  </>}
  <p className="calendar-caption">拖选时段：提醒、事件或补记投入 · 右键 / Enter 也可添加 · 双击快速提醒。同一事项使用同一颜色；实色为实际投入，虚线为提醒，○ 为事件。时间块按真实时长显示；短记录以细线呈现，可在“短记录与提醒”中操作。右键记录可删除，仅真实重叠的时段并排显示，并行投入分别累计。</p>
  {actions.overlays}
 </section>;
}
