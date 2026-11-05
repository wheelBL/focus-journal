import type {AiSettingsBridge} from './ai-types';
export type AiPurpose='general'|'priorities';
export interface AiScope {kind:'item'|'today'|'recent'|'all';itemId?:string}
export interface AiContextPreview {label:string;itemCount:number;recordCount:number;truncated:boolean;items:{id:string;title:string;path:string}[]}
export interface AiSuggestion {id:string;label:string;target:string;before:string;after:string;state:'pending'|'applied'|'historical';error?:string;reason?:string}
export type AiPhase='idle'|'running'|'done'|'cancelled'|'error';
export interface AiConversationTurn {id:string;scope:AiScope;purpose:AiPurpose;prompt:string;phase:AiPhase;text:string;error:string|null;context:AiContextPreview|null;suggestions:AiSuggestion[]}
export interface AiAssistantState {id:string;phase:AiPhase;text:string;error:string|null;context:AiContextPreview|null;suggestions:AiSuggestion[];conversationId:string;scope:AiScope|null;purpose:AiPurpose;turns:AiConversationTurn[];historyError?:string|null}
export interface AiAssistantBridge extends AiSettingsBridge {
 context(scope:AiScope,purpose?:AiPurpose):Promise<AiContextPreview>;
 get():Promise<AiAssistantState>;
 generate(input:{scope:AiScope;prompt:string;purpose?:AiPurpose}):Promise<AiAssistantState>;
 cancel():Promise<AiAssistantState>;
 reset():Promise<AiAssistantState>;
 apply(input:{runId:string;suggestionId:string}):Promise<AiAssistantState>;
 onChanged(callback:(state:AiAssistantState)=>void):()=>void;
}
