import {localDate,shiftDate,type Session} from './types';
export function weekRange(date:string){const weekday=(new Date(`${date}T12:00:00`).getDay()+6)%7,start=shiftDate(date,-weekday);return {start,end:shiftDate(start,6)};}
export function periodEffort(sessions:Session[],start:string,end:string){
 const {intervals,...summary}=periodEffortIndex(sessions,start,end);return summary;
}
export interface EffortPeriod {cumulativeMs:number;coveredMs:number;unplacedMs:number;intervals:[number,number][]}
/** Retain an interval union so clock updates can merge live effort without reparsing history. */
export function periodEffortIndex(sessions:Session[],start:string,end:string):EffortPeriod{
 const from=Date.parse(`${start}T00:00:00`),to=Date.parse(`${shiftDate(end,1)}T00:00:00`),intervals:[number,number][]=[];
 let cumulativeMs=0,unplacedMs=0;
 for(const s of sessions){
  if(!s.segments.length){if(s.date>=start&&s.date<=end){cumulativeMs+=s.durationMs;unplacedMs+=s.durationMs;}continue;}
  for(const seg of s.segments){const a=Date.parse(seg.start),b=Date.parse(seg.end),left=Math.max(a,from),right=Math.min(b,to);
   if(b<=a){if(localDate(a)>=start&&localDate(a)<=end)cumulativeMs+=seg.durationMs;continue;}
   if(right>left){cumulativeMs+=seg.durationMs*(right-left)/(b-a);intervals.push([left,right]);}
  }
 }
 return mergeEffortPeriods([{cumulativeMs,unplacedMs,coveredMs:0,intervals}]);
}
export function mergeEffortPeriods(periods:EffortPeriod[]):EffortPeriod{
 const intervals=periods.flatMap(p=>p.intervals).sort((a,b)=>a[0]-b[0]),merged:[number,number][]=[];
 for(const [left,right] of intervals){const previous=merged.at(-1);if(previous&&left<=previous[1])previous[1]=Math.max(previous[1],right);else merged.push([left,right]);}
 return {cumulativeMs:periods.reduce((n,p)=>n+p.cumulativeMs,0),unplacedMs:periods.reduce((n,p)=>n+p.unplacedMs,0),coveredMs:merged.reduce((n,[a,b])=>n+b-a,0),intervals:merged};
}
