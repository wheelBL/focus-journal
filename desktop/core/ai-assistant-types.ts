import type {AiSettingsBridge} from './ai-types';
export type AiPurpose='general'|'priorities';
export interface AiScope {kind:'item'|'today'|'recent'|'all'|'unfinished';itemId?:string}
export interface AiContextPreview {label:string;itemCount:number;recordCount:number;truncated:boolean;items:{id:string;title:string;path:string}[]}
export interface AiSuggestion {id:string;label:string;target:string;before:string;after:string;state:'pending'|'applied'|'historical';error?:string;reason?:string;runId?:string;targetId?:string;canUndo?:boolean;editable?:Record<string,string|number|null>;editableLabels?:Record<string,string>}
export interface AiRepair {attempt:number;maxAttempts:number;message:string}
export type AiPhase='idle'|'running'|'done'|'cancelled'|'error';
export interface AiConversationTurn {id:string;scope:AiScope;purpose:AiPurpose;prompt:string;phase:AiPhase;text:string;error:string|null;repair?:AiRepair;context:AiContextPreview|null;suggestions:AiSuggestion[]}
export interface AiAssistantState {id:string;phase:AiPhase;text:string;error:string|null;repair?:AiRepair;context:AiContextPreview|null;suggestions:AiSuggestion[];conversationId:string;scope:AiScope|null;purpose:AiPurpose;turns:AiConversationTurn[];historyError?:string|null;conversations?:AiConversationSummary[]}
export interface AiConversationSummary {id:string;scope:AiScope|null;title:string;updatedAt:string}
export interface AiAssistantBridge extends AiSettingsBridge {
 context(scope:AiScope,purpose?:AiPurpose):Promise<AiContextPreview>;
 get():Promise<AiAssistantState>;
 generate(input:{scope:AiScope;prompt:string;purpose?:AiPurpose}):Promise<AiAssistantState>;
 cancel():Promise<AiAssistantState>;
 reset():Promise<AiAssistantState>;
 selectConversation(id:string):Promise<AiAssistantState>;
 undoSuggestion(input:{runId:string;suggestionId:string}):Promise<AiAssistantState>;
 editSuggestion(input:{runId:string;suggestionId:string;values:Record<string,string|number|null>;scope:AiScope}):Promise<AiAssistantState>;
 apply(input:{runId:string;suggestionId:string;scope:AiScope}):Promise<AiAssistantState>;
 onChanged(callback:(state:AiAssistantState)=>void):()=>void;
}
