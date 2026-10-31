import {openDescendants} from '../core/outline';
import {useJournal} from './ui';
import type {ItemAction} from './ItemActions';

/** One completion policy for row, keyboard, menu and inspector entry points. */
export function useItemActions(){
 const {data,run,dialog,notify,busy}=useJournal();
 return async(id:string,action:ItemAction)=>{
  if(busy)return false;
  const needsImpact=action==='done'&&(!!data.state.tasks.find(t=>t.id===id)?.ownership||openDescendants(data.state,id).length>0||data.timers.some(t=>t.taskId===id));
  if((action==='done'&&!needsImpact)||action==='reopen'){
   await run(action==='reopen'&&data.state.tasks.find(t=>t.id===id)?.status==='handed-off'?{type:'item.reclaim',payload:{id}}:{type:'task.status',payload:{id,status:action==='done'?'done':'open'}});
   notify(action==='done'?'已完成，可撤销状态调整。':'已重新打开，可撤销状态调整。');return true;
  }
  dialog({type:'state',id,action});return false;
 };
}
