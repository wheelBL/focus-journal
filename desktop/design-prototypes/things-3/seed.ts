import {JournalService} from '../../core/service';
import {localDate,shiftDate} from '../../core/types';
import {emptyFilter} from '../../core/filters';
import {withRules,group,condition,relative} from '../../core/filter-rules';

export function seed(service:JournalService) {
  if(service.snapshot().state.tasks.some(t=>t.id!=='inbox'))return;
  const today=localDate(),now=Date.now();
  const add=(title:string,parentId:string|null,extra:Record<string,unknown>={})=>service.execute({type:'task.save',payload:{title,parentId,...extra}}).state.tasks.at(-1)!.id;
  const patch=(id:string,field:string,value:unknown)=>service.execute({type:'outline.patch',payload:{id,field,value}});
  const project=(title:string)=>{const id=add(title,null);patch(id,'isProject',true);return id;};
  const tag=(id:string,name:string)=>service.execute({type:'tag.attach',payload:{id,name}});
  const focus=(id:string)=>service.execute({type:'item.focus',payload:{id,date:today}});
  patch('inbox','isProject',false);
  add('给下个月的旅行留出时间','inbox');
  add('- 灵感：用一周试用记录检验设计','inbox');
  const launch=project('专注记 · 下一次迭代');
  patch(launch,'description','让日常工作更容易开始，也更容易看见进展。');
  const design=add('打磨事项工作区',launch,{estimateMinutes:120});
  const flow=add('梳理任务树与详情的操作动线',design,{estimateMinutes:50,plannedDate:today,dueAt:shiftDate(today,2)});
  patch(flow,'description','把最常用的动作留在手边。\n\n先验证查看与编辑，再核对拖拽后的层级关系。\n\n• 列表保持紧凑，父子关系清楚\n• 完成后有反馈，也可以撤销\n• 开始计时后，今日页面同步显示');tag(flow,'设计');focus(flow);
  const nested=add('核对拖拽后的归属',design,{estimateMinutes:25});
  const deep=add('整棵分支移动',nested,{estimateMinutes:25});
  add('检查路径与累计投入',deep,{estimateMinutes:15});
  add('- 层级变化应当可追踪，不打断输入',design);
  const visuals=add('统一颜色与状态提示',design,{estimateMinutes:45,dueAt:today});tag(visuals,'设计');
  const delivered=add('收集第一轮使用反馈',launch,{estimateMinutes:25});
  service.execute({type:'task.status',payload:{id:delivered,status:'done'}});
  const test=add('完成 Windows 试用检查',launch,{estimateMinutes:50,plannedDate:shiftDate(today,1)});
  add('检查计时与休息提醒',test,{estimateMinutes:25});
  add('整理交付说明',test,{estimateMinutes:15});
  const reading=project('阅读与写作');
  const read=add('读完《深度工作》第三章',reading,{estimateMinutes:45,plannedDate:today});tag(read,'阅读');focus(read);
  add('摘录两个值得实践的方法',read,{estimateMinutes:15});
  add('- 给高价值的工作留出完整时段',reading);
  const summary=add('写一段本周阅读小结',reading,{estimateMinutes:30,dueAt:shiftDate(today,3)});tag(summary,'写作');
  const personal=project('生活与日常');
  const walking=add('傍晚散步 30 分钟',personal,{estimateMinutes:30,plannedDate:today});focus(walking);
  const routine=add('整理桌面，回顾今天',personal,{estimateMinutes:10});
  service.execute({type:'recurrence.set',payload:{id:routine,rule:{mode:'completion',unit:'day',interval:1,anchor:today,weekdays:[],until:null}}});
  add('预约周末的羽毛球场',personal,{estimateMinutes:10,dueAt:shiftDate(today,2)});
  const event=add('o 周五设计回顾',launch,{itemType:'event'});
  service.execute({type:'event.save',payload:{id:event,at:new Date(`${shiftDate(today,1)}T15:00:00`).toISOString()}});
  const backlog=add('尝试新的阅读工具',personal);service.execute({type:'item.change',payload:{id:backlog,action:'pause'}});
  for(const [id,offset,minutes,summaryText] of [[delivered,150,25,'整理了 6 条反馈，确定这一轮的优先事项。'],[flow,110,35,'列出了查看、创建、调整层级和计时的完整路径。'],[read,55,20,'读到注意力切换的章节，留下两条摘录。']] as const) {
    const start=new Date(now-offset*60000).toISOString(),end=new Date(now-(offset-minutes)*60000).toISOString();
    service.execute({type:'calendar.save',payload:{mode:'effort',taskId:id,start,end,summary:summaryText}});
  }
  service.execute({type:'view.save',payload:{name:'本周需完成',filter:withRules({...emptyFilter(),sort:'smart'},group([condition('status','is','open'),condition('dueAt','before',relative('next-week'))]))}});
  service.execute({type:'task.select',payload:{id:flow}});
  service.execute({type:'focus.start',payload:{taskId:flow,skipEstimate:true,startedAt:new Date(now-8*60000).toISOString()}});
  service.execute({type:'reminder.settings',payload:{settings:{sound:false,volume:50,repeatSeconds:30}}});
}
