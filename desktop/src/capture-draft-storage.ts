import type {CaptureDraft} from '../core/capture';

export interface CaptureDraftState {raw:string;anchor:string;overrides:Partial<CaptureDraft>;literals:string[]}
interface StoredCaptureDraft extends CaptureDraftState {kind:'journal-capture-draft';version:1}

/** Keep unrecognized/invalid dates for the normal preview validation, but reject invalid field shapes. */
function safeOverrides(value:unknown):Partial<CaptureDraft>{
 if(!value||typeof value!=='object'||Array.isArray(value))return {};
 const source=value as Record<string,unknown>,result:Partial<CaptureDraft>={};
 for(const key of ['title','description'] as const)if(typeof source[key]==='string')result[key]=source[key];
 if(['task','note','event'].includes(source.itemType as string))result.itemType=source.itemType as CaptureDraft['itemType'];
 for(const key of ['parentQuery','plannedDate','dueAt','remindAt','eventAt','eventEnd'] as const)if(source[key]===null||typeof source[key]==='string')result[key]=source[key];
 if(Array.isArray(source.tagNames)&&source.tagNames.every(v=>typeof v==='string'))result.tagNames=source.tagNames;
 if(source.estimateMinutes===null||typeof source.estimateMinutes==='number'&&Number.isFinite(source.estimateMinutes))result.estimateMinutes=source.estimateMinutes;
 return result;
}

export function decodeCaptureDraft(value:string|null,now:string):CaptureDraftState{
 const fallback={raw:value??'',anchor:now,overrides:{},literals:[]};
 if(!value)return fallback;
 try{
  const saved=JSON.parse(value);
  // Legacy caches contain literal source text, which may itself happen to be JSON.
  if(!saved||saved.kind!=='journal-capture-draft')return fallback;
  return {raw:typeof saved.raw==='string'?saved.raw:'',anchor:typeof saved.anchor==='string'&&Number.isFinite(Date.parse(saved.anchor))?saved.anchor:now,overrides:safeOverrides(saved.overrides),literals:Array.isArray(saved.literals)?saved.literals.filter((v:unknown)=>typeof v==='string'):[]};
 }catch{return fallback;}
}
export function encodeCaptureDraft(draft:CaptureDraftState){
 const stored:StoredCaptureDraft={kind:'journal-capture-draft',version:1,...draft};return JSON.stringify(stored);
}
