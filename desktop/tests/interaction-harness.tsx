import React,{useState} from 'react';
import {Projects} from '../src/Projects';
import {AppContext,type AppContextValue} from '../src/ui';
import type {JournalService} from '../core/service';
export function Harness({service,messages}:{service:JournalService;messages:string[]}){
 const [data,setData]=useState(()=>service.snapshot()),[busy,setBusy]=useState(false);
 const context:AppContextValue={data,busy,date:'2026-10-19',setDate(){},navigate(){},dialog(){},notify:m=>messages.push(m),run:async command=>{setBusy(true);try{const result=service.execute(command);setData(result);if(result.focusReminder)messages.push(result.focusReminder);return result;}catch(e){messages.push((e as Error).message);throw e;}finally{setBusy(false);}}};
 return <AppContext.Provider value={context}><Projects/></AppContext.Provider>;
}
