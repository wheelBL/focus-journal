import {shiftDate} from '../core/types';

// Round to the nearest grid line: fractional layout pixels must not turn 08:00 into 07:45.
export function slotMinute(y:number,height:number){return Math.max(0,Math.min(1425,Math.round(y/Math.max(height,1)*96)*15));}
export function minuteInput(day:string,minute:number){
 if(minute>=1440)return `${shiftDate(day,1)}T00:00`;
 return `${day}T${String(Math.floor(minute/60)).padStart(2,'0')}:${String(minute%60).padStart(2,'0')}`;
}
export function selectionRange(day:string,anchor:number,edge:number){
 const from=Math.min(anchor,edge),to=Math.min(1440,Math.max(anchor,edge)+(anchor===edge?15:0));
 return {from,to,start:minuteInput(day,from),end:minuteInput(day,to)};
}
