import {primaryModifier,shortcutLabel} from './platform';
import {recordOperation,operationEntry} from './operation-entry';
import {BreakBar} from './BreakBar';
import {AppearanceQuickSwitch} from './AppearanceSettings';
import {useEnterMotion} from './motion';
import {JournalClock} from './JournalClock';
import {readLocal,writeLocal} from './workspace-state';
import {restoreLocation,validWorkspaceDate} from './workspace-location';
import {clearSettingsSection,requestSettingsSection} from './settings-navigation';
import {reviewQueue} from '../core/item-reviews';
import React,{useState,useEffect,useLayoutEffect,useRef,useCallback} from 'react';
import './search-continuity.css';
import {Timer20Regular,Settings24Regular,Search20Regular,CheckmarkCircle24Filled,Sparkle20Regular,PanelLeft20Regular,Subtract20Regular,Square20Regular,Dismiss20Regular} from '@fluentui/react-icons';
import {api,isDesktop} from './api';
import {AppContext,Button,useJournal,type DialogSpec} from './ui';
import {localDate,type Snapshot,type Command} from '../core/types';
import {modules,SearchResults} from './module-registry';
import {DeferredDialogs as Dialogs} from './DeferredDialogs';
import {TimerDock} from './TimerDock';
import {SyncShortcut} from './SyncSettings';
import {DateContext,SettingsContext,SearchContext} from './WorkspaceContext';

export {modules} from './module-registry';
export default function App(){
 const treePrototype=new URLSearchParams(window.location.search).get('prototype')==='tree';
 const [sidebarOpen,setSidebarOpen]=useState(false);
 const [locationRevision,setLocationRevision]=useState(0);
 const [initialLocation]=useState(()=>restoreLocation(readLocal('journal.location',null),localDate(),modules.map(m=>m.id)));
 const [data,setData]=useState<Snapshot|null>(null),[view,setView]=useState(treePrototype?'projects':initialLocation.view),[daySelection,setDaySelection]=useState({date:initialLocation.date,followToday:initialLocation.followToday}),[dialog,setDialog]=useState<DialogSpec|null>(null),[query,setQuery]=useState(''),[toast,setToast]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const today=localDate(data?.now),date=daySelection.followToday?today:daySelection.date;
 const dialogRef=useRef(dialog);dialogRef.current=dialog;
 const openDialog=useCallback((value:DialogSpec|null)=>setDialog(value?{...value,entry:value.entry??operationEntry()}:null),[]);
 const dataRef=useRef(data),seq=useRef(0),busyRef=useRef(false),searchRef=useRef<HTMLInputElement>(null),toastTimer=useRef<ReturnType<typeof setTimeout>|null>(null);
 dataRef.current=data;
 const mainRef=useRef<HTMLElement>(null),searchOrigin=useRef<HTMLElement|null>(null),searchScroll=useRef<{element:HTMLElement;top:number;left:number}[]>([]),returnFromSearch=useRef(false);
 const changeQuery=(value:string)=>{
  if(!query&&value&&mainRef.current)searchScroll.current=[mainRef.current,...mainRef.current.querySelectorAll<HTMLElement>('*')].filter(element=>element===mainRef.current||element.scrollTop||element.scrollLeft).map(element=>({element,top:element.scrollTop,left:element.scrollLeft}));
  if(query&&!value)returnFromSearch.current=true;
  setQuery(value);
 };
 useLayoutEffect(()=>{if(query||!returnFromSearch.current)return;returnFromSearch.current=false;for(const {element,top,left} of searchScroll.current){if(element.isConnected){element.scrollTop=top;element.scrollLeft=left;}}const target=searchOrigin.current;const frame=requestAnimationFrame(()=>{if(document.querySelector('dialog[open]'))return;if(target?.isConnected&&!target.closest('[hidden],[inert]'))target.focus({preventScroll:true});else mainRef.current?.focus({preventScroll:true});});return()=>cancelAnimationFrame(frame);},[!!query]);
 const setDate=useCallback((value:string)=>{if(validWorkspaceDate(value))setDaySelection({date:value,followToday:value===localDate(dataRef.current?.now)});},[]);
 const notify=useCallback((text:string)=>{setToast(text);if(toastTimer.current)clearTimeout(toastTimer.current);toastTimer.current=setTimeout(()=>setToast(''),6000);},[]);
 const refresh=useCallback(async()=>{if(busyRef.current)return;const n=++seq.current;try{const result=await api.snapshot();if(n===seq.current){dataRef.current=result;setData(result);setError('');}}catch(e){if(n===seq.current)setError(e instanceof Error?e.message:String(e));}},[]);
 useEffect(()=>{void refresh();const off=api.onChanged?.(()=>void refresh());return()=>off?.();},[refresh]);
 useEffect(()=>{if(data)writeLocal('journal.location',{view,date,followToday:daySelection.followToday,lastSeenDay:today});},[view,date,daySelection.followToday,today,!!data]);
 useEffect(()=>()=>{if(toastTimer.current)clearTimeout(toastTimer.current);},[]);
 useEffect(()=>{const key=(e:KeyboardEvent)=>{if(e.isComposing||e.defaultPrevented||document.querySelector('dialog[open]'))return;if(primaryModifier(e)&&(e.code==='Slash'||e.key==='/')&&!dialog){e.preventDefault();setDialog({type:'shortcuts'});return;}if(primaryModifier(e)&&e.key.toLowerCase()==='k'&&!dialog){e.preventDefault();searchRef.current?.focus();searchRef.current?.select();}if(primaryModifier(e)&&!e.shiftKey&&!e.altKey&&e.key.toLowerCase()==='n'&&!dialog){e.preventDefault();if(view==='projects'&&!query)window.dispatchEvent(new Event('journal:new-item'));else setDialog({type:'task'});}if(e.key==='Escape'&&query&&!dialog){e.preventDefault();changeQuery('');}};window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key);},[dialog,view,query]);
 useEffect(()=>api.onOpenSession?.(id=>{void refresh().then(()=>setDialog({type:'summary',id}));}),[refresh]);
 useEffect(()=>api.onOpenItem?.(id=>setDialog({type:'detail',id})),[]);
 const run=useCallback(async(command:Command)=>{if(busyRef.current)throw new Error('正在保存，请稍候。');busyRef.current=true;setBusy(true);++seq.current;try{const result=await api.command({...command,meta:{...command.meta,entry:command.meta?.entry??dialogRef.current?.entry??operationEntry()}});dataRef.current=result;setData(result);if(result.focusReminder)notify(result.focusReminder);if(result.itemNotice)notify(result.itemNotice);return result;}catch(e){notify(e instanceof Error?e.message:String(e));throw e;}finally{busyRef.current=false;setBusy(false);}},[notify]);
 const navigate=useCallback((id:string)=>{recordOperation('navigation.'+id,operationEntry());if(id==='projects'&&window.sessionStorage.getItem('journal-locate'))setLocationRevision(value=>value+1);if(id!=='settings')clearSettingsSection();returnFromSearch.current=false;setQuery('');setView(id);setSidebarOpen(false);},[]);
 const context=React.useMemo(()=>data?{data,run,dialog:openDialog,notify,busy,date,setDate,navigate}:null,[data,run,notify,busy,date,navigate,openDialog]);
 const reviewCount=React.useMemo(()=>data?reviewQueue(data.state,localDate(data.now)).length:0,[data?.state,data?.now]);
 const Current=modules.find(m=>m.id===view)!.View;
 useEnterMotion(mainRef,query?'search':view);
 return <div className={`application workbench ${sidebarOpen?'sidebar-open':''}`}>
  <header className={`titlebar ${isDesktop?'native-titlebar':''}`}><div className="brand"><CheckmarkCircle24Filled/><span>专注记</span></div><button className="sidebar-toggle" aria-label="显示或收起侧栏" aria-expanded={sidebarOpen} onClick={()=>setSidebarOpen(v=>!v)}><PanelLeft20Regular/></button><nav className="top-navigation" aria-label="主导航">{modules.filter(m=>m.id!=='settings').map(m=><button key={m.id} onPointerEnter={()=>{if('preload' in m)void m.preload();}} onFocus={()=>{if('preload' in m)void m.preload();}} aria-label={m.name} title={m.name} className={view===m.id&&!query?'nav-item selected':'nav-item'} aria-current={view===m.id&&!query?'page':undefined} onClick={()=>navigate(m.id)}><m.icon/><span>{m.name}</span>{m.id==='review'&&reviewCount>0&&<small className="nav-count">{reviewCount}</small>}</button>)}</nav><label className="search-box top-search"><Search20Regular/><input ref={searchRef} value={query} onFocus={e=>{if(!query&&e.relatedTarget instanceof HTMLElement&&mainRef.current?.contains(e.relatedTarget))searchOrigin.current=e.relatedTarget;}} onChange={e=>changeQuery(e.target.value)} placeholder={shortcutLabel('搜索 · Ctrl K')} aria-label="搜索任务和笔记"/>{query&&<button aria-label="关闭搜索" onClick={()=>changeQuery('')}><Dismiss20Regular/></button>}</label><Button className="quick-timer-start" disabled={!data||busy} title="立即开始计时，结束后再补充事项" onClick={()=>void run({type:'focus.start-unassigned'}).then(result=>{setDate(localDate(result.now));navigate('today');}).catch(()=>{})}><Timer20Regular/><span>先计时</span></Button>{data?.demo&&<span className="demo-badge">测试工作区</span>}{!isDesktop&&<div className="window-controls"><button aria-label="最小化" onClick={()=>void api.windowAction('minimize')}><Subtract20Regular/></button><button aria-label="最大化" onClick={()=>void api.windowAction('maximize')}><Square20Regular/></button><button aria-label="关闭窗口" onClick={()=>void api.windowAction('close')}><Dismiss20Regular/></button></div>}</header>
  <div id="rest-workspace"/><div className="shell"><aside className="sidebar" aria-label="工作区侧栏"><div className="sidebar-content"><div id="workspace-sidebar" hidden={!!query} inert={!!query}/>{query?<SearchContext/>:view==='today'?<DateContext date={date} today={localDate(data?.now)} setDate={setDate}/>:view==='settings'?<SettingsContext/>:null}</div><div className="sidebar-bottom"><button className="nav-item" aria-label="AI 助手" onClick={()=>setDialog({type:'ai'})}><Sparkle20Regular/><span>AI 助手</span></button><AppearanceQuickSwitch/><SyncShortcut open={()=>{requestSettingsSection('sync');navigate('settings');}} notify={notify}/><button aria-label="设置" title="设置" className={view==='settings'?'nav-item selected':'nav-item'} onClick={()=>navigate('settings')}><Settings24Regular/><span>设置</span></button></div></aside>{sidebarOpen&&<button className="sidebar-backdrop" aria-label="收起侧栏" onClick={()=>setSidebarOpen(false)}/>}
   <main ref={mainRef} className={`main ${query?'is-searching':''}`} id="main-content" tabIndex={-1}>{error&&<div className="error-banner" role="alert">{error}<Button onClick={()=>void refresh()}>重试</Button></div>}{data?<AppContext.Provider value={context!}><JournalClock data={data} refresh={refresh}><BreakBar/><div className="workspace-screen" hidden={!!query} inert={!!query}><Current key={`${view}-${locationRevision}`}/></div>{query&&<SearchResults query={query}/>}{dialog&&<Dialogs key={`${dialog.type}-${dialog.id??'new'}`} spec={dialog}/>}{(view!=='today'||date!==localDate(data.now)||query)&&<LiveDock/>}</JournalClock></AppContext.Provider>:!error&&<div className="loading">正在打开工作日志…</div>}</main>
  </div>


  {toast&&<div className="toast" role="status">{toast}<button aria-label="关闭提示" onClick={()=>setToast('')}><Dismiss20Regular/></button></div>}
 </div>;
}

function LiveDock(){const {data,busy,run,setDate,navigate,dialog}=useJournal();return data.timers.length?<TimerDock data={data} busy={busy} run={run} onOpen={taskId=>{if(taskId===null){setDate(localDate(data.now));navigate('today');return;}void run({type:'task.select',payload:{id:taskId}}).then(()=>{setDate(localDate(data.now));navigate('today');}).catch(()=>{});}} onSummary={id=>dialog({type:'summary',id})}/>:null;}
