import {createContext} from 'react';
import type {Command,Snapshot} from '../core/types';
export type DialogSpec={type:'assign'|'calendar'|'task'|'project'|'manual'|'summary'|'review'|'estimate'|'plan'|'detail'|'state'|'start'|'repeat'|'schedule'|'remind'|'shortcuts';start?:string;end?:string;calendarMode?:'reminder'|'event'|'effort';remindAt?:string;taskId?:string;id?:string;parentId?:string;putAside?:boolean;action?:import('./ItemActions').ItemAction};
export interface AppContextValue {data:Snapshot;run:(command:Command)=>Promise<Snapshot>;dialog:(value:DialogSpec|null)=>void;notify:(text:string)=>void;busy:boolean;date:string;setDate:(date:string)=>void;navigate:(id:string)=>void}
export const AppContext=createContext<AppContextValue>(null!);
export const LiveAppContext=createContext<AppContextValue|null>(null);
