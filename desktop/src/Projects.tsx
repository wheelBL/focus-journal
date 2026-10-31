import {primaryModifier,shortcutLabel,isMac} from './platform';
import {withOperationEntry} from './operation-entry';
import {dailyFocusItems,isDailyFocus} from '../core/daily-focus';
import {useOutlineMotion} from './motion';
import {FocusBadge} from './FocusToggle';
import {itemPresentations} from '../core/item-presentation';
import {ItemStatus} from './ItemStatus';
import {projectOutline} from './outline-projection';
import {useOutlineSelection} from './useOutlineSelection';
import {useOutlineWindow} from './useOutlineWindow';
import {BatchOrganize} from './BatchOrganize';
import type {BatchAction} from '../core/batch-model';
import {readOutlineCreation,writeOutlineCreation,consumeOutlineCreation,outlineCreationSignature,outlineCreatedEvent,type OutlineCreator as Creator} from './outline-creation-draft';
import {readTree,writeLocal,type TreeWorkspace} from './workspace-state';
import {CapturePreview,useCaptureDraft} from './SemanticCapture';
import {useItemActions} from './useItemActions';
import {defaultCaptureParent} from '../core/capture-destination';
import {recurrenceLabel} from '../core/recurrence';
import {ArrowRepeatAll20Regular} from '@fluentui/react-icons';
import './outline-readability.css';
import {ItemInspector} from './ItemInspector';
import {OutlineMenu} from './OutlineMenu';
import {outlineKeyAction} from './outline-keyboard';
import {captureItem,isEvent,isInformation,type ItemType} from '../core/item-kind';
import {effectiveSort} from '../core/item-order';
import {useOutlineOrder} from './useOutlineOrder';
import {blockedReason,deadlineConstraint} from '../core/item-state';
import {DeadlineEditor} from './DeadlineEditor';
import {isDeadlineOverdue} from '../core/deadlines';
import React,{useEffect,useLayoutEffect,useMemo,useRef,useState} from 'react';
import {Star20Filled,Add20Regular,ArrowUndo20Regular,ChevronDown20Regular,ChevronRight20Regular,Folder20Regular,FolderOpen20Regular,Play20Filled,Dismiss20Regular,Search20Regular,ReOrderDotsVertical20Regular,ArrowExpand20Regular,ArrowMinimize20Regular,Checkmark20Regular,TextBulletListTree20Regular,Calendar20Regular,Bookmark20Regular,Keyboard20Regular,Subtract20Regular} from '@fluentui/react-icons';
import {useJournal,useWorkspaceJournal,Button,minuteText,timerText} from './ui';
import {localDate,type Task,type ItemFilter} from '../core/types';
import {branchIds,outlineIndex,outlinePath,type OutlineIndex,type OutlineNode} from '../core/outline';
import './projects.css';
import {EditValue} from './InlineEdit';
import {TagEditor} from './Tags';
import {ItemFilters} from './ItemFilters';
import {emptyFilter,filterOutline} from '../core/filters';
import {group,hasTodayFocusRule,withRules,allowsStatus,canToggleCompleted,condition,filterSignature,replaceFields,rulesFor,selectView,unfinishedRules} from '../core/filter-rules';
import {WorkspaceContext} from './WorkspaceContext';
import {useOutlineEffort} from './useOutlineEffort';

type Drop={id:string;position:'before'|'inside'|'after'};
type TreeViewMemory={selected:string|null;retained:string|null;filter:ItemFilter;activeView:string;collapsed:string[];showDetails:boolean;scrollTop:number;layout?:'tree'|'flat';detailTab?:'details'|'records'|'review'};
let treeViewMemory:TreeViewMemory|null=null;
function quiet(p:Promise<unknown>){void p.catch(()=>{});}

export function Projects({reviewRoot}:{reviewRoot?:string}){
 const {data,run,notify,busy,dialog}=useWorkspaceJournal(),state=data.state,baseIndex=useMemo(()=>outlineIndex(state),[state]),index=useOutlineEffort(baseIndex,state);
 const presentations=useMemo(()=>itemPresentations(index,data.timers,data.now),[index,data.timers,data.now]);
 const [locate]=useState(()=>{if(reviewRoot)return null;const id=window.sessionStorage.getItem('journal-locate');window.sessionStorage.removeItem('journal-locate');return id;});
 const workspaceKey=`journal.tree.${data.dataPath}`;
 const [saved]=useState(()=>reviewRoot||locate?null:readTree(workspaceKey,state)??treeViewMemory);
 const requestState=useItemActions();
 const [batchAction,setBatchAction]=useState<BatchAction|null>(null);
 const [detailTab,setDetailTab]=useState<'details'|'records'|'review'>(saved?.detailTab??'details');
 const [layout,setLayout]=useState<'tree'|'flat'>(saved?.layout??'tree');
 const [selected,setSelected]=useState<string|null>(()=>reviewRoot??(locate&&index.nodes.has(locate)?locate:saved?.selected&&index.nodes.has(saved.selected)?saved.selected:state.settings.selectedTaskId??state.tasks.find(t=>!t.deletedAt&&!t.archived)?.id??null));
 const [filter,setFilter]=useState<ItemFilter>(reviewRoot?{...emptyFilter(),scopeId:reviewRoot,showDone:false}:saved?.filter??emptyFilter()),[activeView,setActiveView]=useState(saved?.activeView??''),[collapsed,setCollapsed]=useState<Set<string>>(()=>new Set(saved?.collapsed??[])),[showDetails,setShowDetails]=useState(true);
 const [retained,setRetained]=useState<string|null>(null),[menu,setMenu]=useState<{id:string|null;x:number;y:number}|null>(null);
 const creationKey=`journal.creation.${data.dataPath}.${reviewRoot??'workspace'}`;
 const [savedCreation]=useState(()=>readOutlineCreation(creationKey,state,data.now,reviewRoot??defaultCaptureParent(state)));
 const [creator,setCreator]=useState<Creator|null>(savedCreation?.creator??null),[newTitle,setNewTitle]=useState(savedCreation?.capture.raw??''),[createError,setCreateError]=useState(''),[creating,setCreating]=useState(false),[rename,setRename]=useState({id:'',signal:0});
 const createPending=useRef(false),focusCreation=useRef(true);
 const capture=useCaptureDraft(newTitle,data.now,creator?.itemType??'task',savedCreation?.capture);
 const creationSignature=outlineCreationSignature(creator,capture.persistent),currentCreation=useRef(creationSignature),mounted=useRef(true);currentCreation.current=creationSignature;
 useEffect(()=>{mounted.current=true;const saved=(event:Event)=>{const detail=(event as CustomEvent).detail;if(detail.key!==creationKey||detail.signature!==currentCreation.current)return;focusCreation.current=!!document.activeElement?.closest('.inline-creator');capture.reset();setNewTitle('');setCreateError('');setCreator(detail.next);};window.addEventListener(outlineCreatedEvent,saved);return()=>{mounted.current=false;window.removeEventListener(outlineCreatedEvent,saved);};},[creationKey]);
 useEffect(()=>{writeOutlineCreation(creationKey,creator,capture.persistent);},[creationKey,creator,capture.persistent]);
 useEffect(()=>{if(savedCreation?.relocated)notify('原新增位置已不可用，草稿已保留到可用位置；请核对归属后保存。');},[]);
 const [dragging,setDragging]=useState<string|null>(null),[drop,setDrop]=useState<Drop|null>(null),[moveMessage,setMoveMessage]=useState('');
 const view=filter.view,query=filter.query,showDone=allowsStatus(rulesFor(filter),'done'),focus=filter.scopeId;
 const updateFilter=(next:ItemFilter)=>{setFilter(next);setRetained(null);};
 const setView=(view:ItemFilter['view'])=>updateFilter(view==='all'?{...emptyFilter(),sort:filter.sort}:selectView(replaceFields({...filter,trash:false},['focusDate'],[]),view));
 const todayFocus=hasTodayFocusRule(filter),focusCount=useMemo(()=>dailyFocusItems(index,localDate(data.now)).filter(t=>t.status==='open').length,[index,data.now]);
 const openTodayFocus=()=>{setActiveView('');updateFilter(withRules({...emptyFilter(),sort:'smart'},group([condition('status','is','open'),condition('focusDate','period','today')])));};
 const setQuery=(query:string)=>updateFilter({...filter,query});
 const setShowDone=(showDone:boolean)=>updateFilter(replaceFields(filter,['status'],showDone?[]:unfinishedRules()));
 const setFocus=(scopeId:string|null)=>updateFilter({...filter,scopeId});
 const canUndo=!!data.undoLabel;
 const [startPrompt,setStartPrompt]=useState<string|null>(null),[startEstimate,setStartEstimate]=useState('25');
 const scroll=useRef<HTMLDivElement>(null),rowRefs=useRef(new Map<string,HTMLDivElement>()),hover=useRef<{id:string;timer:ReturnType<typeof setTimeout>}|null>(null);
 const pointer=useRef<{id:string;x:number;y:number;started:boolean;drop:Drop|null;root:boolean}|null>(null);
 const createInput=useRef<HTMLInputElement>(null),creatorForm=useRef<HTMLFormElement>(null);
 const [editing,setEditing]=useState(false);
 const {sorted,placeCreated,reason:sortReason}=useOutlineOrder(baseIndex,effectiveSort(filter),data.now,layout,!!creator||editing||!!dragging);
 const previousFilter=useRef(filter),searchPosition=useRef<{collapsed:Set<string>;scrollTop:number}|null>(null);
 useEffect(()=>{
  const previous=previousFilter.current;previousFilter.current=filter;
  if(!previous.query&&filter.query){searchPosition.current={collapsed:new Set(collapsed),scrollTop:scroll.current?.scrollTop??0};setCollapsed(new Set());}
  else if(previous.query&&!filter.query&&searchPosition.current){const saved=searchPosition.current;searchPosition.current=null;setCollapsed(saved.collapsed);requestAnimationFrame(()=>{if(scroll.current)scroll.current.scrollTop=saved.scrollTop;});}
  else if(filter.query!==previous.query||JSON.stringify({...filter,query:'',sort:undefined})!==JSON.stringify({...previous,query:'',sort:undefined}))setCollapsed(new Set());
 },[filter]);
 const knownTaskIds=useRef(new Set(state.tasks.map(task=>task.id)));
 const selectedNode=selected?index.nodes.get(selected):undefined;
 useLayoutEffect(()=>{if(scroll.current)scroll.current.scrollTop=saved?.scrollTop??0;},[]);
 useEffect(()=>{if(reviewRoot)return;treeViewMemory={selected,retained:null,filter,activeView,collapsed:[...collapsed],showDetails,layout,detailTab,scrollTop:scroll.current?.scrollTop??0};writeLocal(workspaceKey,{...treeViewMemory,completedDefaultVersion:1});},[selected,retained,filter,activeView,collapsed,showDetails,layout,detailTab]);
 const previousItems=useRef(index);
 useEffect(()=>{if(retained){const before=previousItems.current.nodes.get(retained)?.record as Task|undefined,after=index.nodes.get(retained)?.record as Task|undefined;if(before&&after&&(before.status!==after.status||before.deletedAt!==after.deletedAt||before.archived!==after.archived))setRetained(null);}previousItems.current=index;},[index,retained]);
 const previousSavedView=useRef<{id:string;filter:ItemFilter|undefined}>({id:activeView,filter:state.views.find(v=>v.id===activeView)?.filter});
 useEffect(()=>{const current=state.views.find(v=>v.id===activeView)?.filter,previous=previousSavedView.current;if(current&&previous.id===activeView&&previous.filter&&filterSignature(filter)===filterSignature(previous.filter)&&filterSignature(current)!==filterSignature(previous.filter))setFilter(structuredClone(current));previousSavedView.current={id:activeView,filter:current};},[state.views,activeView,filter]);
 useLayoutEffect(()=>{if(!focusCreation.current||creating||scroll.current?.closest('[hidden],[inert]')||!createInput.current)return;createInput.current.focus();createInput.current.scrollIntoView({block:'nearest'});focusCreation.current=false;},[creator,creating]);

 const filtered=useMemo(()=>filterOutline(state,filter,data.now,retained,index),[state,filter,data.now,retained,index]),match=filtered.matches,pinned=filtered.retained;
 const closedMatchCount=useMemo(()=>[...match].filter(id=>(index.nodes.get(id)!.record as Task).status!=='open').length,[match,index]);
 const keep=useMemo(()=>{const visible=new Set(filtered.keep);if(creator?.parentId)for(const n of outlinePath(index,creator.parentId))visible.add(n.id);if(reviewRoot){const scope=branchIds(index,reviewRoot);for(const id of visible)if(!scope.has(id))visible.delete(id);}return visible;},[filtered,index,creator?.parentId,reviewRoot]);
 const search=query.trim();
 const treeScope=focus&&(!!reviewRoot||!retained)?focus:null;
 const rows=useMemo(()=>projectOutline(index,keep,match,pinned,treeScope,collapsed,layout,sorted),[index,keep,match,pinned,treeScope,collapsed,layout,sorted]);
 useEffect(()=>{if(!creator&&(!selected||!keep.has(selected)))setSelected(rows.find(r=>match.has(r.node.id))?.node.id??rows[0]?.node.id??null);},[selected,keep,rows,match,creator]);
 useEffect(()=>()=>{if(hover.current)clearTimeout(hover.current.timer);},[]);
 const selectable=useMemo(()=>rows.filter(r=>match.has(r.node.id)).map(r=>r.node.id),[rows,match]);
 const rowIds=useMemo(()=>rows.map(r=>r.node.id),[rows]),selection=useOutlineSelection(selectable,JSON.stringify({...filter,sort:undefined})),{batch}=selection;
 const selectedVisible=selected!==null&&rowIds.includes(selected);
 const createAnchor=creator?.afterId??creator?.parentId;
 const afterBranch=createAnchor?branchIds(index,createAnchor):null;
 const creatorAfter=creator?(afterBranch?rows.filter(r=>afterBranch.has(r.node.id)).at(-1)?.node.id:rows.at(-1)?.node.id):null;
 const rowWindow=useOutlineWindow(rowIds,scroll,creatorAfter??null,creatorForm);
 const completed=useMemo(()=>new Set(state.tasks.filter(t=>t.status==='done').map(t=>t.id)),[state.tasks]);
 useOutlineMotion(scroll,{signature:rows.map(r=>`${r.node.id}:${r.depth}:${collapsed.has(r.node.id)}:${r.node.title}`).join('|')+JSON.stringify(creator),completed,completedSignature:[...completed].join('|'),enabled:!rowWindow.enabled&&rows.length<90,dragging:!!dragging});
 const focusRow=(id:string)=>{if(scroll.current?.closest('[hidden],[inert]'))return;rowWindow.reveal(id);requestAnimationFrame(()=>requestAnimationFrame(()=>{if(scroll.current?.closest('[hidden],[inert]')||document.activeElement?.closest('input,textarea,select,[contenteditable=true]'))return;rowRefs.current.get(id)?.focus();rowRefs.current.get(id)?.scrollIntoView({block:'nearest'});}));};
 const select=(id:string)=>{if(id!==selected){if(pinned)notify('已离开编辑事项；它不符合当前条件，已从视图移出。');setRetained(null);}setSelected(id);};
 const selectRow=(id:string,e?:React.MouseEvent)=>{if(e?.shiftKey&&selected)selection.range(id,selected);else if(e&&primaryModifier(e))selection.toggle(id,selected);else selection.select(id);select(id);rowRefs.current.get(id)?.focus();};
 const reveal=(id:string)=>{setCollapsed(previous=>{const next=new Set(previous);for(const n of outlinePath(index,id))next.delete(n.id);return next;});requestAnimationFrame(()=>{if(scroll.current?.closest('[hidden],[inert]'))return;rowWindow.reveal(id);requestAnimationFrame(()=>{if(!scroll.current?.closest('[hidden],[inert]'))rowRefs.current.get(id)?.scrollIntoView({block:'nearest'});});});};
 useEffect(()=>{const id=state.settings.selectedTaskId;if(id&&(!reviewRoot||branchIds(index,reviewRoot).has(id))&&!knownTaskIds.current.has(id)&&state.tasks.some(task=>task.id===id)){select(id);setRetained(id);reveal(id);}knownTaskIds.current=new Set(state.tasks.map(task=>task.id));},[state.tasks,state.settings.selectedTaskId]);
 const toggle=(id:string)=>setCollapsed(previous=>{const next=new Set(previous);next.has(id)?next.delete(id):next.add(id);return next;});
 const patch=(node:OutlineNode,field:string,value:unknown)=>{setRetained(node.id);return run(field==='plannedDate'?{type:'task.plan',payload:{id:node.id,date:value||null}}:{type:'outline.patch',payload:{id:node.id,field,value}});};
 const create=(parentId:string|null,afterId:string|null=null,itemType:ItemType='task')=>{if(createPending.current||scroll.current?.closest('[hidden],[inert]'))return;setMenu(null);if(creator&&newTitle.trim()){createInput.current?.focus();createInput.current?.scrollIntoView({block:'nearest'});notify('已返回未保存的事项；保存或取消后再新增。');return;}focusCreation.current=true;capture.reset();setCreator({parentId,afterId,itemType});setNewTitle('');setCreateError('');if(parentId)setCollapsed(previous=>{const next=new Set(previous);for(const n of outlinePath(index,parentId))next.delete(n.id);return next;});};
 const cancelCreation=()=>{if(createPending.current)return;capture.reset();setNewTitle('');setCreateError('');setCreator(null);writeOutlineCreation(creationKey,null,capture.persistent);if(selected)focusRow(selected);};
 const saveNew=async(e:React.FormEvent|React.KeyboardEvent,finish=false)=>{e.preventDefault();if(!creator||!newTitle.trim()||busy||createPending.current)return;if(capture.errors.length){setCreateError(capture.errors.join(' '));return;}const submitted=creationSignature,editor=createInput.current;createPending.current=true;setCreating(true);setCreateError('');try{const result=await run({type:'capture.create',payload:{...creator,draft:capture.draft}});const node=result.state.tasks.at(-1)!;consumeOutlineCreation(creationKey,submitted,finish?null:{...creator,parentId:node.parentId??null,afterId:node.id});if(!mounted.current||currentCreation.current!==submitted)return;placeCreated(node.id,node.parentId??null,creator.afterId);select(node.id);setDetailTab('details');setRetained(node.id);requestAnimationFrame(()=>{if(scroll.current?.closest('[hidden],[inert]')||document.activeElement!==editor&&document.activeElement!==document.body)return;rowRefs.current.get(node.id)?.scrollIntoView({block:'nearest'});if(finish)focusRow(node.id);else createInput.current?.focus();});}catch(e){if(mounted.current&&currentCreation.current===submitted){setCreateError((e as Error).message);if(!scroll.current?.closest('[hidden],[inert]')&&document.activeElement===editor)createInput.current?.focus();}}finally{createPending.current=false;if(mounted.current)setCreating(false);}};
 const canContain=(node:OutlineNode)=>(node.record as Task).status==='open'&&!(node.record as Task).archived&&!(node.record as Task).deletedAt;
 const nestCreator=(outdent:boolean)=>{
  if(!creator||busy)return;
  focusCreation.current=true;
  if(outdent){const parent=creator.parentId?index.nodes.get(creator.parentId):null;if(!parent){notify('已经在最外层。');return;}setCreator({...creator,parentId:parent.parentId,afterId:parent.id});setCreateError('');return;}
  const siblings=sorted(index.children.get(creator.parentId)??[]),previous=creator.afterId?index.nodes.get(creator.afterId):siblings.at(-1);
  if(!previous||!canContain(previous)){notify('前面没有可接收子项的同级事项。');return;}
  setCollapsed(old=>{const next=new Set(old);next.delete(previous.id);return next;});setCreator({...creator,parentId:previous.id,afterId:null});setCreateError('');
 };
 const move=async(id:string,targetId:string|null,position:'before'|'inside'|'after'|'root')=>{const result=await run({type:'outline.move',payload:{id,targetId,position}});const index=outlineIndex(result.state),warning=deadlineConstraint(index,id)||blockedReason(index,id);if(warning)notify(warning);setDragging(null);setDrop(null);setMoveMessage('已移动，路径与投入汇总已更新');setSelected(id);setRetained(id);if(targetId)setCollapsed(previous=>{const next=new Set(previous);for(const n of outlinePath(index,targetId))next.delete(n.id);return next;});requestAnimationFrame(()=>{rowWindow.reveal(id);requestAnimationFrame(()=>rowRefs.current.get(id)?.scrollIntoView({block:'nearest'}));});};
 const undo=async()=>{await run({type:'organize.undo'});setMoveMessage('已撤销整理操作，计时与投入记录保留');};
 useEffect(()=>{const menuUndo=()=>{if(!reviewRoot&&!scroll.current?.closest('[hidden],[inert]')&&data.undoLabel)withOperationEntry('menu.edit',()=>quiet(undo()));};window.addEventListener('journal:undo',menuUndo);return()=>window.removeEventListener('journal:undo',menuUndo);},[data.undoLabel,run]);
 useEffect(()=>{const menuSelectAll=()=>{if(!reviewRoot&&!scroll.current?.closest('[hidden],[inert]'))selection.all();};window.addEventListener('journal:select-all',menuSelectAll);return()=>window.removeEventListener('journal:select-all',menuSelectAll);},[selection.all,reviewRoot]);
 const openMenu=(id:string|null,x:number,y:number)=>{if(id)select(id);setMenu({id,x:Math.min(Math.max(8,x),window.innerWidth-245),y:Math.min(Math.max(40,y),window.innerHeight-470)});};
 const capturePosition=(node:OutlineNode|undefined)=>node?.id===focus?{parentId:node.id,afterId:null}:node?{parentId:node.parentId,afterId:node.id}:{parentId:focus??defaultCaptureParent(state),afterId:null};
 const newPosition=capturePosition(selectedNode&&rows.some(r=>r.node.id===selectedNode.id)?selectedNode:undefined);
 const createHere=()=>{if(!scroll.current?.closest('[hidden],[inert]'))create(newPosition.parentId,newPosition.afterId);};
 useEffect(()=>{window.addEventListener('journal:new-item',createHere);return()=>window.removeEventListener('journal:new-item',createHere);},[newPosition.parentId,newPosition.afterId,creator,newTitle]);

 const start=async(node:OutlineNode,estimate?:number,skip=false)=>{
   select(node.id);const active=data.timers.find(t=>t.taskId===node.id);if(active){if(active.paused)await run({type:'focus.resume',payload:{sessionId:active.sessionId}});else notify('这件事已经在计时。');return;}
   await run({type:'focus.start',payload:{taskId:node.id,estimateMinutes:estimate,skipEstimate:true}});setStartPrompt(null);
 };
 const stop=async(taskId:string)=>{const id=data.timers.find(t=>t.taskId===taskId)?.sessionId;if(!id)return;await run({type:'focus.stop',payload:{sessionId:id}});dialog({type:'summary',id});};
 const moveWithKey=async(node:OutlineNode,direction:'in'|'out'|'up'|'down')=>{
  if(busy)return;
  if(layout==='flat'){notify('切换到树形视图后，可以用快捷键调整层级与顺序。');return;}
  const siblings=rows.map(r=>r.node).filter(n=>n.parentId===node.parentId),at=siblings.findIndex(n=>n.id===node.id),previous=siblings[at-1];
  if(direction==='out'){const parent=node.parentId?index.nodes.get(node.parentId):null;if(!parent||reviewRoot===node.id){notify('当前事项已经在可调整范围的最外层。');return;}await move(node.id,parent.id,'after');}
  else if(direction==='in'){if(!previous||!canContain(previous)){notify('前面没有可接收子项的同级事项。');return;}await move(node.id,previous.id,'inside');}
  else {if(effectiveSort(filter)!=='manual'){notify('当前按条件自动排序；改为手动顺序后可上移或下移。');return;}const target=direction==='up'?previous:siblings[at+1];if(!target)return;await move(node.id,target.id,direction==='up'?'before':'after');}
  requestAnimationFrame(()=>{if(!scroll.current?.closest('[hidden],[inert]')&&document.activeElement?.closest('[data-outline-id]'))rowRefs.current.get(node.id)?.focus();});
 };
 const keyboard=(e:React.KeyboardEvent<HTMLDivElement>,node:OutlineNode)=>{
  if(!(e.target as HTMLElement).closest('input,textarea,select,[contenteditable=true]')){if(primaryModifier(e)&&e.key.toLowerCase()==='a'){e.preventDefault();selection.all();return;}if(primaryModifier(e)&&(isMac()?e.shiftKey&&e.key.toLowerCase()==='x':e.key===' ')){e.preventDefault();selection.toggle(node.id,selected);return;}if(e.key==='Escape'&&batch.size){e.preventDefault();selection.clear();return;}}
  const action=outlineKeyAction(e);if(!action)return;e.preventDefault();e.stopPropagation();
  if(action==='create-child'||action==='create-sibling'){const place=capturePosition(node);create(action==='create-child'?node.id:place.parentId,action==='create-child'?null:place.afterId);return;}
  if(action==='undo'){if(canUndo)quiet(undo());return;}
  if(action==='menu'){const box=e.currentTarget.getBoundingClientRect();openMenu(node.id,box.left+50,box.top+30);return;}
  if(action==='rename'){setRename({id:node.id,signal:rename.signal+1});return;}
  if(['indent','outdent','move-up','move-down'].includes(action)){quiet(moveWithKey(node,({'indent':'in','outdent':'out','move-up':'up','move-down':'down'} as const)[action as 'indent'|'outdent'|'move-up'|'move-down']));return;}
  if(action==='toggle-timer'||action==='stop-timer'){if(busy||isInformation(node.record as Task))return;const timer=data.timers.find(t=>t.taskId===node.id);if(action==='stop-timer'){if(timer)quiet(stop(node.id));}else if(timer&&!timer.paused)quiet(run({type:'focus.pause',payload:{sessionId:timer.sessionId}}));else quiet(start(node));return;}
  if((action==='complete'||action==='delete')&&batch.size>1){setBatchAction(action==='delete'?'delete':[...batch].every(id=>(index.nodes.get(id)?.record as Task)?.status!=='open')?'open':'done');return;}
   if(action==='complete'||action==='delete'){if(busy)return;const task=node.record as Task;if(task.deletedAt){notify('此事项在回收站中，可从右键菜单恢复。');return;}if(action==='complete'&&isInformation(task))return;setRetained(null);quiet(requestState(node.id,action==='delete'?'delete':task.status==='open'?'done':'reopen'));return;}
  const at=rows.findIndex(r=>r.node.id===node.id),children=index.children.get(node.id)??[];let next:string|undefined;
  if(action==='next')next=rows[at+1]?.node.id;
  if(action==='previous')next=rows[at-1]?.node.id;
  if(action==='first')next=rows[0]?.node.id;
  if(action==='last')next=rows.at(-1)?.node.id;
  if(action==='expand'){if(children.length&&collapsed.has(node.id))toggle(node.id);else if(children.length)next=rows[at+1]?.node.id;}
  if(action==='collapse'){if(children.length&&!collapsed.has(node.id))toggle(node.id);else next=node.parentId??undefined;}
  if(next){if(e.shiftKey)selection.range(next,node.id);else selection.select(next);select(next);focusRow(next);}
 };
 const endDrag=()=>{setDragging(null);setDrop(null);if(hover.current){clearTimeout(hover.current.timer);hover.current=null;}};
 const pointerStart=(e:React.PointerEvent,node:OutlineNode)=>{if(e.button!==0||busy)return;e.preventDefault();e.stopPropagation();e.currentTarget.setPointerCapture(e.pointerId);pointer.current={id:node.id,x:e.clientX,y:e.clientY,started:false,drop:null,root:false};select(node.id);};
 const pointerMove=(e:React.PointerEvent)=>{const current=pointer.current;if(!current)return;if(!current.started&&Math.hypot(e.clientX-current.x,e.clientY-current.y)<6)return;
   current.started=true;setDragging(current.id);const hit=document.elementFromPoint(e.clientX,e.clientY),row=hit?.closest<HTMLElement>('[data-outline-id]'),id=row?.dataset.outlineId;current.root=!!hit?.closest('[data-root-drop]');current.drop=null;
   if(id&&row&&!branchIds(index,current.id).has(id)){const box=row.getBoundingClientRect(),ratio=(e.clientY-box.top)/box.height;current.drop={id,position:(effectiveSort(filter)!=='manual'||layout==='flat')?'inside':ratio<.25?'before':ratio>.75?'after':'inside'};
     if(hover.current?.id!==id){if(hover.current)clearTimeout(hover.current.timer);hover.current={id,timer:setTimeout(()=>setCollapsed(previous=>{const next=new Set(previous);next.delete(id);return next;}),650)};}}
   setDrop(current.drop);const pane=scroll.current?.getBoundingClientRect();if(pane){if(e.clientY<pane.top+45)scroll.current?.scrollBy(0,-18);if(e.clientY>pane.bottom-45)scroll.current?.scrollBy(0,18);}
 };
 const pointerEnd=(e:React.PointerEvent)=>{const current=pointer.current;pointer.current=null;if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);if(current?.started){if(current.drop)quiet(move(current.id,current.drop.id,current.drop.position));else if(current.root)quiet(move(current.id,null,'root'));}endDrag();};
 const responsibility=rulesFor(filter).children.find(c=>c.kind==='condition'&&c.field==='responsibility'&&c.op==='is');const responsibilityView=responsibility?.kind==='condition'?String(responsibility.value):'';
 const visibleTasks=rows.length;

 const creatorDepth=creator?.parentId?Math.min(outlinePath(index,creator.parentId).length,8):0;
 const creatorRow=creator&&<form ref={creatorForm} key="creator" className="inline-creator in-tree" aria-busy={creating} style={{paddingLeft:12+creatorDepth*18}} onSubmit={e=>quiet(saveNew(e))}><div><span>{captureItem(newTitle,creator.itemType).itemType==='note'?'新增笔记／信息 · ':''}{creator.parentId?`在「${index.nodes.get(creator.parentId)?.title}」下新增`:'新增最外层事项'}</span><input ref={createInput} aria-label="新事项名称" value={newTitle} readOnly={creating} maxLength={2000} autoComplete="off" onChange={e=>{if(!createPending.current)setNewTitle(e.target.value);}} onKeyDown={e=>{e.stopPropagation();if(e.nativeEvent.isComposing){if(e.key==='Enter')e.preventDefault();return;}if(createPending.current){if(['Escape','Enter','Tab'].includes(e.key))e.preventDefault();return;}if(e.key==='Tab'&&!primaryModifier(e)&&!e.altKey){e.preventDefault();nestCreator(e.shiftKey);return;}if(e.key==='Enter'&&primaryModifier(e)){quiet(saveNew(e,true));return;}if(e.key==='Escape')cancelCreation();}} placeholder="Enter 继续 · Tab 调整层级 · - 笔记 · o 事件"/><CapturePreview model={capture} data={data} parentId={creator.parentId} show={!!newTitle.trim()} disabled={creating}/>{createError&&<span role="alert">{createError}</span>}{creating&&<span role="status">正在保存…</span>}</div><Button primary disabled={!captureItem(newTitle,creator.itemType).title||busy||creating} type="submit">{creating?'正在保存…':'保存并继续'}</Button><Button type="button" disabled={!captureItem(newTitle,creator.itemType).title||busy||creating} onClick={e=>quiet(saveNew(e,true))}>保存并结束</Button><Button subtle type="button" disabled={creating} onClick={cancelCreation}>{newTitle.trim()?'取消':'关闭'}</Button></form>;

 const displayOptions=<><Button subtle aria-label="展开全部" title="展开全部" onClick={()=>setCollapsed(new Set())}><ArrowExpand20Regular/>展开全部</Button><Button subtle aria-label="折叠全部" title="折叠全部" onClick={()=>setCollapsed(new Set(index.nodes.keys()))}><ArrowMinimize20Regular/>折叠全部</Button>{view==='all'&&<label><input type="checkbox" aria-label="显示已完成" checked={showDone} disabled={!canToggleCompleted(filter)} title={!canToggleCompleted(filter)?'结束状态已由筛选条件指定，请在筛选中调整':undefined} onChange={e=>setShowDone(e.target.checked)}/>显示已完成</label>}</>;
 const commonActions=<>{data.stateUndoLabel&&<Button subtle disabled={busy} onClick={()=>quiet(run({type:'item.undo'}))}>撤销状态调整</Button>}{canUndo&&<Button subtle disabled={!canUndo||busy} onClick={()=>quiet(undo())} title={data.undoLabel?`撤销：${data.undoLabel}`:'没有可撤销的整理操作'} aria-label="撤销整理操作"><ArrowUndo20Regular/></Button>}{!showDetails&&<Button subtle onClick={()=>setShowDetails(true)}>详情</Button>}</>;

 return <section className={`tree-page ${showDetails&&selectedNode?'with-details':''}`} onFocusCapture={e=>{if((e.target as HTMLElement).matches('input,textarea')&&(e.target as HTMLElement).closest('.inline-editor,.task-inspector'))setEditing(true);}} onBlurCapture={()=>{requestAnimationFrame(()=>{const el=document.activeElement;if(!el?.matches('input,textarea')||!el.closest('.inline-editor,.task-inspector'))setEditing(false);});}} onKeyDown={e=>{if(e.key==='Escape')setMenu(null);if(primaryModifier(e)&&e.key.toLowerCase()==='z'&&!(e.target as HTMLElement).closest('input,textarea,select')){e.preventDefault();e.stopPropagation();if(canUndo)quiet(undo());}}}>
  {!reviewRoot&&<WorkspaceContext><h2 className="context-heading">视图</h2><nav className="context-nav" aria-label="事项视图"><button className={!activeView&&todayFocus&&!filter.trash?'selected':''} aria-pressed={!activeView&&todayFocus&&!filter.trash} onClick={openTodayFocus}><Star20Filled/><span>今日重点</span><small>{focusCount}</small></button>{([['all','全部事项',TextBulletListTree20Regular],['actions','可执行',Play20Filled],['unplanned','未定开始',Calendar20Regular],['done','已完成',Checkmark20Regular]] as const).map(([id,label,Icon])=><button key={id} className={!activeView&&view===id&&!filter.trash&&!todayFocus&&!responsibilityView?'selected':''} aria-pressed={!activeView&&view===id&&!filter.trash&&!todayFocus&&!responsibilityView} onClick={()=>{setActiveView('');setView(id);}}><Icon/><span>{label}</span></button>)}{(['handed-off','following'] as const).map(kind=><button key={kind} className={!activeView&&responsibilityView===kind?'selected':''} aria-pressed={!activeView&&responsibilityView===kind} onClick={()=>{setActiveView('');updateFilter(withRules({...emptyFilter(),sort:'smart'},group([condition('status','is','handed-off'),condition('responsibility','is',kind)])));}}>{kind==='handed-off'?'已交接':'待他人跟进'}</button>)}{state.views.map(v=><button key={v.id} className={activeView===v.id?'selected':''} aria-pressed={activeView===v.id} onClick={()=>{setActiveView(v.id);updateFilter(structuredClone(v.filter));}}><Bookmark20Regular/><span>{v.name}</span></button>)}</nav><section className="context-section"><h2 className="context-heading">范围</h2><nav className="context-nav" aria-label="事项范围"><button className={!focus?'scope-selected':''} onClick={()=>setFocus(null)}><Folder20Regular/><span>全部范围</span></button>{index.ordered.filter(n=>(n.record as Task).isProject&&!(n.record as Task).archived&&!(n.record as Task).deletedAt).map(n=><button className={focus===n.id?'selected':''} key={n.id} onClick={()=>setFocus(n.id)} title={outlinePath(index,n.id).map(p=>p.title).join(' / ')}><Folder20Regular/><span>{n.title}</span></button>)}</nav></section><section className="context-section"><nav className="context-nav"><button aria-pressed={!!filter.trash} className={filter.trash?'selected':''} onClick={()=>updateFilter({...filter,trash:!filter.trash})}><Folder20Regular/><span>回收站</span></button><button onClick={()=>dialog({type:'shortcuts'})}><Keyboard20Regular/><span>快捷键</span></button></nav></section></WorkspaceContext>}
  <div className="tree-workspace"><div className="outline-workspace">
   {!reviewRoot&&<header className="tree-page-header"><h1>{filter.trash?'回收站':state.views.find(v=>v.id===activeView)?.name??(todayFocus?'今日重点':responsibilityView==='handed-off'?'已交接':responsibilityView==='following'?'待他人跟进':{all:'全部事项',actions:'可执行',unplanned:'未定开始',done:'已完成'}[view]??'事项')}{focus&&<small className="view-scope-title"> · {index.nodes.get(focus)?.title}</small>} <span>{match.size} 个事项</span></h1><div className="actions"><label className="outline-search"><Search20Regular/><input aria-label="在事项树中搜索" maxLength={120} placeholder="搜索事项" value={query} onChange={e=>setQuery(e.target.value)}/>{query&&<button aria-label="清除搜索" onClick={()=>setQuery('')}><Dismiss20Regular/></button>}</label><Button title={`在「${newPosition.parentId?index.nodes.get(newPosition.parentId)?.title:'最外层'}」中新增${newPosition.afterId?'，位于所选事项之后':''}`} onClick={createHere}><Add20Regular/>新增事项</Button></div></header>}
   {!reviewRoot&&<ItemFilters matchCount={match.size} closedMatchCount={closedMatchCount} filter={filter} onChange={updateFilter} activeView={activeView} onView={setActiveView} onTagsChanged={next=>{setFilter(next);setRetained(selected);}} options={displayOptions} trailing={<div className="outline-toolbar"><div className="outline-tools">{commonActions}</div></div>} leading={<div className="layout-switch"><button aria-label="树形视图" aria-pressed={layout==='tree'} onClick={()=>setLayout('tree')}><TextBulletListTree20Regular/>树形</button><button aria-label="平铺视图" aria-pressed={layout==='flat'} onClick={()=>setLayout('flat')}><TextBulletListTree20Regular/>平铺</button></div>}/>}
   {batch.size>0&&<div className="batch-toolbar"><strong role="status" aria-live="polite">已选 {batch.size} 条</strong><Button onClick={()=>setBatchAction('tag')}>整理所选…</Button><Button subtle onClick={()=>selection.clear()}>取消选择</Button><small>{shortcutLabel('Ctrl 单击增减 · Shift 连选 · 筛选变化清除选择')}</small></div>}
   {(reviewRoot||focus)&&<div className="outline-scope-row"><div className="outline-scope">{reviewRoot?<span>完整子树 · 独立于工作视图筛选</span>:focus?<>{outlinePath(index,focus).map((n,i)=><React.Fragment key={n.id}>{i>0&&<ChevronRight20Regular/>}<button onClick={()=>setFocus(n.id)}>{n.title}</button></React.Fragment>)}<Button subtle aria-label="清除范围" onClick={()=>setFocus(null)}>清除范围</Button></>:null}</div></div>}
   {reviewRoot&&<div className="outline-toolbar"><div className="outline-tools">{displayOptions}{commonActions}</div></div>}
   {filter.trash&&<p className="retained-notice">回收站：选中事项可恢复；原记录、层级和投入仍保留。</p>}{pinned&&<p className="retained-notice" role="status">“{index.nodes.get(pinned)?.title}”不符合当前筛选，暂时保留；选择其他事项后隐藏。</p>}
   {startPrompt&&index.nodes.get(startPrompt)&&<div className="start-prompt"><div><strong>先估计「{index.nodes.get(startPrompt)!.title}」</strong><span>任务总估计与本次 {state.settings.targetMinutes} 分钟目标分别记录</span></div><input type="number" min={1} max={1440} aria-label="开始前的任务估计" value={startEstimate} onChange={e=>setStartEstimate(e.target.value)}/><span>分钟</span><Button primary disabled={busy} onClick={()=>quiet(start(index.nodes.get(startPrompt)!,Number(startEstimate)))}>估计并开始</Button><Button subtle disabled={busy} onClick={()=>quiet(start(index.nodes.get(startPrompt)!,undefined,true))}>稍后估计，先开始</Button><Button subtle aria-label="关闭开始提示" onClick={()=>setStartPrompt(null)}><Dismiss20Regular/></Button></div>}
   <div className="tree-columns"><span className="col-name">事项与子项进度</span><span className="col-status" title="待启动：尚无投入；进行中：本项或子项已有启动／投入；逾期另行提示">状态</span><span className="col-tags">标签</span><span className="col-estimate" title="原始估计保留；剩余估计在详情中调整">估计</span><span className="col-effort" title="包含子项的投入，每条记录只计一次">投入</span><span className="col-planned" title="打算哪一天开始；不会自动启动计时">计划开始</span><span className="col-deadline">截止时间</span><span className="col-actions" aria-label="操作"/></div>
   <div className={`outline-scroll ${rowWindow.enabled?'virtual-outline':''}`} ref={scroll} onScroll={e=>{rowWindow.onScroll();if(!reviewRoot&&treeViewMemory){treeViewMemory.scrollTop=e.currentTarget.scrollTop;writeLocal(workspaceKey,treeViewMemory);}}} role="tree" aria-multiselectable="true" aria-label="事项树" onContextMenu={e=>{e.preventDefault();openMenu(null,e.clientX,e.clientY);}}>
    {rowWindow.top>0&&<div role="presentation" style={{height:rowWindow.top}}/>}{rows.slice(rowWindow.start,rowWindow.end).map(({node,depth,position,size})=>{const task=node.record as Task,presentation=presentations.get(node.id)!,stats=index.stats.get(node.id)!,children=index.children.get(node.id)??[],activeTimer=data.timers.find(t=>t.taskId===node.id),isActive=!!activeTimer,path=outlinePath(index,node.id).map(n=>n.title).join(' / ');
    return <React.Fragment key={node.id}><div ref={el=>{if(el)rowRefs.current.set(node.id,el);else rowRefs.current.delete(node.id);}} className={`outline-row ${node.kind} ${presentation.ownOverdue?'row-overdue':''} ${isDailyFocus(task,localDate(data.now))?'daily-focus-row-mark':''} item-${task.itemType??'task'} ${depth===0?'root-row':''} ${children.length?'branch-row':''} ${task.status==='cancelled'||task.status==='handed-off'||task.availability==='paused'?'muted-row':''} ${selected===node.id?'selected':''} ${batch.has(node.id)?'batch-selected':''} ${task?.status==='done'?'completed':''} ${!match.has(node.id)?'context-row':''} ${isActive?'timing':''} ${dragging===node.id?'dragging':''} ${drop?.id===node.id?'drop-'+drop.position:''}`} data-outline-id={node.id} role="treeitem" aria-level={depth+1} aria-posinset={position} aria-setsize={size} aria-selected={batch.size?batch.has(node.id):selected===node.id} aria-expanded={children.length?!collapsed.has(node.id):undefined} aria-label={`${node.title}${isDailyFocus(task,localDate(data.now))?'，今日重点':''}${task?.status==='done'?'，已完成':''}`} tabIndex={selected===node.id||!selectedVisible&&rows[0]?.node.id===node.id?0:-1} onClick={e=>{if(!(e.target as HTMLElement).closest('button,input,textarea,select'))selectRow(node.id,e);}} onKeyDown={e=>withOperationEntry('items.keyboard',()=>keyboard(e,node))} onContextMenu={e=>{e.preventDefault();e.stopPropagation();openMenu(node.id,e.clientX,e.clientY);}}>
     <div className="tree-name" style={{paddingLeft:8+Math.min(depth,7)*18}}>{depth>0&&<span className="tree-guides" aria-hidden="true" style={{width:Math.min(depth,7)*18}}/>}<button type="button" className="drag-grip" aria-label={`拖动${node.title}`} title="拖动调整嵌套；选中行后 Tab 缩进、Shift+Tab 提升层级" disabled={busy} onClick={e=>e.stopPropagation()} onPointerDown={e=>pointerStart(e,node)} onPointerMove={pointerMove} onPointerUp={pointerEnd} onPointerCancel={()=>{pointer.current=null;endDrag();}}><ReOrderDotsVertical20Regular/></button><button className={`tree-chevron ${children.length?'':'invisible'}`} aria-label={`${collapsed.has(node.id)?'展开':'折叠'}${node.title}`} tabIndex={children.length?0:-1} onClick={e=>{e.stopPropagation();toggle(node.id);}}>{collapsed.has(node.id)?<ChevronRight20Regular/>:<ChevronDown20Regular/>}</button>
      {isInformation(task)?<span className="note-marker" title={isEvent(task)?'事件':'笔记／信息'}>{isEvent(task)?<Calendar20Regular/>:<Subtract20Regular/>}</span>:task?<input type="checkbox" checked={task.status==='done'} disabled={busy||task.status==='cancelled'||task.status==='handed-off'||!!task.deletedAt} aria-label={`完成${node.title}`} onClick={e=>e.stopPropagation()} onChange={()=>{select(node.id);setRetained(null);quiet(requestState(node.id,task.status==='open'?'done':'reopen'));}}/>:<span className="folder-icon">{collapsed.has(node.id)?<Folder20Regular/>:<FolderOpen20Regular/>}</span>}
      <div className="tree-title" title={`${path} · ${sortReason(node.id)}`}>{task?.isProject&&<span className="folder-icon" title="项目标记"><Folder20Regular/></span>}{!task.isProject&&presentation.branch&&<span className="branch-icon" title="包含子事项的分支"><TextBulletListTree20Regular/></span>}{isDailyFocus(task,localDate(data.now))&&<FocusBadge/>}<EditValue label={`名称 ${node.title}`} value={node.title} double onSelect={e=>selectRow(node.id,e)} editSignal={rename.id===node.id?rename.signal:0} onSave={value=>patch(node,'title',value)}/>{node.id===pinned&&<small className="filter-row-reason" title="不符合当前筛选，编辑期间暂时保留，不计入匹配数量">暂留</small>}{task.recurrence&&<span className="repeat-badge" title={recurrenceLabel(task.recurrence)} aria-label={`重复：${recurrenceLabel(task.recurrence)}`}><ArrowRepeatAll20Regular/></span>}{presentation.branch&&<small className="branch-count" aria-label={`包含 ${presentation.childCount} 个直接子项`} title={`${presentation.childCount} 个直接子项；整个分支的子事项完成 ${presentation.descendantDone} / ${presentation.descendantTasks}`}>{presentation.descendantTasks?`${presentation.descendantDone}/${presentation.descendantTasks}`:`${presentation.childCount} 子项`}</small>}{depth>7&&<small>第 {depth+1} 层</small>}{layout==='flat'&&<small className="flat-path">{path}</small>}{isActive&&<small className="row-timer"><RowTimer id={node.id}/></small>}</div>
     </div>
     <div className="tree-status">{!match.has(node.id)&&node.id!==pinned?<span className="filter-path-context" title={`仅展示匹配子项的层级，本身不匹配，不计入结果数。本项状态：${presentation.label}`}>父级路径</span>:<ItemStatus value={presentation}/>}</div>
     <div className="tree-tags">{task?.tagIds?.slice(0,2).map(id=>{const tag=state.tags.find(t=>t.id===id);return tag&&<button className="row-tag" title={tag.name} key={id} onClick={e=>{e.stopPropagation();if(reviewRoot)select(node.id);else updateFilter(replaceFields(filter,['tags'],[condition('tags','all',[id])]));}}>{tag.name}</button>;})}{(task?.tagIds?.length??0)>2&&<small>+{task!.tagIds!.length-2}</small>}</div>
     <div className="tree-estimate">{task&&!isInformation(task)?(task.estimateMinutes===null?<EditValue label={`估计 ${node.title}`} value="" empty="填写" type="number" onSelect={()=>select(node.id)} onSave={value=>patch(node,'estimateMinutes',value?Number(value):null)}/>:<span title="原始估计已保留；在详情中调整剩余估计">{task.estimateMinutes} 分</span>):<span className="muted">—</span>}</div>
     <div className="tree-effort" title={`本项 ${minuteText(stats.ownMs)}；子项 ${minuteText(stats.totalMs-stats.ownMs)}`}>{stats.totalMs?minuteText(stats.totalMs):<span className="muted">—</span>}{children.length>0&&stats.totalMs>0&&<small>含子项</small>}</div>
     <div className="tree-date planned">{task&&!isInformation(task)?<EditValue label={`计划开始 ${node.title}`} value={task.plannedDate??''} empty="未设置" type="date" onSelect={()=>select(node.id)} onSave={value=>patch(node,'plannedDate',value||null)}/>:<span className="muted">—</span>}</div>
     <div className={`tree-deadline ${presentation.ownOverdue?'overdue':''}`}>{presentation.ownOverdue&&<span className="overdue-label">逾期</span>}{!presentation.ownOverdue&&presentation.descendantOverdue>0&&<span className="child-overdue" title={`${presentation.descendantOverdue} 个子事项已逾期`}>子项逾期 {presentation.descendantOverdue}</span>}{task&&!isInformation(task)?(!presentation.descendantOverdue||task.dueAt?<DeadlineEditor label={`截止时间 ${node.title}`} value={task.dueAt} compact onSelect={()=>select(node.id)} onSave={value=>patch(node,'dueAt',value)}/>:null):<span className="muted">—</span>}</div>
     <div className="tree-row-actions">{task?.status==='open'&&!isInformation(task)&&<button className={`row-start ${isActive?'active':''}`} disabled={busy||!!blockedReason(index,node.id)} aria-label={`开始${node.title}`} title={blockedReason(index,node.id)??(activeTimer?.paused?'恢复这个事项的计时':'直接开始计时')} onClick={e=>{e.stopPropagation();quiet(start(node));}}><Play20Filled/><span>{isActive?(activeTimer!.paused?'恢复':'计时中'):'开始'}</span></button>}</div>
    </div>{creatorAfter===node.id&&creatorRow}</React.Fragment>;})}
    {creator&&!creatorAfter&&creatorRow}
    {rowWindow.bottom>0&&<div role="presentation" style={{height:rowWindow.bottom}}/>}
    {!state.tasks.length&&!creator&&<div className="tree-empty"><p>右键树中的位置创建事项，或从第一件事开始。</p><Button onClick={()=>create(defaultCaptureParent(state))}>创建第一件事</Button></div>}
    {!rows.length&&<div className="tree-empty"><h3>没有符合条件的事项</h3><p>可以清除筛选，或在空白处右键创建事项。</p>{!reviewRoot&&<Button onClick={()=>{setActiveView('');updateFilter(emptyFilter());}}>查看全部事项</Button>}</div>}
    {dragging&&<div className="root-drop" data-root-drop="true">拖到这里，移到最外层</div>}
   </div>
   {batchAction&&<BatchOrganize ids={[...batch].filter(id=>index.nodes.has(id))} initialAction={batchAction} onClose={()=>setBatchAction(null)} onDone={()=>selection.clear()}/>}
   <footer className="outline-footer"><span role="status">{dragging?drop?`${drop.position==='inside'?'作为子项放入':drop.position==='before'?'放到前面':'放到后面'}：${index.nodes.get(drop.id)?.title}`:'拖到行中间成为子项，上下边缘调整顺序':moveMessage||(visibleTasks===match.size?`${match.size} 个事项`:`显示 ${visibleTasks} 行 · 匹配 ${match.size} 个事项`)}</span></footer>
  </div>
  {showDetails&&selectedNode&&<ItemInspector reviewing={!!reviewRoot} scopeRoot={reviewRoot} key={selectedNode.id} tab={detailTab} setTab={setDetailTab} node={selectedNode} index={index} onClose={()=>setShowDetails(false)} onSelect={id=>{select(id);setRetained(id);reveal(id);}} onFocus={id=>{setFocus(id);setCollapsed(new Set());}} onStart={()=>start(selectedNode)} onStop={()=>stop(selectedNode.id)} onPatch={(field,value)=>patch(selectedNode,field,value)} onEdit={()=>setRetained(selectedNode.id)}/>}
  </div>
  {menu&&<OutlineMenu key={menu.id??'root'} menu={menu} index={index} close={()=>setMenu(null)} create={create} rename={id=>setRename({id,signal:rename.signal+1})} patch={patch} scopeId={focus} stateAction={(id,action)=>{setRetained(null);return requestState(id,action);}} undo={undo} restoreFocus={()=>{if(scroll.current?.closest('[hidden],[inert]'))return;( (rowRefs.current.get(menu.id??'')?.isConnected?rowRefs.current.get(menu.id??''):null)??scroll.current?.querySelector<HTMLElement>('[data-outline-id][tabindex="0"]')??scroll.current?.querySelector<HTMLElement>('[data-outline-id]'))?.focus();}}/>}

 </section>;
}


function RowTimer({id}:{id:string}){const {data}=useJournal(),timer=data.timers.find(t=>t.taskId===id);return <>{timer?.paused?'已暂停':timer?timerText(timer.durationMs):''}</>;}
