export interface WorkArea {x:number;y:number;width:number;height:number}
export interface TimerPosition {x:number;y:number}
export const FLOATING_WIDTH=320,FLOATING_HEIGHT=64;
export function timerBounds(area:WorkArea,position:TimerPosition|null,height=FLOATING_HEIGHT){
 const width=Math.min(FLOATING_WIDTH,area.width),h=Math.min(height,area.height);
 const x=position?.x??area.x+area.width-width-8,y=position?.y??area.y+Math.round(area.height*.28);
 return {x:Math.round(Math.max(area.x,Math.min(x,area.x+area.width-width))),y:Math.round(Math.max(area.y,Math.min(y,area.y+area.height-h))),width,height:h};
}
export function parseTimerPosition(value:unknown):TimerPosition|null{
 if(!value||typeof value!=='object')return null;
 const {x,y}=value as TimerPosition;return Number.isFinite(x)&&Number.isFinite(y)&&Math.abs(x)<100000&&Math.abs(y)<100000?{x:Math.round(x),y:Math.round(y)}:null;
}
