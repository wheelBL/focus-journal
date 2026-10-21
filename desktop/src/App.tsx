import {BreakBar} from './BreakBar';
import {JournalClock} from './JournalClock';
import {readLocal,writeLocal} from './workspace-state';
import {reviewQueue} from '../core/item-reviews';
import React,{useState,useEffect,useRef,useCallback} from 'react';
import {Timer20Regular,Home24Regular,Folder24Regular,CalendarLtr24Regular,ClipboardTask24Regular,Settings24Regular,Search20Regular,CheckmarkCircle24Filled,PanelLeft20Regular,Subtract20Regular,Square20Regular,Dismiss20Regular} from '@fluentui/react-icons';
import {api,isDesktop} from './api';
import {AppContext,Button,useJournal,type DialogSpec} from './ui';
import {localDate,type Snapshot,type Command} from '../core/types';
import {Today,Calendar,Review,Settings,SearchResults} from './views';
import {Projects} from './Projects';
import Dialogs from './dialogs';
import {TimerDock} from './TimerDock';
import {SyncShortcut} from './SyncSettings';
import {DateContext,SettingsContext,SearchContext} from './WorkspaceContext';

// Built-in modules are composed here. Views depend on the service API, never on each other.
export const modules=[
 {id:'today',name:'今日',icon:Timer20Regular,Home24Regular,View:Today},
 {id:'projects',name:'事项',icon:Folder24Regular,View:Projects},
 {id:'calendar',name:'日历',icon:CalendarLtr24Regular,View:Calendar},
 {id:'review',name:'回顾',icon:ClipboardTask24Regular,View:Review},
 {id:'settings',name:'设置',icon:Settings24Regular,View:Settings}
];
export default function App(){
 const treePrototype=new URLSearchParams(window.location.search).get('prototype')==='tree';
 const [sidebarOpen,setSidebarOpen]=useState(false);
 const [data,setData]=useState<Snapshot|null>(null),[view,setView]=useState(()=>{const saved=readLocal('journal.location',{view:'today',date:localDate()});return treePrototype?'projects':modules.some(m=>m.id===saved.view)?saved.view:'today';}),[date,setDate]=useState(()=>{const saved=readLocal('journal.location',{view:'today',date:localDate()});return /^\d{4}-\d{2}-\d{2}$/.test(saved.date)?saved.date:localDate();}),[dialog,setDialog]=useState<DialogSpec|null>(null),[query,setQuery]=useState(''),[toast,setToast]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const dataRef=useRef(data),seq=useRef(0),busyRef=useRef(false),searchRef=useRef<HTMLInputElement>(null),toastTimer=useRef<ReturnType<typeof setTimeout>|null>(null);
 dataRef.current=data;
 const notify=useCallback((text:string)=>{setToast(text);if(toastTimer.current)clearTimeout(toastTimer.current);toastTimer.current=setTimeout(()=>setToast(''),6000);},[]);
 const refresh=useCallback(async()=>{if(busyRef.current)return;const n=++seq.current;try{const result=await api.snapshot();if(n===seq.current){if(!dataRef.current&&!readLocal('journal.location',null))setDate(localDate(result.now));setData(result);setError('');}}catch(e){setError(e instanceof Error?e.message:String(e));}},[]);
 useEffect(()=>{void refresh();const off=api.onChanged?.(()=>void refresh());return()=>off?.();},[refresh]);
 useEffect(()=>{if(data)writeLocal('journal.location',{view,date});},[view,date,!!data]);
 useEffect(()=>()=>{if(toastTimer.current)clearTimeout(toastTimer.current);},[]);
 useEffect(()=>{const key=(e:KeyboardEvent)=>{if(e.ctrlKey&&(e.code==='Slash'||e.key==='/')&&!dialog){e.preventDefault();setDialog({type:'shortcuts'});return;}if(e.ctrlKey&&e.key.toLowerCase()==='k'){e.preventDefault();searchRef.current?.focus();}if(e.ctrlKey&&e.key.toLowerCase()==='n'&&!dialog){e.preventDefault();if(view==='projects')window.dispatchEvent(new Event('journal:new-item'));else setDialog({type:'task'});}};window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key);},[dialog,view]);
 useEffect(()=>api.onOpenSession?.(id=>{void refresh().then(()=>setDialog({type:'summary',id}));}),[refresh]);
 useEffect(()=>api.onOpenItem?.(id=>setDialog({type:'detail',id})),[]);
 const run=useCallback(async(command:Command)=>{if(busyRef.current)throw new Error('正在保存，请稍候。');busyRef.current=true;setBusy(true);++seq.current;try{const result=await api.command(command);setData(result);if(result.focusReminder)notify(result.focusReminder);if(result.itemNotice)notify(result.itemNotice);return result;}catch(e){notify(e instanceof Error?e.message:String(e));throw e;}finally{busyRef.current=false;setBusy(false);}},[notify]);
 const navigate=useCallback((id:string)=>{setQuery('');setView(id);setSidebarOpen(false);},[]);
 const context=React.useMemo(()=>data?{data,run,dialog:setDialog,notify,busy,date,setDate,navigate}:null,[data,run,notify,busy,date,navigate]);
 const Current=modules.find(m=>m.id===view)!.View;
 return <div className={`application workbench ${sidebarOpen?'sidebar-open':''}`}>
  <header className={`titlebar ${isDesktop?'native-titlebar':''}`}><div className="brand"><CheckmarkCircle24Filled/><span>专注记</span></div><button className="sidebar-toggle" aria-label="显示或收起侧栏" aria-expanded={sidebarOpen} onClick={()=>setSidebarOpen(v=>!v)}><PanelLeft20Regular/></button><nav className="top-navigation" aria-label="主导航">{modules.filter(m=>m.id!=='settings').map(m=><button key={m.id} aria-label={m.name} title={m.name} className={view===m.id&&!query?'nav-item selected':'nav-item'} aria-current={view===m.id&&!query?'page':undefined} onClick={()=>navigate(m.id)}><m.icon/><span>{m.name}</span>{m.id==='review'&&data&&reviewQueue(data.state,localDate(data.now)).length>0&&<small className="nav-count">{reviewQueue(data.state,localDate(data.now)).length}</small>}</button>)}</nav><label className="search-box top-search"><Search20Regular/><input ref={searchRef} value={query} onChange={e=>setQuery(e.target.value)} placeholder="搜索 · Ctrl K" aria-label="搜索任务和笔记"/>{query&&<button aria-label="关闭搜索" onClick={()=>setQuery('')}><Dismiss20Regular/></button>}</label><Button className="quick-timer-start" disabled={!data||busy} title="立即开始计时，结束后再补充事项" onClick={()=>void run({type:'focus.start-unassigned'}).then(result=>{setDate(localDate(result.now));navigate('today');}).catch(()=>{})}><Timer20Regular/><span>先计时</span></Button>{data?.demo&&<span className="demo-badge">测试工作区</span>}{!isDesktop&&<div className="window-controls"><button aria-label="最小化" onClick={()=>void api.windowAction('minimize')}><Subtract20Regular/></button><button aria-label="最大化" onClick={()=>void api.windowAction('maximize')}><Square20Regular/></button><button aria-label="关闭窗口" onClick={()=>void api.windowAction('close')}><Dismiss20Regular/></button></div>}</header>
  <div id="rest-workspace"/><div className="shell"><aside className="sidebar" aria-label="工作区侧栏"><div className="sidebar-content"><div id="workspace-sidebar"/>{query?<SearchContext query={query}/>:view==='today'?<DateContext date={date} today={localDate(data?.now)} setDate={setDate}/>:view==='settings'?<SettingsContext/>:null}</div><div className="sidebar-bottom"><SyncShortcut open={()=>navigate('settings')} notify={notify}/><button aria-label="设置" title="设置" className={view==='settings'?'nav-item selected':'nav-item'} onClick={()=>navigate('settings')}><Settings24Regular/><span>设置</span></button></div></aside>{sidebarOpen&&<button className="sidebar-backdrop" aria-label="收起侧栏" onClick={()=>setSidebarOpen(false)}/>}
   <main className="main" id="main-content">{error&&<div className="error-banner" role="alert">{error}<Button onClick={()=>void refresh()}>重试</Button></div>}{data?<AppContext.Provider value={context!}><JournalClock data={data} refresh={refresh}><BreakBar/>{query?<SearchResults query={query}/>:<Current/>}{dialog&&<Dialogs key={`${dialog.type}-${dialog.id??'new'}`} spec={dialog}/>}{(view!=='today'||date!==localDate(data.now)||query)&&<LiveDock/>}</JournalClock></AppContext.Provider>:!error&&<div className="loading">正在打开工作日志…</div>}</main>
  </div>


  {toast&&<div className="toast" role="status">{toast}<button aria-label="关闭提示" onClick={()=>setToast('')}><Dismiss20Regular/></button></div>}
 </div>;
}

function LiveDock(){const {data,busy,run,setDate,navigate,dialog}=useJournal();return data.timers.length?<TimerDock data={data} busy={busy} run={run} onOpen={taskId=>{if(taskId===null){setDate(localDate(data.now));navigate('today');return;}void run({type:'task.select',payload:{id:taskId}}).then(()=>{setDate(localDate(data.now));navigate('today');}).catch(()=>{});}} onSummary={id=>dialog({type:'summary',id})}/>:null;}
