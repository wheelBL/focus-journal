import {defaultCaptureParent} from './capture-destination';
import {localDate,type Command,type Snapshot} from './types';

/** The public API is an explicit subset of domain commands, not arbitrary IPC. */
type Schema={type?:string|string[];const?:unknown;properties?:Record<string,Schema>;required?:string[];additionalProperties?:boolean;enum?:unknown[];items?:Schema;minLength?:number;maxLength?:number;minimum?:number;maximum?:number;maxItems?:number;description?:string};
const str=(maxLength=2000):Schema=>({type:'string',maxLength});
const id:Schema={type:'string',minLength:1,maxLength:100};
const nullable=(schema:Schema):Schema=>({...schema,type:[String(schema.type),'null']});
const date:Schema={type:['string','null'],maxLength:40,description:'日期用 YYYY-MM-DD；精确时间用带时区的 ISO 8601。日期截止不包含当天。'};
const bool:Schema={type:'boolean'};
const num=(minimum=0,maximum=1440):Schema=>({type:'number',minimum,maximum});
const choice=(...values:unknown[]):Schema=>({enum:values});
const obj=(properties:Record<string,Schema>,required:string[]=[]):Schema=>({type:'object',properties,required,additionalProperties:false});
interface Definition {description:string;payload:Schema;map?:(p:Record<string,unknown>,s:Snapshot)=>Command}
const define=(description:string,properties:Record<string,Schema>,required:string[]=[]):Definition=>({description,payload:obj(properties,required)});
const itemFields={title:{...str(),minLength:1},description:str(10000),itemType:choice('task','note','event'),parentId:nullable(id),tagNames:{type:'array',items:str(80),maxItems:50} as Schema,plannedDate:date,dueAt:date,estimateMinutes:nullable(num(1)),remindAt:date,eventAt:date,eventEnd:date};
export const controlCommands:Record<string,Definition>={
 'item.handoff':define('将本人责任交接给他人并以 handed-off 关闭；不计完成。仅处理明确选择的本项或子项，相关计时需 confirmTimers。',{id,ids:{type:'array',items:id,maxItems:1000},assignee:str(120),note:str(2000),followUp:bool,followUpAt:date,at:date,confirmTimers:bool},['id','assignee']),
 'item.reclaim':define('重新接手本项或明确选择的子项，不启动计时。',{id,ids:{type:'array',items:id,maxItems:1000}},['id']),
 'item.completion':define('校正已完成事项的成果归属，历史投入保留。',{id,by:choice('self','other','shared','unknown'),at:date},['id','by']),
 'item.create':{...define('原子创建事项、笔记或事件，可同时设置标签、计划和提醒；不自动计时。',itemFields,['title']),map:(p,s)=>({type:'capture.create',payload:{parentId:p.parentId===undefined?defaultCaptureParent(s.state):p.parentId,draft:{title:p.title,description:'',itemType:'task',tagNames:[],parentQuery:null,plannedDate:null,dueAt:null,estimateMinutes:null,remindAt:null,eventAt:null,eventEnd:null,...p}}})},
 'outline.patch':define('修改单个字段；保持其他内容。项目是 isProject 标记。',{id,field:choice('title','description','isProject','plannedDate','dueAt','estimateMinutes','itemType'),value:{type:['string','number','boolean','null']}},['id','field','value']),
 'outline.move':define('原子移动整支，保留身份、投入和历史。',{id,targetId:nullable(id),position:choice('inside','before','after','root')},['id','targetId','position']),
 'item.focus':{...define('加入指定日期的重点；省略 date 表示今天，null 表示取消。',{id,date},['id']),map:(p,s)=>({type:'item.focus',payload:{...p,date:p.date===undefined?localDate(s.now):p.date}})},
 'task.status':define('完成、取消或重新打开；如有未完成子项，需显式指定 children。',{id,completionBy:choice('self','other','shared','unknown'),status:choice('open','done','cancelled'),children:choice('done','cancelled')},['id','status']),
 'item.change':define('暂停、恢复、移入回收站或从回收站恢复。整支删除需要 confirmBranch:true。',{id,action:choice('pause','resume','delete','restore'),confirmBranch:bool},['id','action']),
 'tag.attach':define('为事项添加自定义标签。',{id,name:str(80)},['id','name']),
 'tag.detach':define('从事项移除一个标签。',{id,tagId:id},['id','tagId']),
 'item-reminder.set':define('设置或取消独立提醒；不修改截止或投入。',{id,at:date},['id','at']),
 'event.save':define('更新事件时间或日期；不生成实际投入。',{id,at:date,end:date},['id','at']),
 'focus.start':define('为事项开始计时；可用 startedAt 补入过去的开始时间，提醒从现在重新计算；允许并行。',{taskId:id,skipEstimate:bool,targetMinutes:num(1,240),startedAt:str(40)},['taskId']),
 'focus.start-unassigned':define('先计时，结束后再补充事项；可用 startedAt 补入过去的开始时间。',{targetMinutes:num(1,240),startedAt:str(40)}),
 'focus.set-start':define('调整活动计时的开始时间，保留暂停片段与原记录 ID；从当前投入重新计算下一次目标提醒，不自动恢复暂停。',{sessionId:id,startedAt:str(40),expectedStart:str(40)},['sessionId','startedAt']),
 'focus.pause':define('暂停指定计时器。',{sessionId:id},['sessionId']),
 'focus.resume':define('恢复指定计时器，不自动停止其他计时器。',{sessionId:id},['sessionId']),
 'focus.stop':define('结束指定计时器；可显式完成事项或开始休息。',{sessionId:id,complete:bool,rest:bool},['sessionId']),
 'session.manual':define('补记或改时间需 date/minutes，有 start/end 时按区间计算。仅改归属或进展可传 preserveTiming:true，必须提供已结束记录 id 和 reason，且不能传 date/minutes/start/end；原时段和暂停片段保留。校正原记录进入历史。',{id,taskId:id,preserveTiming:bool,date:{...str(10),minLength:10},minutes:num(.1),start:date,end:date,summary:str(10000),reason:str(10000)},['taskId']),
 'session.delete':define('删除已结束的投入并更新累计时间，可从已删除投入恢复。可同时保留本次输入的进展。',{id,summary:str()},['id']),
 'session.restore':define('恢复已删除投入，保留原事项、片段和记录 ID。',{id},['id']),
 'session.summary':define('补充本次进展，可调整剩余估计或原子保存后休息。',{id,summary:str(10000),remainingMinutes:num(),rest:bool},['id','summary']),
 'session.assign':define('将已结束的未关联投入绑定到现有事项；省略 taskId 时通过 title 新建，不重复累计时间。',{id,taskId:id,title:str(),parentId:nullable(id),summary:str(10000)},['id']),
 'estimate.add':define('追加剩余估计，保留初始估计。',{taskId:id,remainingMinutes:num(),reason:str(10000)},['taskId','remainingMinutes']),
 'review.save':define('记录复盘结果、原因和调整。',{taskId:id,outcome:str(10000),reason:str(10000),adjustment:str(10000)},['taskId']),
 'break.start':define('开始短休息；其他工作仍在计时时拒绝。',{sessionId:id}),
 'break.finish':define('提前结束休息，进入欢迎状态。',{}),
 'break.continue':define('显式开始下一轮专注。',{}),
 'break.stop':define('暂不休息或关闭休息入口。',{}),
};
export class ControlInputError extends Error{}
export function checkSchema(schema:Schema,value:unknown,path='payload'):void{
 const fail=()=>{throw new ControlInputError(`${path} 格式无效。`);};
 if(schema.enum&&!schema.enum.includes(value))fail();
 if(schema.type){const types=Array.isArray(schema.type)?schema.type:[schema.type],type=value===null?'null':Array.isArray(value)?'array':typeof value;if(!types.includes(type))fail();}
 if(typeof value==='string'&&(value.length<(schema.minLength??0)||value.length>(schema.maxLength??Infinity)))fail();
 if(typeof value==='number'&&(!Number.isFinite(value)||value<(schema.minimum??-Infinity)||value>(schema.maximum??Infinity)))fail();
 if(Array.isArray(value)){if(value.length>(schema.maxItems??Infinity))fail();if(schema.items)value.forEach((v,i)=>checkSchema(schema.items!,v,`${path}[${i}]`));}
 if(value&&typeof value==='object'&&!Array.isArray(value)){
  const v=value as Record<string,unknown>;for(const key of schema.required??[])if(!Object.hasOwn(v,key))fail();
  for(const key of Object.keys(v)){const field=schema.properties&&Object.hasOwn(schema.properties,key)?schema.properties[key]:undefined;if(!field&&schema.additionalProperties===false)fail();if(field)checkSchema(field,v[key],`${path}.${key}`);}
 }
}
export function controlCommand(input:unknown,snapshot:Snapshot):Command{
 checkSchema(obj({type:str(80),payload:{type:'object'}},['type','payload']),input,'command');
 const c=input as Command,definition=Object.hasOwn(controlCommands,c.type)?controlCommands[c.type]:undefined;
 if(!definition)throw new ControlInputError('此命令未通过 API 开放。');
 checkSchema(definition.payload,c.payload);
 return definition.map?definition.map(c.payload!,snapshot):c;
}
export function controlOpenApi(baseUrl:string){
 const response={description:'JSON 结果。读取返回 revision，写入返回变更 ID；错误为 {error:{code,message}}。'};
 const get=(summary:string)=>({summary,responses:{200:response,401:response}});
 const writeHeaders=[{name:'If-Match',in:'header',required:true,schema:{type:'string'},description:'最近读取的 revision。过期返回 412，需重新读取并检查。'},{name:'Idempotency-Key',in:'header',required:true,schema:{type:'string'},description:'每次逻辑操作一个唯一键；重试复用原键。'}];
 const syncPost=(summary:string,schema:Schema)=>({summary,parameters:writeHeaders,requestBody:{required:true,content:{'application/json':{schema}}},responses:{202:{description:'已接受异步操作，返回 data.operation.id 和 data.operationUrl。轮询操作 URL 直到 state=finished；result.phase 才表示同步结果。'},400:response,403:response,409:response,412:response,428:response}});
 return {openapi:'3.1.0',info:{title:'专注记本机控制 API',version:'1.0.0',description:'仅本机。先读取 revision，再写入；写操作必须携带 If-Match 与唯一 Idempotency-Key。'},servers:[{url:baseUrl}],security:[{bearerAuth:[]}],components:{securitySchemes:{bearerAuth:{type:'http',scheme:'bearer'}},schemas:{Command:{oneOf:Object.entries(controlCommands).map(([type,d])=>({...obj({type:{const:type} as Schema,payload:d.payload},['type','payload']),description:d.description}))}}},paths:{
  '/status':{get:get('当前时间、修订号和接口能力')},
  '/items':{get:{...get('分页事项列表；默认未完成，支持 query、status、focus=today、scopeId、viewId、offset、limit'),parameters:['query','status','focus','scopeId','viewId','offset','limit'].map(name=>({name,in:'query',schema:{type:'string'}}))}},
  '/items/{id}':{get:{...get('事项详情、父级路径、直接子项、实际投入、估计与复盘'),parameters:[{name:'id',in:'path',required:true,schema:{type:'string'}}]}},
  '/items/query':{post:{summary:'按应用的完整筛选模型查询；只读，不修改数据。',requestBody:{required:true,content:{'application/json':{schema:obj({filter:{type:'object'},offset:num(),limit:num(1,200)},['filter'])}}},responses:{200:response}}},
  '/timers':{get:get('当前计时器和休息状态')},
  '/sessions':{get:{...get('分页投入记录，支持 taskId、from、to、offset、limit、deleted=true（已删除）；跨日记录按片段与日期相交'),parameters:['taskId','from','to','offset','limit','deleted'].map(name=>({name,in:'query',schema:{type:'string'}}))}},
  '/tags':{get:get('已有标签与 ID')},'/views':{get:get('用户保存的视图及筛选条件')},
  '/sync/status':{get:get('GitCode 配置摘要、同步状态和待处理冲突，不返回凭据')},
  '/sync/run':{post:syncPost('启动一次同步；需写权限、已配置 GitCode、无运行中的计时器。不自动处理冲突。',obj({}))},
  '/sync/resolve':{post:syncPost('明确选择冲突版本；再次核对两侧内容，替换本机前备份。local=本机上传，remote=远端载入。',obj({conflictId:id,choice:choice('local','remote')},['conflictId','choice']))},
  '/sync/operations/{id}':{get:{...get('查询已接受操作；state=finished 时检查 result.phase（ok/conflict/error）或 error。保留本次服务最近 200 个操作。'),parameters:[{name:'id',in:'path',required:true,schema:{type:'string'}}]}},
  '/commands':{post:{summary:'执行一个允许的业务命令；不包含导入、同步凭据或应用退出。',parameters:[{name:'If-Match',in:'header',required:true,schema:{type:'string'},description:'最近读取响应的 revision。过期返回 412，需重新读取并检查。'},{name:'Idempotency-Key',in:'header',required:true,schema:{type:'string'},description:'每次逻辑操作一个唯一键。相同请求可原键重试；服务重启后旧 revision 拒绝重试。'}],requestBody:{required:true,content:{'application/json':{schema:{$ref:'#/components/schemas/Command'}}}},responses:{200:response,403:response,409:response,412:response,422:response,428:response}}},
  '/openapi.json':{get:get('本接口说明')},
 }};
}
