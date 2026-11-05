import type {AiConversationTurn} from './ai-assistant-types';
import type {ReviewSchedule} from './types';
type Interval=ReviewSchedule['interval'];
export interface ReviewIntent {focusReview:boolean;allowReviewCreation:boolean;allowRecurrenceChange:boolean;fixedReviewWeekday:boolean;interval:Interval|null}
const isItemReview=(message:string)=>/审视|复查|审查|重新判断/.test(message)||/回顾/.test(message)&&!/(?:回顾.{0,12}(?:投入|工时|时间记录|工作记录|成果|复盘)|(?:投入|工时|时间记录|工作记录|成果).{0,8}回顾)/.test(message);
const fixed=/(?:每(?:个)?|每逢|固定(?:在|为)?)(?:周|星期)[一二三四五六日天]/;
const oneTime=/(?:仅|只)(?:需要|安排|做|要|用|改为|这)?(?:这)?一次|(?:仅|只)(?:限|有|安排)?(?:这次|本次)|先(?:安排|设置|做|审视|回顾)?一次|单次|一次性/;
const interval=/每(?:隔)?\s*(\d{1,3}|[一二两三四五六七八九十]+)?\s*(天|日|周|星期|个月|月)/;
function countOf(value:string|undefined):number|null {
 if(!value)return 1;if(/^\d+$/.test(value)){const n=Number(value);return n>=1&&n<=120?n:null;}
 const digits:Record<string,number>={一:1,二:2,两:2,三:3,四:4,五:5,六:6,七:7,八:8,九:9};
 if(value==='十')return 10;if(value.includes('十')){const [a,b]=value.split('十'),n=(a?digits[a]:1)*10+(b?digits[b]:0);return Number.isInteger(n)&&n>=1&&n<=120?n:null;}return digits[value]??null;
}
/** Policy derives only from the current request and a bounded suffix of user messages in this same scope. */
export function reviewIntent(prompt:string,previous:AiConversationTurn[]):ReviewIntent {
 let focusReview=false,fixedReviewWeekday=false,requested:Interval|null=null,allowRecurrenceChange=false;
 const messages=[...previous.slice(-8).map(t=>t.prompt),prompt];
 for(const message of messages){
  const compact=message.replace(/\s+/g,'');
  const explicitNew=/(?:(?:另外|另行|再)(?:帮我|为我)?|^(?:(?:请(?:帮我)?|帮我|我想|我要|想要|现在))*)(?:新建|创建|新增|添加)(?:一个|一条)?(?:普通)?(?:任务|事项)/.test(compact)&&!/(?:不要|不用|不需要|无需|别|禁止).{0,12}(?:新建|创建|新增|添加)/.test(compact);
  const cancelReview=/^(?:算了|不要了|不需要了|不用了|取消(?:之前|刚才|上次|当前)?(?:的)?(?:要求|安排|建议)?)[。！!]?$/.test(compact)||/(?:取消|不再|不需要|无需|不要)(?:之前|刚才|这次|这个|上次|安排|设置|开启|进行|的){0,4}(?:审视|复查|审查|回顾|重新判断)/.test(compact);
  if(cancelReview||explicitNew&&!isItemReview(compact)){focusReview=false;requested=null;allowRecurrenceChange=false;fixedReviewWeekday=false;}
  else if(isItemReview(compact))focusReview=true;
  if(!focusReview)continue;
  for(const clause of compact.split(/[，。；,;.!！?？]/)){
   if(oneTime.test(clause)){requested={unit:'once',count:1};allowRecurrenceChange=true;fixedReviewWeekday=false;continue;}
   if(/(?:不需要|不要|不用|无需|别|不).{0,5}每/.test(clause)){requested=null;allowRecurrenceChange=false;fixedReviewWeekday=false;continue;}
   if(fixed.test(clause)){fixedReviewWeekday=true;requested=null;allowRecurrenceChange=true;continue;}
   const match=clause.match(interval);if(match){const count=countOf(match[1]);if(count){requested={unit:match[2]==='天'||match[2]==='日'?'days':match[2]==='周'||match[2]==='星期'?'weeks':'months',count};allowRecurrenceChange=true;fixedReviewWeekday=false;}}
  }
 }
 const compact=prompt.replace(/\s+/g,''),allowReviewCreation=/(?:另外|另行|再)(?:帮我|为我)?(?:新建|创建|新增)(?:一个|一条)?(?:普通)?(?:任务|事项)/.test(compact)&&!/(?:不要|不用|不需要|无需|别|禁止).{0,12}(?:新建|创建|新增)/.test(compact);
 return {focusReview,allowReviewCreation,allowRecurrenceChange,fixedReviewWeekday,interval:requested};
}
