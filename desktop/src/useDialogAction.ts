import {useRef,useState} from 'react';

/** Keep a draft and its error visible until an asynchronous write has finished. */
export function useDialogAction(){
 const pending=useRef(false),[saving,setSaving]=useState(false),[error,setError]=useState('');
 const perform=async(action:()=>Promise<unknown>)=>{
  if(pending.current)return false;
  pending.current=true;setSaving(true);setError('');
  try{await action();return true;}
  catch(e){setError(e instanceof Error?e.message:String(e));return false;}
  finally{pending.current=false;setSaving(false);}
 };
 const dismiss=(close:()=>void)=>{if(!pending.current)close();};
 return {perform,dismiss,saving,error};
}
