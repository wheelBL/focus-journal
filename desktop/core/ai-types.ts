/** AI connection preferences belong to this device, never to JournalState or sync. */
export interface AiSettingsInput {baseUrl:string;model:string;/** Omit or leave blank to keep the saved key. Use clearKey to remove it. */apiKey?:string}
export interface AiSettingsStatus {baseUrl:string;model:string;hasKey:boolean;configured:boolean;error:string|null}
export interface AiConnection {baseUrl:string;model:string;/** Main-process only; never return through IPC. */apiKey:string}
export interface AiConnectionTest {message:string;latencyMs:number}
export interface AiSettingsBridge {
 status():Promise<AiSettingsStatus>;
 configure(input:AiSettingsInput):Promise<AiSettingsStatus>;
 clearKey():Promise<AiSettingsStatus>;
 test():Promise<AiConnectionTest>;
}

export interface AiMessage {role:'system'|'user'|'assistant';content:string}
export interface AiFunctionTool {type:'function';function:{name:string;description:string;parameters:Record<string,unknown>}}
export interface AiToolCall {id:string;name:string;/** Untrusted JSON text. Validate against the application schema before preview/apply. */arguments:string}
export interface AiStreamDelta {text?:string;toolCall?:{index:number;id?:string;name?:string;arguments?:string}}
export interface AiUsage {promptTokens?:number;completionTokens?:number;totalTokens?:number}
export interface AiCompletion {text:string;toolCalls:AiToolCall[];finishReason:string;usage?:AiUsage}
export interface AiCompletionRequest {
 messages:AiMessage[];tools?:AiFunctionTool[];signal?:AbortSignal;
 onDelta?:(delta:AiStreamDelta)=>void;timeoutMs?:number;maxTokens?:number;
}
export type AiErrorCode='configuration'|'credentials'|'storage'|'busy'|'cancelled'|'timeout'|'authentication'|'rate_limit'|'unavailable'|'connection'|'protocol'|'limit';
/** Only these curated messages may cross IPC; upstream errors can contain credentials or prompts. */
export class AiError extends Error {constructor(public readonly code:AiErrorCode,message:string){super(message);this.name='AiError';}}
