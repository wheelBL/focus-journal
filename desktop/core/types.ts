export type Id = string;
export const JOURNAL_SCHEMA_VERSION=20;
export interface Project { id: Id; name: string; description: string; archived: boolean; createdAt: string; parentId?: Id | null; order?: number }
export interface Task {
  groupHistory?:{initialEstimateMinutes:number|null;reminder:ItemReminder|null;reviewSchedule:ReviewSchedule|null};
  ownership?:import('./activity').Ownership|null;completionBy?:import('./activity').CompletionBy;
  id: Id; projectId: Id|null; title: string; itemType?:'task'|'note'|'event'|'group'; eventAt?:string|null; eventEnd?:string|null; focusDate?:string|null; updatedAt?:string; isProject?: boolean; description?: string; archived?: boolean; availability?:'active'|'paused'; deletedAt?:string|null; reviewSchedule?:ReviewSchedule|null; reminder?:ItemReminder|null; tagIds?: Id[]; outcome: string; nextAction: string; parentId?: Id | null; order?: number;
  recurrence?:Recurrence|null; recurrenceNextId?:Id|null; recurrencePreviousId?:Id|null;
  estimateMinutes: number | null; plannedDate: string | null; /** YYYY-MM-DD means before local midnight; ISO means an exact time. */ dueAt?: string | null; status: 'open' | 'done' | 'cancelled' | 'handed-off';
  createdAt: string; startedAt: string | null; completedAt: string | null;
}
export interface Segment { start: string; end: string; durationMs: number }
export interface Session {
  id: Id; taskId: Id | null; date: string; start: string | null; end: string | null;
  status: 'running' | 'paused' | 'ended'; targetMinutes: number; /** Active effort already counted when the current reminder target began. */ targetOffsetMs?:number;
  segments: Segment[]; durationMs: number; manual: boolean; summary: string;
  reminder?: {state:'pending'|'snoozed'|'dismissed';snoozedUntil:string|null};
  reminded: boolean; recovered: boolean; updatedAt: string;
}
export interface DeletedSession extends Session { deletedAt:string }
export interface Note { id: Id; kind: 'note' | 'event' | 'migration'; text: string; taskId: Id | null; createdAt: string }
export interface Estimate { id: Id; taskId: Id; remainingMinutes: number; spentMinutes?:number; reason: string; createdAt: string }
export interface Review { id: Id; taskId: Id; outcome: string; reason: string; adjustment: string; updatedAt: string }
export interface ReviewSchedule {enabled:boolean;nextDate:string|null;interval:{unit:'once'|'days'|'weeks'|'months';count:number};lastReviewedAt:string|null}
export interface ItemReviewLog {id:Id;itemId:Id;batchId:string;reviewedAt:string;note:string;nextDate:string|null;beforeSchedule:ReviewSchedule;afterSchedule:ReviewSchedule;beforeAvailability:'active'|'paused';afterAvailability:'active'|'paused';undoneAt:string|null}
export interface MoveRecord {id:Id;itemId:Id;fromParent:Id|null;toParent:Id|null;fromProject:Id|null;toProject:Id|null;fromOrder:number;toOrder:number;createdAt:string}
export interface Recurrence {mode:'calendar'|'completion';unit:'day'|'week'|'month'|'year';interval:number;anchor:string;weekdays:number[];until:string|null;reminderOffsetMs?:number}
export interface Audit { id: Id; entityId: Id; before: string; reason: string; createdAt: string }
export interface ItemReminder {at:string;state:'scheduled'|'pending'|'snoozed'|'dismissed';snoozedUntil:string|null}
export interface ReminderSettings {sound:boolean;volume:number;repeatSeconds:number}
export interface ReminderView {kind?:'task'|'break';breakMinutes?:number;canRest?:boolean;continuationTitle?:string;remindAt?:string;sessionId:Id;taskId:Id|null;title:string;durationMs:number;targetMinutes:number;targetOffsetMs?:number}
export interface ReminderWindowState {alerts:ReminderView[];settings:ReminderSettings;preview:boolean;cue:{id:number;volume:number}|null}
export type ReminderAction='stop-rest'|'continue'|'restart-break'|'choose'|'stop'|'snooze'|'dismiss'|'open'|'close-preview';
export interface ReminderApi {snapshot():Promise<ReminderWindowState>;action(action:ReminderAction,sessionId?:string):Promise<void>;onChanged(callback:(state:ReminderWindowState)=>void):()=>void;audioResult(id:number,error?:string):void}
export interface RestCycle {id:string;phase:'offered'|'running'|'ready';sessionId:Id|null;minutes:number;notify:boolean}
export interface Settings { rest?:RestCycle|null; reminders?:ReminderSettings; targetMinutes: number; breakMinutes: number; selectedTaskId: Id | null; breakUntil: string | null }
export interface Tag { id: Id; name: string }
export type FilterField = 'responsibility'|'assignee'|'completionBy'|'handedOffAt'|'focusDate'|'itemType'|'status'|'availability'|'plannedDate'|'dueAt'|'completedAt'|'tags'|'title'|'description'|'isProject'|'estimateMinutes'|'actualMinutes'|'scope'|'actionable';
export type FilterOperator = 'is'|'is-not'|'before'|'after'|'period'|'between'|'set'|'unset'|'all'|'any'|'none'|'contains'|'not-contains'|'greater'|'less';
export type DateAnchor = 'now'|'today'|'tomorrow'|'week-start'|'next-week'|'month-start'|'next-month';
export type DatePoint = {kind:'relative';anchor:DateAnchor;days?:number}|{kind:'fixed';date:string};
export interface FilterCondition { kind:'condition'; field:FilterField; op:FilterOperator; value?:string|number|boolean|string[]|DatePoint; end?:number|DatePoint }
export interface FilterGroup { kind:'group'; mode:'all'|'any'; children:FilterRule[] }
export type FilterRule = FilterCondition|FilterGroup;
// Legacy fields remain readable so existing saved views and backups retain their meaning.
// When rules is present it is the single source of truth for conditions; query/scope/sort remain view context.
export interface ItemFilter { trash?:boolean; view: 'all'|'actions'|'unplanned'|'done'; query: string; showDone: boolean; scopeId: Id|null; tagIds: Id[]; tagMode: 'all'|'any'; planned: 'any'|'today'|'through-today'|'unplanned'; completed: 'any'|'today'|'this-week'; due: 'any'|'today'|'this-week'|'overdue'; projectsOnly: boolean; rules?:FilterGroup; sort?:'smart'|'manual'|'due'|'planned'|'title'|'created' }
export interface SavedView { id: Id; name: string; filter: ItemFilter }
export interface JournalState {
  schemaVersion: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | 16 | 17 | 18 | 19 | 20; activities?:import('./activity').BusinessActivity[];itemReviews:ItemReviewLog[]; moves:MoveRecord[]; tags: Tag[]; views: SavedView[]; projects: Project[]; tasks: Task[]; sessions: Session[]; deletedSessions:DeletedSession[]; notes: Note[];
  estimates: Estimate[]; reviews: Review[]; audit: Audit[]; settings: Settings;
}
export interface TimerView { sessionId: Id; taskId: Id | null; durationMs: number; targetMinutes: number; targetOffsetMs?:number; paused: boolean; recovered: boolean }
export interface Snapshot { revision?:number; stateUndoLabel?:string|null; undoLabel?: string|null; state: JournalState; timers: TimerView[]; focusReminder?: string;itemNotice?:string; /** Legacy single-session projection. Commands must identify a session when several exist. */ timer: TimerView | null; now: string; dataPath: string; demo: boolean }
export interface ClockSnapshot {revision:number;now:string;timers:TimerView[];sessions:Session[]}
export interface CapturePreferences {shortcut:string;registered:boolean;error?:string}
export interface WorkClock { now(): number; monotonic(): number }
export interface JournalStore {
  load(): JournalState; save(state: JournalState): void; close(): void; path: string;
  /** Atomically persist elapsed time for existing sessions; no domain or schema changes. */
  saveSessionCheckpoint?(sessions:readonly Session[]):void;
}
export interface Command { type: string; payload?: Record<string, unknown>;meta?:{source?:'user'|'ai'|'api'|'sync'|'system';entry?:string;version?:string;aiRunId?:string} }
export interface JournalApi {
  onEditAction?(callback:(action:import('./desktop-platform').DesktopEditAction)=>void):()=>void;
  editText?(action:import('./desktop-platform').DesktopEditAction):Promise<void>;
  usage?:import('./usage-types').UsageBridge;
  localApi?:import('./local-api-types').LocalApiBridge;
  sync?:import('./sync-types').SyncApi;
  previewReminder?(settings:ReminderSettings,mode:'sound'|'card'):Promise<void>;
  snapshot(): Promise<Snapshot>; command(command: Command): Promise<Snapshot>;
  clock?():Promise<ClockSnapshot>;
  capture?:{open():Promise<void>;close():Promise<void>;preferences():Promise<CapturePreferences>;configure(shortcut:string):Promise<CapturePreferences>};
  exportData(format: 'json' | 'csv'): Promise<string | null>;
  importData(): Promise<Snapshot | null>;
  openDataFolder(): Promise<void>; windowAction(action: 'minimize' | 'maximize' | 'close' | 'quit'): Promise<void>;
  onOpenSession?(callback:(id:string)=>void):()=>void;
  onOpenItem?(callback:(id:string)=>void):()=>void;
  onChanged?(callback: () => void): () => void;
}
export function emptyState(): JournalState {
  const createdAt='1970-01-01T00:00:00.000Z';
  const inbox:Task={id:'inbox',title:'收件箱',description:'还没有归属项目的事项',isProject:true,projectId:'inbox',parentId:null,order:0,createdAt,updatedAt:createdAt,archived:false,availability:'active',deletedAt:null,itemType:'task',tagIds:[],outcome:'',nextAction:'',estimateMinutes:null,plannedDate:null,dueAt:null,status:'open',startedAt:null,completedAt:null,reviewSchedule:null,reminder:null,eventAt:null,eventEnd:null,focusDate:null};
  return { schemaVersion: JOURNAL_SCHEMA_VERSION,activities:[],  itemReviews: [], moves: [], tags: [], views: [], projects: [{ id: inbox.id, name: inbox.title, description: inbox.description!, archived: false, createdAt, parentId:null, order:0 }], tasks: [inbox], sessions: [], deletedSessions:[], notes: [], estimates: [], reviews: [], audit: [], settings: { targetMinutes: 25, breakMinutes: 5, selectedTaskId: null, breakUntil: null, rest:null } };
}
export function localDate(value: Date | string | number = new Date()): string {
  const d = new Date(value); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
export function shiftDate(date: string, days: number): string { const d = new Date(`${date}T12:00:00`); d.setDate(d.getDate()+days); return localDate(d); }
export function taskMs(state: JournalState, taskId: string): number { return state.sessions.filter(s=>s.taskId===taskId).reduce((n,s)=>n+s.durationMs,0); }
export function sessionMsOnDate(session: Session, date: string): number {
  if (!session.segments.length) return session.date === date ? session.durationMs : 0;
  const start = new Date(`${date}T00:00:00`).getTime(); const end = new Date(`${shiftDate(date,1)}T00:00:00`).getTime();
  return session.segments.reduce((sum,seg)=>{
    const a=Date.parse(seg.start), b=Date.parse(seg.end);
    if (b<=a) return sum+(localDate(a)===date?seg.durationMs:0);
    return sum+seg.durationMs*Math.max(0,Math.min(end,b)-Math.max(start,a))/(b-a);
  },0);
}
