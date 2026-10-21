import React,{useEffect,useState} from 'react';
import {Dismiss20Regular} from '@fluentui/react-icons';
import {api} from './api';
import type {Snapshot} from '../core/types';
import {SemanticCapture} from './SemanticCapture';
export default function CapturePanel(){
 const [data,setData]=useState<Snapshot|null>(null),[error,setError]=useState('');
 const refresh=()=>void api.snapshot().then(s=>{setData(s);setError('');requestAnimationFrame(()=>document.querySelector('textarea')?.focus());}).catch(e=>setError(e.message));
 useEffect(()=>{refresh();const off=api.onChanged?.(refresh);const key=(e:KeyboardEvent)=>{if(e.key==='Escape'&&!e.isComposing){e.preventDefault();void api.capture?.close();}};window.addEventListener('keydown',key);return()=>{off?.();window.removeEventListener('keydown',key);};},[]);
 return <div className="capture-panel"><header><strong>快速记录</strong><button aria-label="关闭快速记录并保留草稿" onClick={()=>void api.capture?.close()}><Dismiss20Regular/></button></header><main>{error&&<p role="alert">{error}<button onClick={refresh}>重试</button></p>}{data?<SemanticCapture data={data} run={c=>api.command(c)} autoFocus storageKey="journal.capture.draft" onSaved={()=>void api.capture?.close()}/>:<p>正在打开记录…</p>}</main></div>;
}
