import React,{useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {Button,deadlineInputValue,deadlinePayload,deadlineText} from './ui';
import {useDialogAction} from './useDialogAction';

export function DeadlineFields({value,onChange,label='截止时间'}:{value:string;onChange:(v:string)=>void;label?:string}){
 const [mode,setMode]=useState<'date'|'datetime-local'>(value.includes('T')?'datetime-local':'date');
 const changeMode=(next:'date'|'datetime-local')=>{setMode(next);if(value)onChange(next==='date'?value.slice(0,10):value.includes('T')?value:`${value}T00:00`);};
 return <div className="deadline-fields"><label className="field"><span>截止方式</span><select aria-label={`${label}方式`} value={mode} onChange={e=>changeMode(e.target.value as typeof mode)}><option value="date">某日之前（不含当天）</option><option value="datetime-local">精确到时间</option></select></label>
  <label className="field"><span>{mode==='date'?'截止日期':'截止时间'}</span><input aria-label={label} type={mode} value={value} onChange={e=>onChange(e.target.value)}/></label>
  <small className="deadline-help">{mode==='date'?value?`须在 ${value} 00:00 前完成，不含当天。`:'选择哪一天，就在那一天 00:00 前完成；可留空。':`最晚在该时刻完成；按本机时区 ${Intl.DateTimeFormat().resolvedOptions().timeZone} 显示，可留空。`}</small>
 </div>;
}

export function DeadlineEditor({value,label,onSave,onSelect,compact=false}:{value:string|null|undefined;label:string;onSave:(value:string|null)=>Promise<unknown>;onSelect?:()=>void;compact?:boolean}){
 const [position,setPosition]=useState<{left:number;top:number}|null>(null),[draft,setDraft]=useState(''),action=useDialogAction();
 const panel=useRef<HTMLFormElement>(null),trigger=useRef<HTMLButtonElement>(null);
 const close=()=>action.dismiss(()=>{setPosition(null);trigger.current?.focus();});
 useEffect(()=>{if(!position)return;panel.current?.querySelector('input')?.focus();const outside=(e:PointerEvent)=>{if(!panel.current?.contains(e.target as Node)&&!trigger.current?.contains(e.target as Node))action.dismiss(()=>setPosition(null));};document.addEventListener('pointerdown',outside);return()=>document.removeEventListener('pointerdown',outside);},[!!position]);
 const save=async()=>{if(await action.perform(()=>onSave(deadlinePayload(draft))))close();};
 const display=deadlineText(value);
 return <><button ref={trigger} disabled={action.saving} className={`editable-value ${!value?'empty-value':''}`} title={`${display} · 点击编辑`} aria-label={`${label}：${display}`} onClick={e=>{e.stopPropagation();onSelect?.();setDraft(deadlineInputValue(value));const r=e.currentTarget.getBoundingClientRect();setPosition({left:Math.max(8,Math.min(r.right-296,window.innerWidth-304)),top:Math.max(8,Math.min(r.bottom+4,window.innerHeight-306))});}}>{compact&&value?display.slice(5):display}</button>
  {position&&createPortal(<form ref={panel} className="deadline-popover" role="dialog" aria-label={`${label}编辑`} aria-busy={action.saving} style={position} onClick={e=>e.stopPropagation()} onKeyDown={e=>{e.stopPropagation();if(e.nativeEvent.isComposing){if(e.key==='Enter')e.preventDefault();return;}if(e.key==='Escape'){e.preventDefault();close();}}} onSubmit={e=>{e.preventDefault();e.stopPropagation();void save();}}><fieldset className="dialog-fields" disabled={action.saving}>
   <DeadlineFields value={draft} onChange={setDraft} label={label}/>{action.error&&<p role="alert" className="form-error">{action.error}</p>}{action.saving&&<p role="status" className="muted">正在保存截止时间…</p>}<footer><Button type="button" subtle disabled={action.saving} onClick={()=>setDraft('')}>清除</Button><Button type="button" subtle disabled={action.saving} onClick={close}>取消</Button><Button primary type="submit" disabled={action.saving}>保存截止</Button></footer></fieldset>
  </form>,document.body)}
 </>;
}
