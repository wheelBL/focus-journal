// A YYYY-MM-DD deadline means strictly before that local day's midnight.
// ISO timestamps retain the existing precise-time meaning. Never store a fake time for a date.
export const isDateDeadline=(value:string)=>/^\d{4}-\d{2}-\d{2}$/.test(value);
export function deadlineBoundary(value:string):number{return Date.parse(isDateDeadline(value)?`${value}T00:00:00`:value);}
// Use the last eligible millisecond for date comparisons: "before next Monday"
// belongs to the week that must contain the completed work, including its Sunday.
export function deadlineTime(value:string):number{return deadlineBoundary(value)-(isDateDeadline(value)?1:0);}
export function isDeadlineOverdue(value:string|null|undefined,now:string):boolean{return !!value&&Date.parse(now)>deadlineTime(value);}
export function compareDeadlines(a:string|null|undefined,b:string|null|undefined):number{return a&&b?deadlineTime(a)-deadlineTime(b):a?-1:b?1:0;}
