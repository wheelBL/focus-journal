import {operationEntry} from './operation-entry';
import type { JournalApi, Snapshot, Command } from '../core/types';
declare global { interface Window { journal?: JournalApi } }
async function request(url:string,command?:Command):Promise<Snapshot>{
  const response=await fetch(url,command?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(command)}:undefined);
  const data=await response.json();if(!response.ok)throw new Error(data.error??'数据服务不可用。');return data;
}
export const isDesktop=!!window.journal;
const transport:JournalApi=window.journal??{
  snapshot:()=>request('/api/snapshot'),clock:async()=>{const r=await fetch('/api/clock');if(!r.ok)throw new Error('计时服务不可用。');return r.json();},command:c=>request('/api/command',c),
  exportData:async format=>{const res=await fetch(`/api/export/${format}`);const blob=await res.blob();const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`专注记.${format}`;a.click();URL.revokeObjectURL(url);return '已导出';},
  importData:async()=>{throw new Error('请在桌面应用中恢复备份。');},openDataFolder:async()=>{throw new Error('请在桌面应用中打开数据文件夹。');},windowAction:async()=>{}
};

const command:JournalApi['command']=async value=>transport.command({...value,meta:{...value.meta,source:value.meta?.source??'user',entry:value.meta?.entry??operationEntry()}});
export const api:JournalApi=new Proxy({} as JournalApi,{get:(_target,key)=>key==='command'?command:Reflect.get(transport,key)});
