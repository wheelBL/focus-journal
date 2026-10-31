import {useLayoutEffect,useRef,type RefObject} from 'react';
import {motionAllowed} from './appearance';

/** Only component transitions call this module; clocks and DOM mutations do not. */
const active=new Map<Animation,HTMLElement>();
const ease='cubic-bezier(.2,.75,.25,1)';
export function animateElement(element:HTMLElement|null,frames:Keyframe[],duration=170){
 if(!element?.isConnected||!motionAllowed()||typeof element.animate!=='function')return;
 for(const [animation,target] of active)if(target===element)animation.cancel();
 const animation=element.animate(frames,{duration,easing:ease});active.set(animation,element);
 void animation.finished.catch(()=>{}).finally(()=>active.delete(animation));return animation;
}
if(typeof window!=='undefined')window.addEventListener('journal:appearance',()=>{if(!motionAllowed())for(const animation of active.keys())animation.cancel();});
export function useEnterMotion(ref:RefObject<HTMLElement|null>,identity:unknown){
 useLayoutEffect(()=>{
  const animation=animateElement(ref.current,[{opacity:.3},{opacity:1}],160);
  return()=>animation?.cancel();
 },[identity]);
}
type Position={element:HTMLElement;rect:DOMRect;indent:number;expanded:string|null;completed:boolean;clone:HTMLElement;columns:string;display:string[]};
type OutlineMotionOptions={signature:string;completed:Set<string>;completedSignature:string;enabled:boolean;dragging:boolean};
/** FLIP is bounded to small outlines. Virtualized lists and scroll remain immediate. */
export function useOutlineMotion(ref:RefObject<HTMLDivElement|null>,options:OutlineMotionOptions){
 const previous=useRef(new Map<string,Position>()),oldScroll=useRef(0),ghosts=useRef(new Set<HTMLElement>());
 const {signature,completed,completedSignature,enabled,dragging}=options;
 useLayoutEffect(()=>{
  const pane=ref.current;if(!pane||!enabled){previous.current.clear();return;}
  const nodes=[...pane.querySelectorAll<HTMLElement>('[data-outline-id],.inline-creator')];
  const old=previous.current,next=new Map<string,Position>(),box=pane.getBoundingClientRect();
  const eligible=old.size>0&&!dragging&&Math.abs(pane.scrollTop-oldScroll.current)<2&&motionAllowed();
  for(const element of nodes){
   const id=element.dataset.outlineId??'new-item',before=old.get(id),rect=element.getBoundingClientRect(),name=element.querySelector<HTMLElement>('.tree-name')??element;
   const indent=parseFloat(window.getComputedStyle(name).paddingLeft)||0,expanded=element.getAttribute('aria-expanded');
   if(eligible&&rect.bottom>box.top&&rect.top<box.bottom){
    if(before?.element===element){
     const dx=before.rect.left-rect.left,dy=before.rect.top-rect.top;
     if(Math.abs(dx)+Math.abs(dy)>1&&Math.abs(dy)<600)animateElement(element,[{transform:`translate(${dx}px,${dy}px)`},{transform:'translate(0,0)'}],210);
     if(Math.abs(before.indent-indent)>1)animateElement(element.matches('.inline-creator')?element.firstElementChild as HTMLElement:name,[{transform:`translateX(${before.indent-indent}px)`},{transform:'translateX(0)'}]);
     if(before.expanded!==expanded&&expanded!==null)animateElement(element.querySelector('.tree-chevron'),[{transform:`rotate(${expanded==='true'?-90:90}deg)`},{transform:'rotate(0)'}],150);
    }else if(!before)animateElement(element,[{opacity:0,transform:'translateY(-5px)'},{opacity:1,transform:'translateY(0)'}],160);
   }
   next.set(id,{element,rect,indent,expanded,completed:completed.has(id),clone:element.cloneNode(true) as HTMLElement,columns:window.getComputedStyle(element).gridTemplateColumns,display:[...element.children].map(child=>window.getComputedStyle(child).display)});
  }
  if(eligible)for(const [id,before] of old){
   if(next.has(id)||before.completed||!completed.has(id)||before.rect.top<box.top||before.rect.bottom>box.bottom)continue;
   const ghost=before.clone;ghost.removeAttribute('id');ghost.removeAttribute('role');ghost.removeAttribute('data-outline-id');ghost.querySelectorAll('[id]').forEach(el=>el.removeAttribute('id'));
   ghost.classList.add('motion-completed-ghost','completed');ghost.setAttribute('aria-hidden','true');ghost.inert=true;
   Object.assign(ghost.style,{position:'fixed',left:`${before.rect.left}px`,top:`${before.rect.top}px`,width:`${before.rect.width}px`,height:`${before.rect.height}px`,zIndex:'70',pointerEvents:'none',gridTemplateColumns:before.columns});
   [...ghost.children].forEach((child,i)=>(child as HTMLElement).style.display=before.display[i]);ghost.querySelectorAll<HTMLInputElement>('input[type=checkbox]').forEach(input=>input.checked=true);
   document.body.append(ghost);ghosts.current.add(ghost);
   const animation=animateElement(ghost,[{opacity:.95,transform:'translateX(0)'},{opacity:0,transform:'translateX(8px)'}],180);
   const remove=()=>{ghost.remove();ghosts.current.delete(ghost);};if(animation)void animation.finished.catch(()=>{}).finally(remove);else remove();
  }
  previous.current=next;oldScroll.current=pane.scrollTop;
 },[signature,completedSignature,enabled,dragging]);
 useLayoutEffect(()=>{
  const pane=ref.current;const reset=()=>{previous.current.clear();for(const [animation,target] of active)if(pane?.contains(target))animation.cancel();};
  pane?.addEventListener('scroll',reset,{passive:true});
  return()=>{pane?.removeEventListener('scroll',reset);reset();for(const ghost of ghosts.current)ghost.remove();ghosts.current.clear();};
 },[]);
}
