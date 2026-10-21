import {contextBridge,ipcRenderer} from 'electron';
async function invoke(channel:string,...args:unknown[]){try{return await ipcRenderer.invoke(channel,...args);}catch(e){throw new Error((e instanceof Error?e.message:String(e)).replace(/^Error invoking remote method '[^']+': (?:Error: )?/,''));}}
contextBridge.exposeInMainWorld('reminder',{
 snapshot:()=>invoke('reminder:snapshot'),
 action:(action:unknown,sessionId:unknown)=>invoke('reminder:action',action,sessionId),
 onChanged:(callback:(value:unknown)=>void)=>{const listener=(_event:unknown,value:unknown)=>callback(value);ipcRenderer.on('reminder:changed',listener);return()=>ipcRenderer.removeListener('reminder:changed',listener);},
 audioResult:(id:unknown,error:unknown)=>ipcRenderer.send('reminder:audio-result',id,error)
});
