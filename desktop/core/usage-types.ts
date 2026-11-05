import type {AiContextPreview,AiScope,AiSuggestion} from './ai-assistant-types';
import {AiError,type AiUsage} from './ai-types';
/** The only interaction payload: no text, pointer coordinates, timings or paths. */
export type OperationResult='success'|'failed'|'cancelled'|'failed.validation'|'failed.conflict'|'failed.storage'|'failed.network';
export interface OperationSummary {operation:string;entry:string;result:OperationResult;version:string}
export const operationResults:OperationResult[]=['success','failed','cancelled','failed.validation','failed.conflict','failed.storage','failed.network'];
export const resultLabels:Record<OperationResult,string>={success:'成功',failed:'失败（未分类）',cancelled:'取消','failed.validation':'失败（校验）','failed.conflict':'失败（冲突）','failed.storage':'失败（存储）','failed.network':'失败（网络）'};
/** Only explicit, bounded codes are classified; arbitrary messages never enter telemetry. */
export function operationFailure(error:unknown):OperationResult {
 if(error instanceof AiError){if(error.code==='configuration'||error.code==='limit')return 'failed.validation';if(error.code==='storage')return 'failed.storage';if(error.code==='connection'||error.code==='timeout'||error.code==='unavailable')return 'failed.network';if(error.code==='cancelled')return 'cancelled';return 'failed';}
 const code=typeof error==='object'&&error!==null&&'code' in error?String((error as {code:unknown}).code):'';
 const errcode=typeof error==='object'&&error!==null&&'errcode' in error?(error as {errcode:unknown}).errcode:undefined;
 if(code==='ERR_SQLITE_ERROR'&&typeof errcode==='number'&&Number.isSafeInteger(errcode)&&errcode>=0&&[8,10,13].includes(errcode&255))return 'failed.storage';
 if(['VALIDATION_ERROR','ERR_VALIDATION'].includes(code))return 'failed.validation';
 if(['CONFLICT','ERR_CONFLICT'].includes(code))return 'failed.conflict';
 if(['ENOSPC','EACCES','EPERM','EROFS','EIO','SQLITE_FULL','SQLITE_IOERR','SQLITE_READONLY'].includes(code))return 'failed.storage';
 if(['ECONNRESET','ECONNREFUSED','ETIMEDOUT','ENETUNREACH','EHOSTUNREACH'].includes(code))return 'failed.network';
 return 'failed';
}
const knownCommands=new Set(["dependency.set", "dependency.chain", "break.acknowledge", "break.continue", "break.finish", "break.start", "break.stop", "calendar.save", "capture.create", "estimate.add", "event.save", "focus.pause", "focus.resume", "focus.set-start", "focus.start", "focus.start-unassigned", "focus.stop", "focus.switch", "history.undo", "history.redo", "inbox-review.dismiss", "inbox-review.settings", "inbox-review.snooze", "inbox.organize", "item-reminder.dismiss", "item-reminder.set", "item-reminder.snooze", "item-review.configure", "item-review.defer", "item-review.mark", "item-review.undo", "item.change", "item.completion", "item.focus", "item.handoff", "item.reclaim", "item.undo", "items.batch", "note.add", "note.create-task", "note.link-task", "note.unlink-task", "note.update", "organize.undo", "outline.create", "outline.move", "outline.patch", "outline.undo", "project.archive", "project.save", "recurrence.set", "reminder.convert", "reminder.create", "reminder.dismiss", "reminder.schedule", "reminder.settings", "reminder.snooze", "reminder.snooze-all", "reminder.stop", "reminder.update", "review.save", "session.assign", "session.delete", "session.manual", "session.restore", "session.summary", "settings.save", "tag.attach", "tag.delete", "tag.detach", "tag.rename", "task.plan", "task.save", "task.select", "task.status", "view.delete", "view.save"]);
export function semanticOperation(command:{type:string;payload?:Record<string,unknown>}):string {
 if(command.type!=='outline.patch')return knownCommands.has(command.type)?command.type:'unknown.command';
 const p=command.payload??{};
 if(p.field==='itemType')return ['task','group','note','event','reminder'].includes(String(p.value))?`item.type.${p.value}`:'item.type';
 if(p.field==='dueAt')return p.value==null||p.value===''?'item.deadline.clear':'item.deadline.set';
 if(p.field==='isProject')return p.value===true?'item.project.mark':p.value===false?'item.project.unmark':'item.project';
 const fields:Record<string,string>={title:'item.rename',description:'item.description',estimateMinutes:'item.estimate',plannedDate:'item.plan',eventAt:'item.event.start',eventEnd:'item.event.end'};
 return typeof p.field==='string'?fields[p.field]??'outline.patch':'outline.patch';
}

/** A generated answer is not evidence that the requested suggestion was applied. */
export function aiOperationResult(operation:string,value:unknown,suggestionId?:string):OperationSummary['result']{
 const state=value as {phase?:string;suggestions?:AiSuggestion[]}|null;
 if(operation==='ai.cancel'||state?.phase==='cancelled')return 'cancelled';
 if(state?.phase==='error'||operation==='ai.apply'&&state?.suggestions?.find(s=>s.id===suggestionId)?.state!=='applied')return 'failed';
 return 'success';
}
export const entryLabels:Record<string,string>={'today.ai-priorities':'今日优先级澄清','items.inspector.dependencies':'详情前置任务','items.batch.dependencies':'多选建立依赖','inbox.delete':'收件箱整理删除','inbox.restore':'收件箱恢复删除','items.keyboard.rename':'事项行快捷改名','items.context.rename':'事项右键改名','items.row.timer':'事项行开始计时','items.drag':'拖动事项','search.current.focus':'当前列表搜索框','search.global.focus':'全局搜索框','search.current.shortcut':'当前列表搜索快捷键','search.global.shortcut':'全局搜索快捷键','shortcut.create':'新增快捷键','shortcut.help':'帮助快捷键','shortcut.quit':'退出快捷键','shortcut.settings':'设置快捷键','shortcut.navigation':'导航快捷键','settings.shortcuts':'快捷键设置','menu.edit':'macOS 编辑菜单','items.row':'事项行按钮','items.keyboard':'事项快捷键','items.context':'事项右键菜单','items.inspector':'右侧详情','items.inspector.ownership':'详情交接入口','items.ownership.handoff':'交接表单','items.ownership.reclaim':'重新接手表单','items.inline-capture':'树中连续新增','items.toolbar':'事项工具栏','items.filter':'事项筛选','items.view-options':'视图选项','items.inspector.more':'详情更多操作','dialog':'编辑表单','dialog.ownership':'交接表单','dialog.completion':'完成归属表单','today':'今日页面','calendar':'日历页面','navigation.primary':'主导航','navigation.sidebar':'侧栏导航','review.activity':'回顾活动记录','review.effort':'回顾投入复盘','review.items':'回顾事项审视','ai.assistant':'AI 助手','api.command':'本机 API','tray.timer':'托盘计时入口','floating.timer':'屏边计时签','capture.window':'全局快速记录','reminder.card':'到时提醒卡片','system.command':'应用内部操作','settings':'设置页面','workspace':'未分类'};
export const operationLabels:Record<string,string>={'ai.list-models':'获取 AI 模型列表','dependency.set':'设置前置任务','dependency.chain':'建立依赖链','item.rename':'修改名称','item.estimate':'修改估计','item.plan':'修改计划','item.event.start':'修改事件开始时间','item.event.end':'修改事件结束时间','item.type':'调整内容类型','item.type.note':'转为笔记','item.type.event':'转为事件','item.type.reminder':'转为提醒','item.project':'调整项目标记','shortcut.invoke':'使用应用快捷键','navigation.inbox':'切换到收件箱','navigation.notes':'切换到笔记','navigation.reminders':'切换到提醒','item.description':'修改说明','item.deadline.set':'设置截止时间','item.deadline.clear':'清除截止时间','item.project.mark':'标记为项目','item.project.unmark':'取消项目标记','item.type.group':'转为分组','item.type.task':'转为任务','search.open':'打开搜索','settings.shortcuts.save':'保存快捷键','settings.shortcuts.clear':'清除快捷键','settings.shortcuts.reset':'恢复默认快捷键','navigation.today':'切换到今日','navigation.projects':'切换到事项','navigation.calendar':'切换到日历','navigation.review':'切换回顾方式','navigation.settings':'打开设置','filter.change':'调整筛选或排序','options.open':'展开操作选项','options.close':'收起操作选项','ai.generate':'AI 生成建议','ai.apply':'确认 AI 建议','ai.cancel':'停止 AI 生成','ai.test':'测试 AI 连接','ai.configure':'保存 AI 设置','ai.clear-key':'移除 AI 连接'};
export interface StoredOperation extends OperationSummary {id:string;at:string}
export interface AiUsageRecord {id:string;at:string;finishedAt?:string;scope:AiScope;context:AiContextPreview;prompt:string;provider:string;model:string;phase:'running'|'done'|'error'|'cancelled';text:string;error:string|null;suggestions:AiSuggestion[];usage?:AiUsage;durationMs?:number;truncated?:boolean;detailsCleared?:boolean;feedback?:'helpful'|'neutral'|'unhelpful';feedbackNote?:string}
export interface UsageSnapshot {enabled:boolean;operations:StoredOperation[];ai:AiUsageRecord[];error:string|null}
export interface UsageBridge {record(value:OperationSummary):Promise<void>;snapshot():Promise<UsageSnapshot>;configure(enabled:boolean):Promise<UsageSnapshot>;clear(kind:'operations'|'ai-text'):Promise<UsageSnapshot>;feedback(id:string,rating:'helpful'|'neutral'|'unhelpful',note:string):Promise<UsageSnapshot>;export():Promise<string|null>}
/** Designed route costs for the specified release, from the stated starting state.
 * Text entry is excluded; these are not measured user clicks or elapsed time. */
export function designedRoute(operation:string,entry:string,version:string):{steps:number;start:string}|null {
 if(!['0.35.0','0.36.0'].includes(version))return null;
 const routes:Record<string,{steps:number;start:string}>={
  'item.rename|items.keyboard.rename':{steps:2,start:'已选中事项行：F2（或配置的改名键），输入名称后确认'},
  'item.rename|items.context.rename':{steps:3,start:'指向事项行：打开右键菜单、选择改名，输入名称后确认'},
  'item.rename|items.row':{steps:2,start:'事项行可见：双击名称，输入名称后确认'},
  'focus.start|items.row.timer':{steps:1,start:'可执行事项行可见：点击开始'}
 };
 return routes[`${operation}|${entry}`]??null;
}
