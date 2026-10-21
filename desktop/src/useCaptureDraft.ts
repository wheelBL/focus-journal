import {useEffect,useMemo,useRef,useState} from 'react';
import {parseCapture,type CaptureDraft} from '../core/capture';
import {captureDraftErrors} from '../core/capture-validation';
import type {ItemType} from '../core/item-kind';

/** Source parsing, field corrections and literal choices are separate from presentation. */
export function useCaptureDraft(value:string,now:string,type:ItemType='task'){
 const [anchor,setAnchor]=useState(now),[overrides,setOverrides]=useState<Partial<CaptureDraft>>({}),[literals,setLiterals]=useState<string[]>([]),prior=useRef(value);
 useEffect(()=>{if(prior.current!==value){prior.current=value;setAnchor(now);setOverrides({});setLiterals([]);}},[value,now]);
 const parsed=useMemo(()=>parseCapture(value,anchor,type,literals),[value,anchor,type,literals]);
 const draft={...parsed.draft,...overrides};
 // Correcting one field cannot suppress syntax errors belonging to another field.
 const unresolved=parsed.issues.filter(issue=>issue.field===null||!Object.hasOwn(overrides,issue.field));
 return {draft,tokens:parsed.tokens,hints:parsed.hints,errors:[...new Set([...unresolved.map(i=>i.message),...captureDraftErrors(draft)])],setField:<K extends keyof CaptureDraft>(key:K,value:CaptureDraft[K])=>setOverrides(old=>({...old,[key]:value})),literal:(key:string)=>{setLiterals(old=>[...old,key]);setOverrides({});},reset:()=>{setOverrides({});setLiterals([]);}};
}
