import type {AiSettingsBridge} from './ai-types';
export interface AiScope {kind:'item'|'today'|'recent'|'all';itemId?:string}
export interface AiContextPreview {label:string;itemCount:number;recordCount:number;truncated:boolean;items:{id:string;title:string;path:string}[]}
export interface AiSuggestion {id:string;label:string;target:string;before:string;after:string;state:'pending'|'applied';error?:string;reason?:string}
export interface AiAssistantState {id:string;phase:'idle'|'running'|'done'|'cancelled'|'error';text:string;error:string|null;context:AiContextPreview|null;suggestions:AiSuggestion[]}
export interface AiAssistantBridge extends AiSettingsBridge {
 context(scope:AiScope):Promise<AiContextPreview>;
 get():Promise<AiAssistantState>;
 generate(input:{scope:AiScope;prompt:string}):Promise<AiAssistantState>;
 cancel():Promise<AiAssistantState>;
 apply(input:{runId:string;suggestionId:string}):Promise<AiAssistantState>;
 onChanged(callback:(state:AiAssistantState)=>void):()=>void;
}
