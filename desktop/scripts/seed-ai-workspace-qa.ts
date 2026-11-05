import {mkdirSync,existsSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import {JournalService} from '../core/service';
import {SqliteJournalStore} from '../core/store';
import {localDate,shiftDate} from '../core/types';

// Synthetic data only. This helper never reads or configures any provider credentials.
const root=path.resolve('qa-data'),directory=path.resolve(process.argv[2]??'qa-data/ai-workspace-live');
if(directory===root||!directory.startsWith(root+path.sep))throw Error('QA data must use a child of qa-data.');
if(existsSync(path.join(directory,'journal.sqlite')))throw Error('Refusing to replace an existing journal.');
mkdirSync(directory,{recursive:true});
const service=new JournalService(new SqliteJournalStore(path.join(directory,'journal.sqlite')),undefined,true);
const date=localDate(),add=(title:string,parentId:string|null=null,extra={})=>service.execute({type:'task.save',payload:{title,parentId,...extra}}).state.tasks.at(-1)!.id;
const group=add('AI 交互验证 · 合成事项');
service.execute({type:'outline.patch',payload:{id:group,field:'itemType',value:'group'}});
const review=add('验证：准备方案评审',group,{estimateMinutes:75,plannedDate:date,dueAt:new Date(`${shiftDate(date,1)}T17:00:00`).toISOString()});
const docs=add('验证：更新接口文档',group,{estimateMinutes:60,dueAt:shiftDate(date,-1)});
add('验证：准备联调测试数据',group,{estimateMinutes:45});
service.execute({type:'outline.patch',payload:{id:review,field:'description',value:'纯合成测试任务。评审材料还需75分钟，明天17点交付是不可自行取消的外部承诺。'}});
service.execute({type:'outline.patch',payload:{id:docs,field:'description',value:'纯合成测试任务。旧截止是本人已确认失效且可撤销的个人计划，没有外部承诺或延期后果。请保留历史投入，移除截止时同时设置回顾。'}});
service.execute({type:'session.manual',payload:{taskId:docs,date:shiftDate(date,-1),minutes:35,summary:'合成投入：检查接口示例'}});
service.execute({type:'reminder.settings',payload:{settings:{sound:false,volume:30,repeatSeconds:30}}});
service.shutdown();
writeFileSync(path.join(directory,'qa-fixture.json'),JSON.stringify({synthetic:true,group,review,docs,date},null,2));
console.log('Synthetic AI workspace seeded.');
