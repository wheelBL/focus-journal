import {localDate,shiftDate,type Session} from './types';
export function weekRange(date:string){const weekday=(new Date(`${date}T12:00:00`).getDay()+6)%7,start=shiftDate(date,-weekday);return {start,end:shiftDate(start,6)};}
export function periodEffort(sessions:Session[],start:string,end:string){
 const from=Date.parse(`${start}T00:00:00`),to=Date.parse(`${shiftDate(end,1)}T00:00:00`),intervals:[number,number][]=[];
 let cumulativeMs=0,unplacedMs=0;
 for(const s of sessions){
  if(!s.segments.length){if(s.date>=start&&s.date<=end){cumulativeMs+=s.durationMs;unplacedMs+=s.durationMs;}continue;}
  for(const seg of s.segments){const a=Date.parse(seg.start),b=Date.parse(seg.end),left=Math.max(a,from),right=Math.min(b,to);
   if(b<=a){if(localDate(a)>=start&&localDate(a)<=end)cumulativeMs+=seg.durationMs;continue;}
   if(right>left){cumulativeMs+=seg.durationMs*(right-left)/(b-a);intervals.push([left,right]);}
  }
 }
 intervals.sort((a,b)=>a[0]-b[0]);let coveredMs=0,left=0,right=0;
 for(const [a,b] of intervals){if(a>right){coveredMs+=right-left;left=a;right=b;}else right=Math.max(right,b);}coveredMs+=right-left;
 return {cumulativeMs,coveredMs,unplacedMs};
}
