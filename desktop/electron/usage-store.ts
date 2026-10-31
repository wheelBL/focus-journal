import {existsSync,readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {atomicWrite} from './sync-storage';
import type {OperationSummary,StoredOperation,AiUsageRecord,UsageSnapshot} from '../core/usage-types';
/** Device-only bounded records, persisted once per batch. No command payloads or credentials. */
export class UsageStore {
 private value:UsageSnapshot={enabled:true,operations:[],ai:[],error:null};private timer:ReturnType<typeof setTimeout>|null=null;private dirtyOperations=false;private dirtyAi=false;
 constructor(private file:string,private version:string){try{if(existsSync(file)){const v=JSON.parse(readFileSync(file,'utf8'));this.value={enabled:v.enabled!==false,operations:Array.isArray(v.operations)?v.operations.slice(-5000):[],ai:Array.isArray(v.ai)?v.ai.slice(-200):[],error:null};}const aiFile=this.file+'.ai.json';if(existsSync(aiFile)){const a=JSON.parse(readFileSync(aiFile,'utf8'));this.value.ai=Array.isArray(a)?a.slice(-200):[];}}catch{this.value.error='本机使用记录无法读取，原文件保留；请导出或清理后再试。';}}
 snapshot(){return structuredClone(this.value);}
 record(value:OperationSummary){
  if(!this.value.enabled)return;
  if(!value||Object.keys(value).some(k=>!['operation','entry','result','version'].includes(k))||!/^[-a-zA-Z0-9_.:]{1,100}$/.test(value.operation)||!/^[-a-zA-Z0-9_.:]{1,150}$/.test(value.entry)||!['success','failed','cancelled'].includes(value.result))throw Error('操作记录格式无效。');
  this.value.operations.push({id:randomUUID(),at:new Date().toISOString(),operation:value.operation,entry:value.entry,result:value.result,version:this.version});this.value.operations=this.value.operations.slice(-5000);this.schedule();
 }
 saveAi(record:AiUsageRecord){
  // Whitelist only analysis output. Connection objects and request headers are never accepted here.
  const clean:AiUsageRecord={id:record.id,at:record.at,scope:structuredClone(record.scope),context:structuredClone(record.context),prompt:record.prompt.slice(0,4000),provider:record.provider,model:record.model,phase:record.phase,text:record.text.slice(0,30000),error:record.error?.slice(0,1000)??null,suggestions:structuredClone(record.suggestions).slice(0,20),...record.finishedAt?{finishedAt:record.finishedAt}:{},...record.durationMs!==undefined?{durationMs:record.durationMs}:{},...record.usage?{usage:record.usage}:{},...record.text.length>30000?{truncated:true}:{}};
  const previous=this.value.ai.find(r=>r.id===record.id);if(previous?.detailsCleared){clean.detailsCleared=true;clean.prompt='';clean.text='';clean.error=null;clean.context={...clean.context,label:'范围内容已清理',items:[]};clean.suggestions=clean.suggestions.map(s=>({...s,label:'建议',target:'已清理',before:'',after:'',reason:undefined,error:undefined}));}if(previous?.feedback){clean.feedback=previous.feedback;clean.feedbackNote=previous.feedbackNote;}
  if(previous)this.value.ai[this.value.ai.indexOf(previous)]=clean;else this.value.ai.push(clean);this.value.ai=this.value.ai.slice(-200);this.schedule('ai');
 }
 updateSuggestions(id:string,suggestions:AiUsageRecord['suggestions']){const r=this.value.ai.find(r=>r.id===id);if(r){r.suggestions=structuredClone(suggestions).map(s=>r.detailsCleared?{...s,label:'建议',target:'已清理',before:'',after:'',reason:undefined,error:undefined}:s);this.schedule('ai');}}
 feedback(id:string,rating:string,note:string){const r=this.value.ai.find(r=>r.id===id);if(!r||!['helpful','neutral','unhelpful'].includes(rating)||typeof note!=='string'||note.length>2000)throw Error('反馈无效。');r.feedback=rating as AiUsageRecord['feedback'];r.feedbackNote=note;this.schedule('ai');return this.snapshot();}
 configure(enabled:boolean){if(typeof enabled!=='boolean')throw Error('记录设置无效。');this.value.enabled=enabled;this.schedule();return this.snapshot();}
 clear(kind:'operations'|'ai-text'){if(kind==='operations')this.value.operations=[];else if(kind==='ai-text')for(const r of this.value.ai){r.detailsCleared=true;r.prompt='';r.text='';r.context.label='范围内容已清理';r.suggestions=r.suggestions.map(s=>({...s,target:'已清理',label:'建议',before:'',after:'',reason:undefined,error:undefined}));r.context.items=[];r.feedbackNote='';r.error=null;}else throw Error('清理类型无效。');this.value.error=null;this.schedule(kind==='operations'?'operations':'ai');return this.snapshot();}
 private schedule(kind:'operations'|'ai'='operations'){if(kind==='ai')this.dirtyAi=true;else this.dirtyOperations=true;if(!this.timer)this.timer=setTimeout(()=>{this.timer=null;this.flush();},1500);}
 flush(){if(this.timer){clearTimeout(this.timer);this.timer=null;}if(this.value.error?.includes('无法读取'))return;try{if(this.dirtyOperations){atomicWrite(this.file,JSON.stringify({enabled:this.value.enabled,operations:this.value.operations}));this.dirtyOperations=false;}if(this.dirtyAi){atomicWrite(this.file+'.ai.json',JSON.stringify(this.value.ai));this.dirtyAi=false;}this.value.error=null;}catch{this.value.error='本机使用记录暂未写入，工作数据不受影响。';}}
 dispose(){this.flush();}
}
