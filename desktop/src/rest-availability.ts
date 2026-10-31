import type {Snapshot} from '../core/types';

export function restUnavailableReason(data:Snapshot,excludingSession?:string){
 const count=data.timers.filter(timer=>!timer.paused&&timer.sessionId!==excludingSession).length;
 if(count)return `还有 ${count} 个计时器在运行，先暂停或结束后可休息。`;
 if(data.state.settings.rest?.phase==='running')return '休息计时已在进行中，可在上方查看剩余时间。';
 return null;
}
