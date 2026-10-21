import {useLayoutEffect,useRef,useState,type RefObject} from 'react';
/** Fixed 32px rows plus the measured inline capture form. All logical rows remain navigable. */
export function useOutlineWindow(ids:string[],pane:RefObject<HTMLDivElement|null>,extraAfter:string|null,extra:RefObject<HTMLFormElement|null>){
 const enabled=ids.length>400,extraIndex=extraAfter?ids.indexOf(extraAfter):-1;
 const [position,setPosition]=useState({top:0,height:600}),[extraHeight,setExtraHeight]=useState(0),frame=useRef<number|undefined>(undefined);
 const update=()=>{const el=pane.current;if(el)setPosition(old=>old.top===el.scrollTop&&old.height===el.clientHeight?old:{top:el.scrollTop,height:el.clientHeight||600});};
 useLayoutEffect(()=>{update();if(typeof ResizeObserver==='undefined')return;const observer=new ResizeObserver(update);if(pane.current)observer.observe(pane.current);return()=>observer.disconnect();},[enabled]);
 const extraTop=(extraIndex+1)*32;
 const itemAt=(top:number)=>Math.floor((top-(extraIndex>=0&&top>extraTop?Math.min(extraHeight,top-extraTop):0))/32);
 const start=enabled?Math.max(0,Math.min(ids.length-1,itemAt(position.top)-10)):0,end=enabled?Math.min(ids.length,itemAt(position.top+position.height)+12):ids.length;
 useLayoutEffect(()=>{const el=extra.current;if(!el){if(extraIndex<0)setExtraHeight(0);return;}const measure=()=>setExtraHeight(el.getBoundingClientRect().height);measure();if(typeof ResizeObserver==='undefined')return;const observer=new ResizeObserver(measure);observer.observe(el);return()=>observer.disconnect();},[extraAfter,start,end]);
 const reveal=(id:string)=>{const at=ids.indexOf(id),el=pane.current;if(at<0||!el)return;const top=at*32+(extraIndex>=0&&at>extraIndex?extraHeight:0);if(top<el.scrollTop||top+32>el.scrollTop+el.clientHeight){el.scrollTop=Math.max(0,top-el.clientHeight/3);update();}};
 useLayoutEffect(()=>{if(enabled&&extraAfter)reveal(extraAfter);},[extraAfter,enabled]);
 useLayoutEffect(()=>{if(enabled&&pane.current&&pane.current.scrollTop>ids.length*32+extraHeight){pane.current.scrollTop=0;update();}},[ids.length,extraHeight,enabled]);
 useLayoutEffect(()=>()=>{if(frame.current!==undefined)cancelAnimationFrame(frame.current);},[]);
 return {enabled,start,end,top:start*32+(extraIndex>=0&&extraIndex<start?extraHeight:0),bottom:(ids.length-end)*32+(extraIndex>=end?extraHeight:0),reveal,onScroll:()=>{if(!enabled)return;if(frame.current!==undefined)cancelAnimationFrame(frame.current);frame.current=requestAnimationFrame(update);}};
}
