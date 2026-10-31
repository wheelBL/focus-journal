import {useEffect,useRef,useState} from 'react';

/** A settings write owns its submitted values until it succeeds or fails. */
export function useSettingsAction(){
 const active=useRef(true),pending=useRef(false),[saving,setSaving]=useState(false),[error,setError]=useState('');
 useEffect(()=>{active.current=true;return()=>{active.current=false;};},[]);
 const perform=async<T,>(work:()=>Promise<T>,complete?:(value:T)=>void)=>{
  if(pending.current)return;
  pending.current=true;setSaving(true);setError('');
  try{const value=await work();if(active.current)complete?.(value);}
  catch(e){if(active.current)setError(e instanceof Error?e.message:String(e));}
  finally{pending.current=false;if(active.current)setSaving(false);}
 };
 return {perform,saving,error};
}
