import type {ItemType} from '../core/item-kind';
import type {JournalState} from '../core/types';
import {decodeCaptureDraft,encodeCaptureDraft,type CaptureDraftState} from './capture-draft-storage';
import {readLocal,writeLocal} from './workspace-state';

export type OutlineCreator={parentId:string|null;afterId:string|null;itemType:ItemType};
export const outlineCreatedEvent='journal:outline-created';
export const outlineCreationSignature=(creator:OutlineCreator|null,capture:CaptureDraftState)=>JSON.stringify({creator,capture:encodeCaptureDraft(capture)});
export function readOutlineCreation(key:string,state:JournalState,now:string,fallbackParent:string|null){
 const saved=readLocal<any>(key,null);if(!saved||typeof saved!=='object'||!saved.creator||typeof saved.capture!=='string')return null;
 const capture=decodeCaptureDraft(saved.capture,now);if(!capture.raw.trim())return null;
 const usable=(id:unknown)=>state.tasks.find(t=>t.id===id&&t.status==='open'&&!t.deletedAt&&!t.archived);
 const original=saved.creator.parentId,parentId=original===null?null:usable(original)?.id??fallbackParent;
 const after=state.tasks.find(t=>t.id===saved.creator.afterId&&(t.parentId??null)===parentId&&!t.deletedAt&&!t.archived);
 const creator:OutlineCreator={parentId,afterId:after?.id??null,itemType:['task','note','event'].includes(saved.creator.itemType)?saved.creator.itemType:'task'};
 return {creator,capture,relocated:original!==parentId};
}
export function writeOutlineCreation(key:string,creator:OutlineCreator|null,capture:CaptureDraftState){
 writeLocal(key,creator&&capture.raw.trim()?{creator,capture:encodeCaptureDraft(capture)}:null);
}
/** A save may finish after page navigation; never discard a newer draft at the same location. */
export function consumeOutlineCreation(key:string,signature:string,next:OutlineCreator|null){
 if(JSON.stringify(readLocal(key,null))===signature)writeLocal(key,null);
 window.dispatchEvent(new CustomEvent(outlineCreatedEvent,{detail:{key,signature,next}}));
}
