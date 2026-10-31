import {useEffect,useMemo,useRef,useState} from 'react';
import {parseCapture,type CaptureDraft} from '../core/capture';
import {captureDraftErrors} from '../core/capture-validation';
import type {ItemType} from '../core/item-kind';
import type {CaptureDraftState} from './capture-draft-storage';

/** Source parsing, field corrections and literal choices are separate from presentation. */
export function useCaptureDraft(value:string,now:string,type:ItemType='task',initial?:CaptureDraftState){
 const [anchor,setAnchor]=useState(initial?.anchor??now),[overrides,setOverrides]=useState<Partial<CaptureDraft>>(initial?.overrides??{}),[literals,setLiterals]=useState<string[]>(initial?.literals??[]),prior=useRef(value);
 useEffect(()=>{if(prior.current!==value){prior.current=value;setAnchor(now);setOverrides({});setLiterals([]);}},[value,now]);
 const parsed=useMemo(()=>parseCapture(value,anchor,type,literals),[value,anchor,type,literals]);
 const draft={...parsed.draft,...overrides};
 // Correcting one field cannot suppress syntax errors belonging to another field.
 const unresolved=parsed.issues.filter(issue=>issue.field===null||!Object.hasOwn(overrides,issue.field));
 const persistent=useMemo<CaptureDraftState>(()=>({raw:value,anchor,overrides,literals}),[value,anchor,overrides,literals]);
 return {draft,persistent,tokens:parsed.tokens,hints:parsed.hints,errors:[...new Set([...unresolved.map(i=>i.message),...captureDraftErrors(draft)])],setField:<K extends keyof CaptureDraft>(key:K,value:CaptureDraft[K])=>setOverrides(old=>({...old,[key]:value})),literal:(key:string)=>{setLiterals(old=>[...old,key]);setOverrides({});},reset:()=>{setOverrides({});setLiterals([]);}};
}
