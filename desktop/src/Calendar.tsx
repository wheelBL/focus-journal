import {useCalendarActions} from './CalendarActions';
import {CalendarTimeEntry} from './CalendarEntry';
import {sessionTitle} from '../core/session-label';
import React,{useState,useRef,useEffect,useMemo} from 'react';
import {WorkspaceContext} from './WorkspaceContext';
import {Add20Regular,Clock20Regular,ChevronLeft20Regular,ChevronRight20Regular,CalendarDay20Regular,CalendarWeekStart20Regular,CalendarMonth20Regular} from '@fluentui/react-icons';
import {useJournal,useWorkspaceJournal,Button,minuteText,timeText,dateLabel} from './ui';
import {localDate,shiftDate} from '../core/types';
import {reminderTime} from '../core/item-reminders';
import {calendarRange,calendarSessionDays,partition,type CalendarEntry} from './calendar-layout';
import {CalendarDayColumn} from './CalendarDayColumn';
import {readLocal,writeLocal} from './workspace-state';
import {useCalendarViewport} from './useCalendarViewport';
import './calendar-interactions.css';
import {calendarItemColors,calendarColorStyle,type CalendarColorBook} from './calendar-colors';
import './calendar-colors.css';
import './calendar-guide.css';

type Layer='effort'|'reminder'|'event';
export function Calendar(){
 const {data,date,setDate,dialog}=useJournal(),workspace=useWorkspaceJournal();
 const colorStorageKey=`journal.calendar.colors.${data.dataPath}`;
 const [colorBook,setColorBook]=useState(()=>readLocal<CalendarColorBook>(colorStorageKey,{}));
 const colors=useMemo(()=>calendarItemColors(data.state,colorBook),[data.revision,colorBook,data.dataPath]);
 useEffect(()=>{if(colors.changed){writeLocal(colorStorageKey,colors.book);setColorBook(colors.book);}},[colors,colorStorageKey]);
 const colorStyle=(id:string|null)=>calendarColorStyle(colors.color(id));
 const [mode,setMode]=useState<'day'|'week'|'month'>(()=>{const m=readLocal<string>('journal.calendar.mode','week');return m==='day'||m==='month'?m:'week';});
 const [hourHeight,setHourHeight]=useState(()=>{const value=readLocal('journal.calendar.scale',48);return [48,72,96].includes(value)?value:48;});
 const [layers,setLayers]=useState<Record<Layer,boolean>>(()=>{const saved=readLocal<Partial<Record<Layer,boolean>>>('journal.calendar.layers',{});return {effort:saved?.effort!==false,reminder:saved?.reminder!==false,event:saved?.event!==false};});
 const actions=useCalendarActions(),scrollRef=useRef<HTMLDivElement>(null);
 const viewport=useCalendarViewport(scrollRef,mode,hourHeight);
 const dates=useMemo(()=>{const weekday=(new Date(`${date}T12:00:00`).getDay()+6)%7,weekStart=shiftDate(date,-weekday);return mode==='day'?[date]:Array.from({length:7},(_,i)=>shiftDate(weekStart,i));},[date,mode]);
 const monthDates=useMemo(()=>{const start=date.slice(0,8)+'01',weekday=(new Date(`${start}T12:00:00`).getDay()+6)%7;return Array.from({length:42},(_,i)=>shiftDate(start,i-weekday));},[date]);
 const rangeDates=mode==='month'?monthDates:dates;
 // History, recurrence and completion counts stay stable between journal revisions.
 // Only active sessions are overlaid each second, so a ticking timer does not reparse years of history.
 const historical=useMemo(()=>calendarRange({...workspace.data.state,sessions:workspace.data.state.sessions.filter(s=>s.status==='ended')},rangeDates,(Object.keys(layers) as Layer[]).filter(k=>layers[k]),mode!=='month'),[workspace.data.state,rangeDates,layers,mode]);
 const activeSessions=useMemo(()=>data.state.sessions.filter(s=>s.status!=='ended'),[data.state.sessions]);
 const active=useMemo(()=>calendarSessionDays(activeSessions,rangeDates,mode!=='month'&&layers.effort),[activeSessions,rangeDates,mode,layers.effort]);
 const days=useMemo(()=>new Map(rangeDates.map(day=>{const past=historical.get(day)!,live=active.get(day)!;return [day,{...past,totalMs:past.totalMs+live.totalMs,unknown:[...past.unknown,...live.unknown],entries:mode==='month'?[]:partition<CalendarEntry>([...past.entries,...live.entries].map(entry=>({...entry})))}];})),[historical,active,rangeDates,mode]);
 const unknown=layers.effort?dates.flatMap(day=>days.get(day)?.unknown??[]):[];
 const events=rangeDates.flatMap(day=>days.get(day)!.events);
 useEffect(()=>writeLocal('journal.calendar.mode',mode),[mode]);
 useEffect(()=>writeLocal('journal.calendar.scale',hourHeight),[hourHeight]);
 useEffect(()=>writeLocal('journal.calendar.layers',layers),[layers]);
 const add=(day=date,time='09:00')=>{const start=`${day}T${time}`,end=new Date(new Date(start).getTime()+30*60000);dialog({type:'calendar',start,end:`${localDate(end)}T${String(end.getHours()).padStart(2,'0')}:${String(end.getMinutes()).padStart(2,'0')}`,calendarMode:'reminder'});};
 const range=(start:string,end:string,calendarMode?:'reminder'|'event'|'effort')=>dialog({type:'calendar',start,end,calendarMode});
 const navigate=(direction:number)=>{if(mode==='month'){const d=new Date(`${date}T12:00:00`);d.setDate(1);d.setMonth(d.getMonth()+direction);setDate(localDate(d));}else setDate(shiftDate(date,direction*(mode==='week'?7:1)));};
 const showNow=()=>{const now=new Date(data.now);setDate(localDate(now));if(mode==='month')setMode('day');viewport.jumpToHour(Math.max(0,now.getHours()+now.getMinutes()/60-1),mode==='month'?'day':mode);};
 const slots={gridTemplateColumns:`52px repeat(${dates.length},minmax(0,1fr))`};
 const compact=mode==='month'?[]:dates.flatMap(day=>days.get(day)!.entries.filter(e=>e.height*hourHeight/48<18).map(entry=>({day,entry})));
 return <section className="page calendar-page">
  <WorkspaceContext><h2 className="context-heading">日历视图</h2><nav className="context-nav" aria-label="日历视图">{([['day','日视图',CalendarDay20Regular],['week','周视图',CalendarWeekStart20Regular],['month','月视图',CalendarMonth20Regular]] as const).map(([id,label,Icon])=><button key={id} className={mode===id?'selected':''} onClick={()=>setMode(id)}><Icon/><span>{label}</span></button>)}</nav><div className="context-section"><button className="context-link" onClick={()=>setDate(localDate(data.now))}>回到今天</button></div></WorkspaceContext>
  <header className="page-header"><div><h1>投入日历</h1></div><div className="actions"><Button onClick={()=>add()}><Add20Regular/>添加提醒</Button><Button onClick={()=>range(`${date}T09:00`,`${date}T09:30`,'effort')}><Clock20Regular/>补记时间</Button>{data.state.deletedSessions.length>0&&<Button onClick={actions.openTrash}>已删除投入 ({data.state.deletedSessions.length})</Button>}</div></header>
  <div className="calendar-toolbar"><div className="date-nav"><Button subtle aria-label={mode==='month'?'上个月':'前一天或上一周期'} onClick={()=>navigate(-1)}><ChevronLeft20Regular/></Button>{mode==='month'?<strong>{date.slice(0,4)} 年 {Number(date.slice(5,7))} 月</strong>:<input type="date" aria-label="查看日期" value={date} onChange={e=>e.target.value&&setDate(e.target.value)}/>}<Button subtle aria-label={mode==='month'?'下个月':'后一天或下一周期'} onClick={()=>navigate(1)}><ChevronRight20Regular/></Button>{date!==localDate(data.now)&&<Button subtle onClick={()=>setDate(localDate(data.now))}>今天</Button>}</div>
   <div className="calendar-display-options" aria-label="显示内容"><Button subtle aria-label="定位当前时刻" title="回到今天并定位当前时间" onClick={showNow}>现在</Button>{([['effort','实际投入'],['reminder','事项提醒'],['event','事件']] as const).map(([id,label])=><button key={id} type="button" aria-label={`显示${label}`} aria-pressed={layers[id]} onClick={()=>setLayers(v=>({...v,[id]:!v[id]}))}>{layers[id]?'✓ ':''}{label}</button>)}{mode!=='month'&&<label>刻度<select aria-label="时间刻度" value={hourHeight} onChange={e=>setHourHeight(Number(e.target.value))}><option value={48}>紧凑</option><option value={72}>标准</option><option value={96}>宽松</option></select></label>}</div>
   <div className="segmented">{([['day','日'],['week','周'],['month','月']] as const).map(([v,label])=><button key={v} className={mode===v?'active':''} onClick={()=>setMode(v)}>{label}</button>)}</div></div>
  {mode==='month'?<div className="month-view"><div className="month-weekdays">{['一','二','三','四','五','六','日'].map(d=><span key={d}>周{d}</span>)}</div><div className="month-grid">{monthDates.map(d=>{
   const {totalMs:ms,done,reminders:items,events:dayEvents}=days.get(d)!;
   return <div key={d} className={`month-cell ${d.slice(0,7)!==date.slice(0,7)?'other-month':''} ${d===localDate(data.now)?'today-cell':''}`} tabIndex={0} aria-label={`${d}，双击添加提醒`} onDoubleClick={e=>{if(!(e.target as HTMLElement).closest('button'))add(d);}} onContextMenu={e=>{if((e.target as HTMLElement).closest('button'))return;e.preventDefault();range(`${d}T09:00`,`${d}T09:30`);}} onKeyDown={e=>{if(e.target===e.currentTarget&&e.key==='Enter'){e.preventDefault();add(d);}}}>
    <button className="month-day" aria-label={`查看 ${d} 的投入`} onClick={()=>{setDate(d);setMode('day');}}>{Number(d.slice(8))}</button>{layers.effort&&ms>0&&<strong>{minuteText(ms)}</strong>}{done>0&&<small>完成 {done} 件事</small>}
    {dayEvents.map(t=><button className="month-reminder calendar-scheduled-event calendar-item-color" style={colorStyle(t.id)} data-item-id={t.id} key={`${t.id}-${t.eventAt}`} {...actions.entryProps('event',t.id)} onClick={()=>dialog({type:'detail',id:t.id})}>{t.recurrence?'↻ ':''}{t.eventAt!.length===10?'事件':timeText(t.eventAt!)} · {t.title}</button>)}{items.map(t=><button className="month-reminder calendar-item-color" style={colorStyle(t.id)} data-item-id={t.id} key={t.id} {...actions.entryProps('reminder',t.id)} title={`${timeText(reminderTime(t)!)} 提醒 ${t.title}`} onClick={()=>dialog({type:'detail',id:t.id})}>{timeText(reminderTime(t)!)} · {t.title}</button>)}</div>;
  })}</div></div>:<>
   <div className="calendar-head" style={slots}><span/>{dates.map(d=><button key={d} className={d===localDate(data.now)?'today':''} onClick={()=>{setDate(d);setMode('day');}}><span>{dateLabel(d)}</span><strong>{minuteText(days.get(d)!.totalMs)}</strong></button>)}</div>
   <div className="calendar-all-day">{events.filter(t=>t.eventAt?.length===10&&dates.includes(t.eventAt)).map(t=><button key={`${t.id}-${t.eventAt}`} className="calendar-item-color calendar-scheduled-event" style={colorStyle(t.id)} data-item-id={t.id} {...actions.entryProps('event',t.id)} onClick={()=>dialog({type:'detail',id:t.id})}>{t.recurrence?'↻ ':''}{t.eventAt} · {t.title}</button>)}</div>
   {compact.length>0&&<details className="calendar-compact-list"><summary>短记录与提醒（{compact.length}）<span> · 展开查看名称和精确时间</span></summary><div>{compact.map(({day,entry})=><CalendarTimeEntry key={`${day}-${entry.kind}-${entry.kind==='effort'?`${entry.session.id}-${entry.index}`:`${entry.task.id}-${entry.at}`}`} entry={entry} date={day} compact hourHeight={hourHeight} colorStyle={colorStyle} actions={actions}/>)}</div></details>}
   <div ref={scrollRef} className="calendar-scroll" onScroll={viewport.onScroll}><div className="calendar-hours" style={slots}><div className="hour-labels" style={{height:24*hourHeight}}>{Array.from({length:24},(_,i)=><span key={i} style={{top:i*hourHeight}}>{String(i).padStart(2,'0')}:00</span>)}</div>{dates.map(d=><CalendarDayColumn key={d} day={d} hourHeight={hourHeight} now={data.now} onRange={range} onReminder={remindAt=>add(remindAt.slice(0,10),remindAt.slice(11))}>
    {days.get(d)!.entries.map(entry=><CalendarTimeEntry key={entry.kind==='effort'?`${entry.session.id}-${entry.index}`:`${entry.kind}-${entry.task.id}-${entry.at}`} entry={entry} hourHeight={hourHeight} colorStyle={colorStyle} actions={actions}/>)}</CalendarDayColumn>)}</div></div>
   {unknown.length>0&&<div className="untimed"><strong>时间未指定</strong>{unknown.map(s=><button key={s.id} className="calendar-item-color" data-item-id={s.taskId??undefined} style={colorStyle(s.taskId)} {...actions.entryProps('effort',s.id)} onClick={()=>actions.showRecord(s.id)}>{s.date.slice(5)} · {sessionTitle(data.state,s.taskId)} · {minuteText(s.durationMs)}</button>)}</div>}
  </>}
  <footer className="calendar-guide"><p className="calendar-legend" aria-label="日历图例"><span>实色 · 实际投入</span><span>虚线 · 提醒</span><span>○ · 事件</span></p><details><summary>日历操作说明</summary><div><p>拖选时段，添加提醒、事件或补记投入。右键空白处或选中空白列后按 Enter 也可添加；双击快速添加提醒。</p><p>同一事项使用同一颜色。时间块按真实时长显示；短记录以细线呈现，可在“短记录与提醒”中查看和操作。右键记录可删除。</p><p>仅真实重叠的时段并排显示，并行投入分别累计。</p></div></details></footer>
  {actions.overlays}
 </section>;
}
