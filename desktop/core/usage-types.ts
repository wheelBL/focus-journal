import type {AiContextPreview,AiScope,AiSuggestion} from './ai-assistant-types';
import type {AiUsage} from './ai-types';
/** The only interaction payload: no text, pointer coordinates, timings or paths. */
export interface OperationSummary {operation:string;entry:string;result:'success'|'failed'|'cancelled';version:string}
/** A generated answer is not evidence that the requested suggestion was applied. */
export function aiOperationResult(operation:string,value:unknown,suggestionId?:string):OperationSummary['result']{
 const state=value as {phase?:string;suggestions?:AiSuggestion[]}|null;
 if(operation==='ai.cancel'||state?.phase==='cancelled')return 'cancelled';
 if(state?.phase==='error'||operation==='ai.apply'&&state?.suggestions?.find(s=>s.id===suggestionId)?.state!=='applied')return 'failed';
 return 'success';
}
export const entryLabels:Record<string,string>={'menu.edit':'macOS 编辑菜单','items.row':'事项行按钮','items.keyboard':'事项快捷键','items.context':'事项右键菜单','items.inspector':'右侧详情','items.inspector.ownership':'详情交接入口','items.ownership.handoff':'交接表单','items.ownership.reclaim':'重新接手表单','items.inline-capture':'树中连续新增','items.toolbar':'事项工具栏','items.filter':'事项筛选','items.view-options':'视图选项','items.inspector.more':'详情更多操作','dialog':'编辑表单','dialog.ownership':'交接表单','dialog.completion':'完成归属表单','today':'今日页面','calendar':'日历页面','navigation.primary':'主导航','navigation.sidebar':'侧栏导航','review.activity':'回顾活动记录','review.effort':'回顾投入复盘','review.items':'回顾事项审视','ai.assistant':'AI 助手','api.command':'本机 API','tray.timer':'托盘计时入口','floating.timer':'屏边计时签','capture.window':'全局快速记录','reminder.card':'到时提醒卡片','system.command':'应用内部操作','settings':'设置页面','workspace':'工作区'};
export const operationLabels:Record<string,string>={'navigation.today':'切换到今日','navigation.projects':'切换到事项','navigation.calendar':'切换到日历','navigation.review':'切换回顾方式','navigation.settings':'打开设置','filter.change':'调整筛选或排序','options.open':'展开操作选项','options.close':'收起操作选项','ai.generate':'AI 生成建议','ai.apply':'确认 AI 建议','ai.cancel':'停止 AI 生成','ai.test':'测试 AI 连接','ai.configure':'保存 AI 设置','ai.clear-key':'移除 AI 连接'};
export interface StoredOperation extends OperationSummary {id:string;at:string}
export interface AiUsageRecord {id:string;at:string;finishedAt?:string;scope:AiScope;context:AiContextPreview;prompt:string;provider:string;model:string;phase:'running'|'done'|'error'|'cancelled';text:string;error:string|null;suggestions:AiSuggestion[];usage?:AiUsage;durationMs?:number;truncated?:boolean;detailsCleared?:boolean;feedback?:'helpful'|'neutral'|'unhelpful';feedbackNote?:string}
export interface UsageSnapshot {enabled:boolean;operations:StoredOperation[];ai:AiUsageRecord[];error:string|null}
export interface UsageBridge {record(value:OperationSummary):Promise<void>;snapshot():Promise<UsageSnapshot>;configure(enabled:boolean):Promise<UsageSnapshot>;clear(kind:'operations'|'ai-text'):Promise<UsageSnapshot>;feedback(id:string,rating:'helpful'|'neutral'|'unhelpful',note:string):Promise<UsageSnapshot>;export():Promise<string|null>}
