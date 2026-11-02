import React,{useRef,useState} from 'react';
import {inboxReviewSettings} from '../core/inbox-review';
import {Button,Field,Modal,useWorkspaceJournal} from './ui';

/** Inbox review is one quiet daily reminder, only when there is something to organize. */
export function InboxReviewControl(){
 const {data,run,busy}=useWorkspaceJournal(),settings=inboxReviewSettings(data.state);
 const [open,setOpen]=useState(false),[enabled,setEnabled]=useState(settings.enabled),[time,setTime]=useState(settings.time),[saving,setSaving]=useState(false),[error,setError]=useState('');
 const pending=useRef(false),trigger=useRef<HTMLButtonElement>(null);
 const close=()=>{if(pending.current)return;setOpen(false);requestAnimationFrame(()=>trigger.current?.focus());};
 const save=async(e:React.FormEvent)=>{e.preventDefault();if(pending.current||busy)return;pending.current=true;setSaving(true);setError('');try{await run({type:'inbox-review.settings',payload:{enabled,time}});pending.current=false;setOpen(false);requestAnimationFrame(()=>trigger.current?.focus());}catch(e){setError((e as Error).message);}finally{pending.current=false;setSaving(false);}};
 return <><button ref={trigger} className="subtle inbox-review-control" onClick={()=>{setEnabled(settings.enabled);setTime(settings.time);setError('');setOpen(true);}} aria-label="收件箱整理提醒设置">整理提醒 {settings.enabled?settings.time:'已关闭'}</button>{open&&<Modal title="收件箱整理提醒" busy={saving} onClose={close}><form onSubmit={e=>void save(e)}><fieldset className="dialog-fields" disabled={saving}><label className="inbox-review-enabled"><input type="checkbox" checked={enabled} onChange={e=>setEnabled(e.target.checked)}/>每日提醒整理收件箱</label><Field label="提醒时间"><input type="time" aria-label="收件箱整理提醒时间" required value={time} disabled={!enabled} onChange={e=>setTime(e.target.value)}/></Field><p className="muted">仅在有待整理内容时提醒；收件箱为空时保持安静。</p>{error&&<p className="form-error" role="alert">{error}</p>}<footer className="modal-actions"><Button type="button" subtle disabled={saving} onClick={close}>取消</Button><Button primary type="submit" disabled={busy||saving||!time}>{saving?'正在保存…':'保存'}</Button></footer></fieldset></form></Modal>}</>;
}
