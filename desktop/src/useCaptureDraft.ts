import {useEffect,useMemo,useRef,useState} from 'react';
import {parseCapture,type CaptureDraft} from '../core/capture';
import {captureDraftErrors} from '../core/capture-validation';
import type {ItemType} from '../core/item-kind';
import type {CaptureDraftState} from './capture-draft-storage';
import type {CaptureDestination} from '../core/capture-destination';

/** Source parsing, field corrections and literal choices are separate from presentation. */
export function useCaptureDraft(value:string,now:string,type:ItemType='task',initial?:CaptureDraftState){
 const [anchor,setAnchor]=useState(initial?.anchor??now),[overrides,setOverrides]=useState<Partial<CaptureDraft>>(initial?.overrides??{}),[literals,setLiterals]=useState<string[]>(initial?.literals??[]),prior=useRef(value);
 const [destination,setDestination]=useState<CaptureDestination>(initial?.destination??'auto');
 useEffect(()=>{if(prior.current!==value){const before=parseCapture(prior.current,anchor,type).draft,next=parseCapture(value,now,type).draft;if(before.parentQuery!==next.parentQuery||before.itemType!==next.itemType)setDestination('auto');prior.current=value;setAnchor(now);setOverrides({});setLiterals([]);}},[value,now]);
 const parsed=useMemo(()=>parseCapture(value,anchor,type,literals),[value,anchor,type,literals]);
 const draft={...parsed.draft,...overrides};
 // Correcting one field cannot suppress syntax errors belonging to another field.
 const unresolved=parsed.issues.filter(issue=>issue.field===null||!Object.hasOwn(overrides,issue.field));
 const persistent=useMemo<CaptureDraftState>(()=>({raw:value,anchor,overrides,literals,destination}),[value,anchor,overrides,literals,destination]);
 return {draft,persistent,destination,setDestination,tokens:parsed.tokens,hints:parsed.hints,errors:[...new Set([...unresolved.map(i=>i.message),...captureDraftErrors(draft)])],setField:<K extends keyof CaptureDraft>(key:K,value:CaptureDraft[K])=>{if(key==='parentQuery'||key==='itemType')setDestination('auto');setOverrides(old=>({...old,[key]:value}));},literal:(key:string)=>{setLiterals(old=>[...old,key]);setOverrides({});setDestination('auto');},reset:()=>{setOverrides({});setLiterals([]);setDestination('auto');}};
}
