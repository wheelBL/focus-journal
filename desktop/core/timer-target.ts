/** The work already recorded is independent from the next focus reminder. */
export function timerTargetMs(timer:{targetMinutes:number;targetOffsetMs?:number}){
 return (timer.targetOffsetMs??0)+timer.targetMinutes*60000;
}
