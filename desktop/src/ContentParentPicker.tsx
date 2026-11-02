import React,{useState} from 'react';
import type {JournalState} from '../core/types';
import {groupChoices} from './content-page-state';
import {Field} from './ui';

export function ContentParentPicker({state,value,onChange,excludeInbox=false}:{state:JournalState;value:string|null;onChange:(id:string|null)=>void;excludeInbox?:boolean}){
 const [query,setQuery]=useState(''),choices=groupChoices(state,excludeInbox),matches=choices.filter(c=>c.path.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
 const selected=choices.find(c=>c.id===value);
 return <div className="content-parent-picker"><Field label="归属分组"><input type="search" aria-label="搜索完整分组路径" value={query} onChange={e=>setQuery(e.target.value)} placeholder="搜索完整分组路径"/></Field><select aria-label="归属分组" value={value??'__root__'} onChange={e=>onChange(e.target.value==='__root__'?null:e.target.value)}><option value="__root__">最外层</option>{value&&!selected&&<option disabled value={value}>原分组不可用，请重新选择</option>}{selected&&!matches.some(c=>c.id===value)&&<option value={selected.id}>{selected.path}</option>}{matches.map(c=><option key={c.id} value={c.id}>{c.path}</option>)}</select><small className="muted">当前归属：{selected?.path??(value?'原分组不可用，请重新选择':'最外层')}</small>{query&&!matches.length&&<small role="status">没有匹配的分组；可修改搜索或选择最外层。</small>}</div>;
}
