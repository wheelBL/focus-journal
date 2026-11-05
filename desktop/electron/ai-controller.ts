import {BrowserWindow,ipcMain,safeStorage,net} from 'electron';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
import {AiConversationStore} from './ai-conversation-store';
import {AiSettings,createElectronAiVault} from './ai-settings';
import {chatCompletion} from './ai-transport';
import {AiAssistantService} from '../core/ai-assistant-service';
import {AiError,type AiSettingsInput,type AiModelListInput} from '../core/ai-types';
import type {JournalService} from '../core/service';
import type {AiScope,AiPurpose} from '../core/ai-assistant-types';
import {aiOperationResult,operationFailure,type OperationResult} from '../core/usage-types';

/** Main-window-only capability. No credentials or arbitrary commands enter renderer space. */
export class AiController {
 private settings:AiSettings;private assistant:AiAssistantService;private testAbort:AbortController|null=null;private modelsAbort:AbortController|null=null;private modelsPending:Promise<unknown>|null=null;private channels:string[]=[];private stopped=false;
 constructor(file:string,private window:BrowserWindow,entry:string,journal:JournalService,changed:()=>void,usage?:import('./usage-store').UsageStore){
  this.settings=new AiSettings(file,createElectronAiVault(safeStorage));
  const fetch=(input:Parameters<typeof net.fetch>[0],init?:Parameters<typeof net.fetch>[1])=>net.fetch(input,init);
  this.assistant=new AiAssistantService(journal,()=>this.settings.connection(),(connection,request)=>chatCompletion(connection,request,fetch),changed,record=>usage?.saveAi(record),new AiConversationStore(path.join(path.dirname(file),'ai-conversation.json')));
  this.assistant.subscribe(state=>{if(state.phase!=='running'){const safe=this.assistant.storageSafeSuggestions();if(safe)usage?.updateSuggestions(state.id,safe);}if(!window.isDestroyed())window.webContents.send('ai:changed',state);});
  const record=(channel:string,result:OperationResult)=>{try{usage?.record({operation:channel.replace(':','.'),entry:'ai.assistant',result,version:'current'});}catch{/* Usage must not affect AI operations. */}};
  const handle=(channel:string,fn:(...args:any[])=>unknown)=>{
   this.channels.push(channel);ipcMain.handle(channel,(event,...args)=>{
    if(this.stopped||event.sender!==window.webContents||event.senderFrame!==event.sender.mainFrame||event.sender.getURL().split('?')[0]!==pathToFileURL(entry).href)throw Error('无效的 AI 请求。');
    try{const result=fn(...args);return Promise.resolve(result).then(value=>{if(!['ai:status','ai:context','ai:get','ai:cancel-models'].includes(channel))record(channel,aiOperationResult(channel.replace(':','.'),value,args[0]?.suggestionId));return value;},error=>{record(channel,operationFailure(error));throw error;});}catch(error){record(channel,operationFailure(error));throw error;}
   });
  };
  const idle=()=>{if(this.testAbort||this.modelsAbort||this.assistant.get().phase==='running')throw new AiError('busy','请先停止当前 AI 请求，再修改连接。');};
  handle('ai:list-models',(input:AiModelListInput)=>{idle();const abort=new AbortController();this.modelsAbort=abort;const pending=this.settings.listModels(input,{signal:abort.signal,fetch});this.modelsPending=pending;return pending.finally(()=>{if(this.modelsAbort===abort)this.modelsAbort=null;if(this.modelsPending===pending)this.modelsPending=null;});});
  handle('ai:cancel-models',async()=>{this.modelsAbort?.abort();try{await this.modelsPending;}catch{} });
  handle('ai:status',()=>this.settings.status());
  handle('ai:configure',(input:AiSettingsInput)=>{idle();return this.settings.configure(input);});
  handle('ai:clear-key',()=>{idle();return this.settings.clearKey();});
  handle('ai:test',async()=>{idle();const abort=new AbortController();this.testAbort=abort;try{return await this.settings.test({signal:abort.signal,fetch});}finally{if(this.testAbort===abort)this.testAbort=null;}});
  handle('ai:context',(scope:AiScope,purpose?:AiPurpose)=>this.assistant.context(scope,purpose));
  handle('ai:get',()=>this.assistant.get());
  handle('ai:generate',input=>{if(this.testAbort||this.modelsAbort)throw new AiError('busy','连接正在测试或查询，请稍候。');return this.assistant.generate(input);});
  handle('ai:reset',()=>this.assistant.reset());
  handle('ai:cancel',()=>{this.testAbort?.abort();return this.assistant.cancel();});
  handle('ai:apply',input=>this.assistant.apply(input));
  window.on('closed',this.dispose);
 }
 dispose=()=>{if(this.stopped)return;this.stopped=true;this.testAbort?.abort();this.modelsAbort?.abort();this.assistant.dispose();for(const channel of this.channels)ipcMain.removeHandler(channel);this.window.off('closed',this.dispose);};
}
