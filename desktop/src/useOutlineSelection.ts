import {useEffect,useMemo,useRef,useState} from 'react';

/** Range anchor is independent of the focused row; hidden records are never batch targets. */
export function useOutlineSelection(ids:string[],scope:string){
 const [selection,setSelection]=useState<{scope:string;ids:Set<string>}>({scope,ids:new Set()}),anchor=useRef<string|null>(null);
 const batch=useMemo(()=>{const visible=new Set(ids);return selection.scope===scope?new Set([...selection.ids].filter(id=>visible.has(id))):new Set<string>();},[ids,selection,scope]);
 const setBatch=(next:Set<string>)=>setSelection({scope,ids:next});
 useEffect(()=>{if(selection.scope!==scope||batch.size!==selection.ids.size){anchor.current=null;setBatch(batch);}},[scope,batch,selection]);
 const select=(id:string)=>{anchor.current=id;setBatch(new Set());};
 const toggle=(id:string,current:string|null)=>{if(!ids.includes(id))return;const next=new Set(batch);if(!next.size&&current&&ids.includes(current))next.add(current);next.has(id)?next.delete(id):next.add(id);anchor.current=id;setBatch(next);};
 const range=(to:string,current:string)=>{const from=anchor.current&&ids.includes(anchor.current)?anchor.current:current,a=ids.indexOf(from),b=ids.indexOf(to);if(a<0||b<0)return;anchor.current=from;setBatch(new Set(ids.slice(Math.min(a,b),Math.max(a,b)+1)));};
 const all=()=>{anchor.current=null;setBatch(batch.size===ids.length?new Set():new Set(ids));};
 const clear=()=>{anchor.current=null;setBatch(new Set());};
 return {batch,clear,select,toggle,range,all};
}
