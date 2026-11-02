import {Timer20Regular,Folder24Regular,CalendarLtr24Regular,ClipboardTask24Regular,Settings24Regular,Note24Regular,Alert24Regular,MailInbox24Regular} from '@fluentui/react-icons';
import {Today} from './Today';
import {Projects} from './Projects';
import {deferredModule} from './DeferredModule';

const Notes=deferredModule<{}>('笔记',()=>import('./Notes').then(module=>({default:module.Notes})));
const Reminders=deferredModule<{}>('提醒',()=>import('./Reminders').then(module=>({default:module.Reminders})));
const Inbox=deferredModule<{}>('收件箱',()=>import('./Inbox').then(module=>({default:module.Inbox})));
const Calendar=deferredModule<{}>('日历',()=>import('./Calendar').then(module=>({default:module.Calendar})));
const Review=deferredModule<{}>('回顾',()=>import('./Review').then(module=>({default:module.Review})));
const Settings=deferredModule<{}>('设置',()=>import('./Settings').then(module=>({default:module.Settings})));
export const SearchResults=deferredModule<{query:string}>('搜索',()=>import('./SearchResults').then(module=>({default:module.SearchResults})));

/** Built-in screen identity, navigation and loading live together; domain commands remain in the service. */
export const modules=[
 {id:'today',name:'今日',icon:Timer20Regular,View:Today},
 {id:'inbox',name:'收件箱',icon:MailInbox24Regular,View:Inbox,preload:Inbox.preload},
 {id:'projects',name:'任务',icon:Folder24Regular,View:Projects},
 {id:'notes',name:'笔记',icon:Note24Regular,View:Notes,preload:Notes.preload},
 {id:'reminders',name:'提醒',icon:Alert24Regular,View:Reminders,preload:Reminders.preload},
 {id:'calendar',name:'日历',icon:CalendarLtr24Regular,View:Calendar,preload:Calendar.preload},
 {id:'review',name:'回顾',icon:ClipboardTask24Regular,View:Review,preload:Review.preload},
 {id:'settings',name:'设置',icon:Settings24Regular,View:Settings,preload:Settings.preload}
] as const;
