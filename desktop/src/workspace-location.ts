import {localDate} from '../core/types';

export interface WorkspaceLocation {view:string;date:string;followToday:boolean;lastSeenDay:string}
export function validWorkspaceDate(value:unknown):value is string {
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
 const parsed=new Date(`${value}T12:00:00`);
 return Number.isFinite(parsed.getTime())&&localDate(parsed)===value;
}
/** Old explicit history selections stay fixed; new Today selections follow the local day. */
export function restoreLocation(value:unknown,today:string,views:readonly string[]):WorkspaceLocation {
 const saved=value&&typeof value==='object'?value as Partial<WorkspaceLocation>:{};
 const validDate=validWorkspaceDate(saved.date);
 const followToday=!validDate||saved.followToday===true||(saved.followToday!==false&&(saved.date===today||saved.date===saved.lastSeenDay));
 return {view:typeof saved.view==='string'&&views.includes(saved.view)?saved.view:'today',date:followToday?today:saved.date!,followToday,lastSeenDay:today};
}
