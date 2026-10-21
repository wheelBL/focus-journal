import type {JournalState,Task} from './types';
import {outlineIndex,outlinePath} from './outline';

/** Inbox is only the initial capture destination, never a protected node. */
export function defaultCaptureParent(state:JournalState):string|null {
 const index=outlineIndex(state);
 if(!index.nodes.has('inbox'))return null;
 return outlinePath(index,'inbox').every(n=>{const t=n.record as Task;return t.status==='open'&&!t.deletedAt&&!t.archived;})?'inbox':null;
}
