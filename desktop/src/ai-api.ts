import type {AiAssistantBridge} from '../core/ai-assistant-types';

declare global {interface Window {journalAI?:AiAssistantBridge}}

/** Keep connection failures useful without echoing a key still present in the form. */
export function aiErrorText(error:unknown,secret=''){
 const message=error instanceof Error?error.message.replace(/^Error invoking remote method '[^']+': (?:Error: )?(?:AiError: )?/, ''):'操作未完成，请重试。';
 return secret?message.split(secret).join('[已隐藏]'):message;
}
