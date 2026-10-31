import {useSyncExternalStore} from 'react';
import {defaultAppearance,parseAppearance,type Appearance,type AppearanceApi} from '../core/appearance';
declare global {interface Window {journalAppearance?:AppearanceApi}}
const key='journal.appearance';
const listeners=new Set<()=>void>();
let value:Appearance={...defaultAppearance},initialized=false;
const media=(query:string)=>typeof matchMedia==='function'?matchMedia(query):null;
function apply(){
 document.documentElement.dataset.theme=value.theme==='system'?(media('(prefers-color-scheme: dark)')?.matches?'dark':'light'):value.theme;
 document.documentElement.dataset.motion=value.motion;
 window.dispatchEvent(new Event('journal:appearance'));
}
function receive(next:unknown){
 try{const parsed=parseAppearance(next),changed=JSON.stringify(parsed)!==JSON.stringify(value);value=changed?parsed:value;try{window.localStorage.setItem(key,JSON.stringify(value));}catch{/* The desktop preference remains durable. */}apply();if(changed)for(const notify of listeners)notify();}catch{/* Ignore malformed cache or storage events. */}
}
export function initializeAppearance(){
 if(initialized)return;initialized=true;
 try{value=parseAppearance(JSON.parse(window.localStorage.getItem(key)??'null'));}catch{/* New profile defaults to system. */}
 apply();
 media('(prefers-color-scheme: dark)')?.addEventListener('change',apply);
 media('(prefers-reduced-motion: reduce)')?.addEventListener('change',apply);
 if(window.journalAppearance){window.journalAppearance.onChanged(receive);void window.journalAppearance.get().then(receive).catch(()=>{});}
 else window.addEventListener('storage',event=>{if(event.key===key)try{receive(JSON.parse(event.newValue??'null'));}catch{}});
}
export async function setAppearance(next:Appearance){
 const parsed=parseAppearance(next);
 if(window.journalAppearance)receive(await window.journalAppearance.set(parsed));
 else {window.localStorage.setItem(key,JSON.stringify(parsed));receive(parsed);}
}
const subscribe=(listener:()=>void)=>{listeners.add(listener);return()=>{listeners.delete(listener);};};
export function useAppearance(){return useSyncExternalStore(subscribe,()=>value,()=>defaultAppearance);}
export function motionAllowed(){return document.documentElement.dataset.motion!=='reduce'&&(document.documentElement.dataset.motion==='full'||!media('(prefers-reduced-motion: reduce)')?.matches);}
