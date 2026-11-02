import {QuitControl} from './QuitControl';
import {RelatedDetail} from './RelatedDetail';
import {createPortal} from 'react-dom';
import {contentGroupId} from '../core/content-workspace';
import {setContentScope} from './content-navigation';
import './content-navigation.css';
import {desktopPlatform} from './platform';
import {shortcutFromEvent,formatShortcut} from '../core/shortcuts';
import {useShortcuts} from './shortcuts';
import {recordOperation,operationEntry,withOperationEntry} from './operation-entry';
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
 const [initialLocation]=useState(()=>{const location=restoreLocation(readLocal('journal.location',null),localDate(),modules.map(m=>m.id));try{if(window.sessionStorage.getItem('journal-open-inbox')==='1'){window.sessionStorage.removeItem('journal-open-inbox');window.sessionStorage.removeItem('journal-locate');return {...location,view:'inbox'};}}catch{}return location;});
 const [data,setData]=useState<Snapshot|null>(null),[view,setView]=useState(treePrototype?'projects':initialLocation.view),[daySelection,setDaySelection]=useState({date:initialLocation.date,followToday:initialLocation.followToday}),[dialog,setDialog]=useState<DialogSpec|null>(null),[query,setQuery]=useState(''),[toast,setToast]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const today=localDate(data?.now),date=daySelection.followToday?today:daySelection.date;
 const [previewId,setPreviewId]=useState<string|null>(null),[previewIds,setPreviewIds]=useState<string[]>([]);
 const previewOrigin=useRef<HTMLElement|null>(null);
 const preview=useCallback((id:string)=>{previewOrigin.current=document.activeElement instanceof HTMLElement?document.activeElement:null;setPreviewIds(old=>old.includes(id)?old:[...old,id]);setPreviewId(id);},[]);
 const dialogRef=useRef(dialog);dialogRef.current=dialog;
 const openDialog=useCallback((value:DialogSpec|null)=>{if(value?.type==='detail'&&value.id){preview(value.id);return;}setDialog(value?{...value,entry:value.entry??operationEntry()}:null);},[preview]);
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
 useEffect(()=>api.onOpenSession?.(id=>{void refresh().then(()=>setDialog({type:'summary',id}));}),[refresh]);
 useEffect(()=>api.onOpenItem?.(id=>{void refresh().then(()=>preview(id));}),[preview,refresh]);
 const run=useCallback(async(command:Command)=>{if(busyRef.current)throw new Error('正在保存，请稍候。');busyRef.current=true;setBusy(true);++seq.current;try{const result=await api.command({...command,meta:{...command.meta,entry:command.meta?.entry??dialogRef.current?.entry??operationEntry()}});dataRef.current=result;setData(result);if(result.focusReminder)notify(result.focusReminder);if(result.itemNotice)notify(result.itemNotice);return result;}catch(e){notify(e instanceof Error?e.message:String(e));throw e;}finally{busyRef.current=false;setBusy(false);}},[notify]);
 useEffect(()=>api.onEditAction?.(action=>{const editing=document.activeElement?.closest('input,textarea,select,[contenteditable=true]');if(action!=='redo'&&view==='projects'&&!query&&!dialog&&!editing){if(action==='undo')void run({type:'organize.undo',meta:{entry:'menu.edit'}}).then(()=>notify('已撤销整理操作，计时与投入记录保留')).catch(()=>{});else window.dispatchEvent(new Event('journal:select-all'));}else void api.editText?.(action).catch(()=>{});}),[view,query,dialog,run,notify]);
 const navigate=useCallback((id:string)=>{if(id!==view||query)recordOperation('navigation.'+id,operationEntry());if(id==='projects'&&window.sessionStorage.getItem('journal-locate'))setLocationRevision(value=>value+1);if(id!=='settings')clearSettingsSection();returnFromSearch.current=false;setQuery('');setPreviewId(null);setView(id);setSidebarOpen(false);},[view,query]);
 const shortcuts=useShortcuts(),shortcutFocus=useRef(false);
 useEffect(()=>{
  let intent:'pointer'|'tab'|null=null,pointerTarget:EventTarget|null=null,timer:ReturnType<typeof setTimeout>|undefined;
  const clear=()=>{intent=null;pointerTarget=null;if(timer)clearTimeout(timer);timer=undefined;};
  const arm=(kind:'pointer'|'tab',target:EventTarget|null)=>{clear();intent=kind;pointerTarget=target;timer=setTimeout(clear,0);};
  const pointer=(event:PointerEvent)=>{const target=event.target;if(target instanceof HTMLInputElement)arm('pointer',target);else if(target instanceof window.Element&&!target.closest('button')){const input=target.closest('label')?.querySelector('input');if(input)arm('pointer',input);else clear();}else clear();};
  const key=(event:KeyboardEvent)=>{if(event.key==='Tab'&&!event.repeat&&!event.isComposing&&event.keyCode!==229&&!event.getModifierState('AltGraph'))arm('tab',null);else clear();};
  const focus=(event:FocusEvent)=>{const allowed=intent==='tab'||intent==='pointer'&&event.target===pointerTarget;clear();if(!allowed||shortcutFocus.current||!(event.target instanceof HTMLInputElement))return;const label=event.target.getAttribute('aria-label');if(label==='搜索任务和笔记')recordOperation('search.open','search.global.focus');else if(['在事项树中搜索','搜索笔记','搜索提醒'].includes(label??''))recordOperation('search.open','search.current.focus');};
  document.addEventListener('pointerdown',pointer,true);document.addEventListener('keydown',key,true);document.addEventListener('focusin',focus);return()=>{clear();document.removeEventListener('pointerdown',pointer,true);document.removeEventListener('keydown',key,true);document.removeEventListener('focusin',focus);};
 },[]);
 useEffect(()=>{const key=(e:KeyboardEvent)=>{
  if(e.isComposing||e.defaultPrevented||dialog||document.querySelector('dialog[open],[role="dialog"]')||(e.target instanceof HTMLElement&&e.target.closest('[data-shortcut-recorder]')))return;
  const chord=shortcutFromEvent(e,desktopPlatform());
  const action=Object.entries(shortcuts).find(([,binding])=>binding&&binding===chord)?.[0];
  if(!action||['create-sibling','create-child','rename','toggle-timer','stop-timer','complete','delete'].includes(action))return;
  e.preventDefault();
  if(e.repeat)return;
  if(action==='search-current'||action==='search-global'){
   const labels:Record<string,string>={projects:'在事项树中搜索',notes:'搜索笔记',reminders:'搜索提醒'};
   const local=!query&&action==='search-current'&&labels[view]?mainRef.current?.querySelector<HTMLInputElement>(`input[aria-label="${labels[view]}"]`):null;
   const target=local??searchRef.current;if(target){recordOperation('search.open',local?'search.current.shortcut':'search.global.shortcut');shortcutFocus.current=true;try{target.focus();target.select();}finally{shortcutFocus.current=false;}}
  }else if(action==='create'){recordOperation('shortcut.invoke','shortcut.create');withOperationEntry('shortcut.create',()=>{if(['projects','notes','reminders','inbox'].includes(view)&&!query)window.dispatchEvent(new Event('journal:new-item'));else setDialog({type:'task',entry:'shortcut.create'});});}
  else if(action==='help'){recordOperation('shortcut.invoke','shortcut.help');setDialog({type:'shortcuts'});}
  else if(action==='settings')withOperationEntry('shortcut.settings',()=>navigate('settings'));
  else if(action==='quit'){if(!busyRef.current){recordOperation('shortcut.invoke','shortcut.quit');window.dispatchEvent(new Event('journal:quit-request'));}}
  else if(action.startsWith('navigate-'))withOperationEntry('shortcut.navigation',()=>navigate(action.slice(9)));
 };window.addEventListener('keydown',key,true);return()=>window.removeEventListener('keydown',key,true);},[dialog,view,query,shortcuts,navigate]);
 useEffect(()=>{const key=(e:KeyboardEvent)=>{if(e.key==='Escape'&&query&&!dialog&&!document.querySelector('dialog[open],[role="dialog"]')&&!e.isComposing&&e.keyCode!==229&&!e.getModifierState('AltGraph')&&!e.defaultPrevented){e.preventDefault();changeQuery('');}};window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key);},[query,dialog]);
 useEffect(()=>api.onOpenInbox?.(()=>{window.sessionStorage.removeItem('journal-locate');window.sessionStorage.removeItem('journal-open-inbox');navigate('inbox');}),[navigate]);
 const context=React.useMemo(()=>data?{data,run,dialog:openDialog,notify,busy,date,setDate,navigate}:null,[data,run,notify,busy,date,navigate,openDialog]);
 const reviewCount=React.useMemo(()=>data?reviewQueue(data.state,localDate(data.now)).length:0,[data?.state,data?.now]);
 const Current=modules.find(m=>m.id===view)!.View;
 const locatePreview=(id:string)=>{const task=data?.state.tasks.find(t=>t.id===id);if(!task||!data)return;const target=task.itemType==='note'?'notes':task.itemType==='reminder'?'reminders':task.itemType==='event'?'calendar':'projects';setContentScope(data.dataPath,contentGroupId(data.state,id));if(target==='projects')window.sessionStorage.setItem('journal-locate',id);else window.sessionStorage.setItem('journal-content-locate',JSON.stringify({id,module:target}));if(target==='calendar'&&task.eventAt)setDate(localDate(task.eventAt));setLocationRevision(n=>n+1);navigate(target);};
 useEnterMotion(mainRef,query?'search':view);
 return <div className={`application workbench content-navigation ${sidebarOpen?'sidebar-open':''}`}>
  <header className={`titlebar ${isDesktop?'native-titlebar':''}`}><div className="brand"><CheckmarkCircle24Filled/><span>专注记</span></div><button className="sidebar-toggle" aria-label="显示或收起侧栏" aria-expanded={sidebarOpen} onClick={()=>setSidebarOpen(v=>!v)}><PanelLeft20Regular/></button><Button className="quick-capture-global" title="随时记录，默认保存到收件箱" onClick={()=>{if(api.capture)void api.capture.open();else openDialog({type:'task',parentId:'inbox'});}}>快速记录</Button><Button className="quick-timer-start" disabled={!data||busy} title="立即开始计时，结束后再补充事项" onClick={()=>void run({type:'focus.start-unassigned'}).then(result=>{setDate(localDate(result.now));navigate('today');}).catch(()=>{})}><Timer20Regular/><span>先计时</span></Button>{data?.demo&&<span className="demo-badge">测试工作区</span>}{!isDesktop&&<div className="window-controls"><button aria-label="最小化" onClick={()=>void api.windowAction('minimize')}><Subtract20Regular/></button><button aria-label="最大化" onClick={()=>void api.windowAction('maximize')}><Square20Regular/></button><button aria-label="关闭窗口" onClick={()=>void api.windowAction('close')}><Dismiss20Regular/></button></div>}</header>
  <div id="rest-workspace"/><div className="shell"><aside className="sidebar" aria-label="工作区侧栏"><label className="search-box top-search"><Search20Regular/><input ref={searchRef} value={query} onFocus={e=>{if(!query&&e.relatedTarget instanceof HTMLElement&&mainRef.current?.contains(e.relatedTarget))searchOrigin.current=e.relatedTarget;}} onChange={e=>changeQuery(e.target.value)} placeholder={shortcuts['search-global']?`搜索 · ${formatShortcut(shortcuts['search-global'],desktopPlatform())}`:'搜索全部内容'} aria-label="搜索任务和笔记"/>{query&&<button aria-label="关闭搜索" onClick={()=>changeQuery('')}><Dismiss20Regular/></button>}</label><nav className="top-navigation" aria-label="主导航">{modules.filter(m=>m.id!=='settings').map(m=><button key={m.id} onPointerEnter={()=>{if('preload' in m)void m.preload();}} onFocus={()=>{if('preload' in m)void m.preload();}} aria-label={m.name} title={m.name} className={view===m.id&&!query?'nav-item selected':'nav-item'} aria-current={view===m.id&&!query?'page':undefined} onClick={()=>withOperationEntry('navigation.primary',()=>navigate(m.id))}><m.icon/><span>{m.name}</span>{m.id==='review'&&reviewCount>0&&<small className="nav-count">{reviewCount}</small>}</button>)}</nav><div className="sidebar-content"><div id="workspace-sidebar" hidden={!!query} inert={!!query}/>{query?<SearchContext/>:view==='today'?<DateContext date={date} today={localDate(data?.now)} setDate={setDate}/>:view==='settings'?<SettingsContext/>:null}</div><div className="sidebar-bottom"><button className="nav-item" aria-label="AI 助手" onClick={()=>setDialog({type:'ai'})}><Sparkle20Regular/><span>AI 助手</span></button><AppearanceQuickSwitch/><SyncShortcut open={()=>{requestSettingsSection('sync');navigate('settings');}} notify={notify}/><div className="sidebar-app-actions"><button aria-label="设置" title="设置" className={view==='settings'?'nav-item selected':'nav-item'} onClick={()=>withOperationEntry('navigation.sidebar',()=>navigate('settings'))}><Settings24Regular/><span>设置</span></button><QuitControl busy={busy} notify={notify}/></div></div></aside>{sidebarOpen&&<button className="sidebar-backdrop" aria-label="收起侧栏" onClick={()=>setSidebarOpen(false)}/>}
   <main ref={mainRef} className={`main ${query?'is-searching':''}`} id="main-content" tabIndex={-1}>{error&&<div className="error-banner" role="alert">{error}<Button onClick={()=>void refresh()}>重试</Button></div>}{data?<AppContext.Provider value={context!}><JournalClock data={data} refresh={refresh}><BreakBar/><div className="workspace-screen" hidden={!!query} inert={!!query}><Current key={`${view}-${locationRevision}`}/></div>{query&&<SearchResults query={query}/>}{createPortal(<div className="workbench content-preview-surface">{previewIds.map(id=><div key={id} className="external-detail-drawer" hidden={previewId!==id} inert={previewId!==id} aria-label="内容预览"><div className="preview-location"><Button subtle onClick={()=>locatePreview(id)}>前往所在位置</Button></div><RelatedDetail id={id} onClose={()=>{setPreviewId(current=>current===id?null:current);if(previewOrigin.current?.isConnected)previewOrigin.current.focus({preventScroll:true});}}/></div>)}</div>,document.body)}{dialog&&<Dialogs key={`${dialog.type}-${dialog.id??'new'}`} spec={dialog}/>}{(view!=='today'||date!==localDate(data.now)||query)&&<LiveDock/>}</JournalClock></AppContext.Provider>:!error&&<div className="loading">正在打开工作日志…</div>}</main>
  </div>


  {toast&&<div className="toast" role="status">{toast}<button aria-label="关闭提示" onClick={()=>setToast('')}><Dismiss20Regular/></button></div>}
 </div>;
}

function LiveDock(){const {data,busy,run,setDate,navigate,dialog}=useJournal();return data.timers.length?<TimerDock data={data} busy={busy} run={run} onOpen={taskId=>{if(taskId===null){setDate(localDate(data.now));navigate('today');return;}void run({type:'task.select',payload:{id:taskId}}).then(()=>{setDate(localDate(data.now));navigate('today');}).catch(()=>{});}} onSummary={id=>dialog({type:'summary',id})}/>:null;}
