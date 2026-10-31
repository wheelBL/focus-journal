import {BrowserWindow,ipcMain,safeStorage,net} from 'electron';
import {pathToFileURL} from 'node:url';
import {AiSettings,createElectronAiVault} from './ai-settings';
import {chatCompletion} from './ai-transport';
import {AiAssistantService} from '../core/ai-assistant-service';
import {AiError,type AiSettingsInput} from '../core/ai-types';
import type {JournalService} from '../core/service';
import type {AiScope} from '../core/ai-assistant-types';
import {aiOperationResult} from '../core/usage-types';

/** Main-window-only capability. No credentials or arbitrary commands enter renderer space. */
export class AiController {
 private settings:AiSettings;private assistant:AiAssistantService;private testAbort:AbortController|null=null;private channels:string[]=[];private stopped=false;
 constructor(file:string,private window:BrowserWindow,entry:string,journal:JournalService,changed:()=>void,usage?:import('./usage-store').UsageStore){
  this.settings=new AiSettings(file,createElectronAiVault(safeStorage));
  const fetch=(input:Parameters<typeof net.fetch>[0],init?:Parameters<typeof net.fetch>[1])=>net.fetch(input,init);
  this.assistant=new AiAssistantService(journal,()=>this.settings.connection(),(connection,request)=>chatCompletion(connection,request,fetch),changed,record=>usage?.saveAi(record));
  this.assistant.subscribe(state=>{if(state.phase!=='running')usage?.updateSuggestions(state.id,state.suggestions);if(!window.isDestroyed())window.webContents.send('ai:changed',state);});
  const handle=(channel:string,fn:(...args:any[])=>unknown)=>{
   this.channels.push(channel);ipcMain.handle(channel,(event,...args)=>{
    if(this.stopped||event.sender!==window.webContents||event.senderFrame!==event.sender.mainFrame||event.sender.getURL().split('?')[0]!==pathToFileURL(entry).href)throw Error('无效的 AI 请求。');
    try{const result=fn(...args);return Promise.resolve(result).then(value=>{if(!['ai:status','ai:context','ai:get'].includes(channel))usage?.record({operation:channel.replace(':','.'),entry:'ai.assistant',result:aiOperationResult(channel.replace(':','.'),value,args[0]?.suggestionId),version:'current'});return value;},error=>{usage?.record({operation:channel.replace(':','.'),entry:'ai.assistant',result:'failed',version:'current'});throw error;});}catch(error){usage?.record({operation:channel.replace(':','.'),entry:'ai.assistant',result:'failed',version:'current'});throw error;}
   });
  };
  const idle=()=>{if(this.testAbort||this.assistant.get().phase==='running')throw new AiError('busy','请先停止当前 AI 请求，再修改连接。');};
  handle('ai:status',()=>this.settings.status());
  handle('ai:configure',(input:AiSettingsInput)=>{idle();return this.settings.configure(input);});
  handle('ai:clear-key',()=>{idle();return this.settings.clearKey();});
  handle('ai:test',async()=>{idle();const abort=new AbortController();this.testAbort=abort;try{return await this.settings.test({signal:abort.signal,fetch});}finally{if(this.testAbort===abort)this.testAbort=null;}});
  handle('ai:context',(scope:AiScope)=>this.assistant.context(scope));
  handle('ai:get',()=>this.assistant.get());
  handle('ai:generate',input=>{if(this.testAbort)throw new AiError('busy','连接正在测试，请稍候。');return this.assistant.generate(input);});
  handle('ai:cancel',()=>{this.testAbort?.abort();return this.assistant.cancel();});
  handle('ai:apply',input=>this.assistant.apply(input));
  window.on('closed',this.dispose);
 }
 dispose=()=>{if(this.stopped)return;this.stopped=true;this.testAbort?.abort();this.assistant.dispose();for(const channel of this.channels)ipcMain.removeHandler(channel);this.window.off('closed',this.dispose);};
}
