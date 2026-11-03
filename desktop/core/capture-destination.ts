import type {JournalState,Task} from './types';
import {outlineIndex,outlinePath} from './outline';
import {captureDestinations,type CaptureDraft} from './capture';
import {required} from './validation';

/** Inbox is only the initial capture destination, never a protected node. */
export function defaultCaptureParent(state:JournalState):string|null {
 const index=outlineIndex(state);
 if(!index.nodes.has('inbox'))return null;
 return outlinePath(index,'inbox').every(n=>{const t=n.record as Task;return t.status==='open'&&!t.deletedAt&&!t.archived;})?'inbox':null;
}

export type CaptureDestination='auto'|'inbox'|'unfiled';
/** Explicit destinations win; auto honours a supplied path or parent, then chooses by type.
 * An omitted destination preserves the legacy command's explicit-parent/root semantics. */
export function resolveCaptureParent(state:JournalState,payload:Record<string,unknown>,draft:CaptureDraft):{parentId:string|null;useAfterId:boolean}{
 const destination=payload.destination;
 if(destination!==undefined&&destination!=='auto'&&destination!=='inbox'&&destination!=='unfiled')throw new Error('保存去向无效。');
 if(destination==='unfiled')return {parentId:null,useAfterId:false};
 if(destination==='inbox'){const inbox=defaultCaptureParent(state);if(!inbox)throw new Error('收件箱不可用，请先恢复收件箱或选择其他去向。');return {parentId:inbox,useAfterId:false};}
 if(draft.parentQuery){const matches=captureDestinations(state,required(draft.parentQuery,2000));if(matches.length!==1)throw new Error(matches.length?'归属有重名，请填写完整路径。':'找不到归属，请检查路径。');return {parentId:matches[0].id,useAfterId:false};}
 if(payload.parentId!==undefined)return {parentId:payload.parentId===null?null:required(payload.parentId,100),useAfterId:true};
 if(destination==='auto'&&(draft.itemType==='task'||draft.itemType==='note'))return {parentId:defaultCaptureParent(state),useAfterId:true};
 return {parentId:null,useAfterId:true};
}
