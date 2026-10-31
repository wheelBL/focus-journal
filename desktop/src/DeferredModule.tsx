import React,{useEffect,useState,type ComponentType,type ReactNode} from 'react';

export type ModuleLoading={label:string;error:string;retry:()=>void};
function Loading({label,error,retry}:ModuleLoading){
 return <section className="page module-loading" aria-busy={!error}><h2>{error?`${label}暂时无法打开`:`正在打开${label}…`}</h2>{error?<><p role="alert">加载未完成，请重试。计时和已保存的记录不受影响。</p><button className="secondary" onClick={retry}>重试打开</button></>:<p role="status" className="muted">正在准备界面…</p>}</section>;
}

/** A failed optional screen must not unmount the clock, navigation or other modules. */
class ModuleErrorBoundary extends React.Component<{label:string;children:ReactNode;fallback:(state:ModuleLoading)=>ReactNode},{failed:boolean}>{
 state={failed:false};
 static getDerivedStateFromError(){return {failed:true};}
 render(){return this.state.failed?this.props.fallback({label:this.props.label,error:'render',retry:()=>this.setState({failed:false})}):this.props.children;}
}

/** Load only when visited, share successful imports, and permit retry after a failed import. */
export function deferredModule<P extends object>(label:string,loader:()=>Promise<{default:ComponentType<P>}>,fallback?:(state:ModuleLoading,props:P)=>ReactNode){
 let cached:ComponentType<P>|null=null,pending:Promise<ComponentType<P>>|null=null;
 const load=()=>{
  if(cached)return Promise.resolve(cached);
  if(!pending)pending=Promise.resolve().then(loader).then(module=>{if(!module.default)throw new Error('模块入口不可用。');cached=module.default;return cached;}).catch(error=>{pending=null;throw error;});
  return pending;
 };
 function Deferred(props:P){
  const [Component,setComponent]=useState(()=>cached),[error,setError]=useState(''),[attempt,setAttempt]=useState(0);
  useEffect(()=>{if(Component)return;let current=true;void load().then(component=>{if(current)setComponent(()=>component);}).catch(()=>{if(current)setError('load');});return()=>{current=false;};},[Component,attempt]);
  const retry=()=>{setError('');setAttempt(value=>value+1);};
  const renderFallback=(state:ModuleLoading)=>fallback?fallback(state,props):<Loading {...state}/>;
  return <ModuleErrorBoundary label={label} fallback={renderFallback}>{Component?<Component {...props}/>:renderFallback({label,error,retry})}</ModuleErrorBoundary>;
 }
 Deferred.displayName=`Deferred(${label})`;
 Deferred.preload=()=>load().then(()=>{},()=>{});
 return Deferred;
}
