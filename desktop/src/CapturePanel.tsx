import React,{useEffect,useRef,useState} from 'react';
import {Dismiss20Regular} from '@fluentui/react-icons';
import {api} from './api';
import type {Snapshot} from '../core/types';
import {SemanticCapture} from './SemanticCapture';
export default function CapturePanel(){
 const [data,setData]=useState<Snapshot|null>(null),[error,setError]=useState(''),[saving,setSaving]=useState(false),pending=useRef(false);
 // Refreshing destinations must not move the caret out of a preview correction.
 const refresh=()=>void api.snapshot().then(s=>{setData(s);setError('');}).catch(e=>setError(e.message));
 const close=()=>{if(!pending.current)void api.capture?.close();};
 useEffect(()=>{refresh();const off=api.onChanged?.(refresh);const key=(e:KeyboardEvent)=>{if(e.key==='Escape'&&!e.isComposing){e.preventDefault();close();}};window.addEventListener('keydown',key);return()=>{off?.();window.removeEventListener('keydown',key);};},[]);
 return <div className="capture-panel" aria-busy={saving}><header><strong>快速记录</strong><button aria-label="关闭快速记录并保留草稿" disabled={saving} onClick={close}><Dismiss20Regular/></button></header><main>{error&&<p role="alert">{error}<button onClick={refresh}>重试</button></p>}{data?<SemanticCapture data={data} run={c=>api.command(c)} autoFocus storageKey="journal.capture.draft" onSavingChange={value=>{pending.current=value;setSaving(value);}} onSaved={()=>void api.capture?.close()}/>:<p>正在打开记录…</p>}</main></div>;
}
