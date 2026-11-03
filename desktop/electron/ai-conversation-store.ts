import {existsSync,readFileSync,statSync} from 'node:fs';
import {atomicWrite} from './sync-storage';
import {parseConversation,type AiConversation,type AiConversationPersistence} from '../core/ai-conversation';
export class AiConversationStore implements AiConversationPersistence {
 private unreadable=false;
 constructor(private file:string){}
 load(){if(!existsSync(this.file))return null;try{if(statSync(this.file).size>8_000_000)throw Error('too large');return parseConversation(JSON.parse(readFileSync(this.file,'utf8')));}catch{this.unreadable=true;throw Error('本机对话记录无法读取，原文件已保留。');}}
 save(value:AiConversation){if(this.unreadable)throw Error('本机对话记录无法读取，原文件已保留。');const json=JSON.stringify(parseConversation(value));if(Buffer.byteLength(json,'utf8')>8_000_000)throw Error('conversation too large');atomicWrite(this.file,json);}
}
