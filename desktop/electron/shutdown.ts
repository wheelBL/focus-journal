/** Persist and close the journal before disposing anything the running app needs.
 * A failed persistence attempt propagates so the caller can cancel quit and retry.
 * Once it succeeds, each remaining resource is independently cleaned up. */
export function shutdownJournal(persist:()=>void,markClosed:()=>void,cleanup:ReadonlyArray<readonly [string,()=>void]>,onCleanupError:(name:string,error:unknown)=>void):void {
 persist();
 markClosed();
 for(const [name,dispose] of cleanup){try{dispose();}catch(error){try{onCleanupError(name,error);}catch{/* Reporting must not stop the remaining cleanup. */}}}
}
