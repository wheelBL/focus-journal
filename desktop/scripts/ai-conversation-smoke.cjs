// Isolated packaged QA only: a loopback model and a made-up QA key, never a live provider.
const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
module.exports=async({main,run,until,check,wait,output})=>{
 const snapshot=()=>run(main,'window.journal.snapshot()');
 const before=await snapshot();check(before.demo===true,'AI conversation smoke uses an isolated QA journal');
 const title='发布验证：AI 原有逾期事项审视',key='qa-ai-conversation-synthetic-key',clarification='已找到原有逾期事项。你希望先安排今天的一次审视，还是设置从实际审视日期起算的间隔？我不会额外创建收件箱任务。';
 const requests=[],serverErrors=[],sockets=new Set();let taskId,reviewDate;
 const server=http.createServer((req,res)=>{let raw='';req.setEncoding('utf8');req.on('error',()=>{});req.on('data',chunk=>{raw+=chunk;if(raw.length>250000)req.destroy();});req.on('end',()=>{try{
  if(req.method!=='POST'||req.url!=='/v1/chat/completions')throw Error('Unexpected synthetic AI route');
  const body=JSON.parse(raw);requests.push({body,authorized:req.headers.authorization===`Bearer ${key}`});
  res.writeHead(200,{'Content-Type':'text/event-stream; charset=utf-8','Cache-Control':'no-cache'});
  const frame=(delta,finish_reason=null)=>res.write(`data: ${JSON.stringify({choices:[{index:0,delta,finish_reason}]})}\n\n`);
  if(requests.length===1){frame({content:clarification});frame({},'stop');}
  else if(requests.length===2){const plan={summary:'只为原有事项开启今天的一次审视，保留原截止日期、层级及投入。',changes:[{reason:'用户已明确确认今天先审视一次；这不是新增任务。',command:{type:'item-review.configure',payload:{id:taskId,enabled:true,nextDate:reviewDate,interval:{unit:'once',count:1}}}}]};frame({content:'已根据你的补充准备原事项的审视安排，请确认后应用。'});frame({tool_calls:[{index:0,id:'qa-review-plan',type:'function',function:{name:'propose_changes',arguments:JSON.stringify(plan)}}]});frame({},'tool_calls');}
  else throw Error('Unexpected extra synthetic AI request');
  res.end('data: [DONE]\n\n');
 }catch(error){serverErrors.push(String(error));if(!res.headersSent)res.writeHead(400);res.end();}});});
 server.on('connection',socket=>{sockets.add(socket);socket.on('close',()=>sockets.delete(socket));});
 const input=async(selector,value)=>run(main,`(()=>{const el=document.querySelector(${JSON.stringify(selector)});if(!el)throw Error('Missing AI smoke input');const proto=el.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLTextAreaElement.prototype;Object.getOwnPropertyDescriptor(proto,'value').set.call(el,${JSON.stringify(value)});el.dispatchEvent(new Event(el.tagName==='SELECT'?'change':'input',{bubbles:true}));})()`);
 const click=async(label,aria=false)=>run(main,`(()=>{const el=${aria?`document.querySelector('[aria-label='+JSON.stringify(${JSON.stringify(label)})+']')`:`[...document.querySelectorAll('dialog[open] button')].find(b=>b.textContent.trim()===${JSON.stringify(label)})`};if(!el)throw Error('Missing AI smoke button');el.click();})()`);
 const open=async()=>{await run(main,`document.querySelector('.sidebar-bottom [aria-label="AI 助手"]').click()`);await until(()=>run(main,`!!document.querySelector('dialog[open] [aria-label="给 AI 的问题"]')&&!document.querySelector('.ai-context-loading')`),'AI assistant did not open with a ready scope');};
 let configured=false;
 try{
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',()=>{server.off('error',reject);resolve();});});const port=server.address().port;
  const created=await run(main,`(async()=>{const s=await window.journal.snapshot(),date=new Date(s.now),day=d=>String(d.getFullYear())+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'),today=day(date);date.setDate(date.getDate()-1);const result=await window.journal.command({type:'task.save',payload:{title:${JSON.stringify(title)},parentId:null,dueAt:day(date)}});return {id:result.state.tasks.at(-1).id,today,dueAt:result.state.tasks.at(-1).dueAt};})()`);taskId=created.id;reviewDate=created.today;
  await run(main,`window.journalAI.configure({baseUrl:'http://127.0.0.1:${port}/v1',model:'qa-conversation-model',apiKey:${JSON.stringify(key)}})`);configured=true;await run(main,'window.journalAI.reset()');await open();
  await input('[aria-label="AI 分析范围"]','today');await until(()=>run(main,`!document.querySelector('.ai-context-loading')&&!!document.querySelector('.ai-context')`),'AI context preview did not settle');
  const firstPrompt=`请为「${title}」安排事项审视。需要澄清时先问我，不要新建任务。`;
  await input('[aria-label="给 AI 的问题"]',firstPrompt);await click('生成建议');
  await until(()=>run(main,`window.journalAI.get().then(s=>s.phase==='done'&&s.turns.length===1)`),'AI first clarification did not finish');
  await until(()=>run(main,`document.querySelectorAll('.ai-turn').length===1&&document.querySelector('[aria-label="给 AI 的问题"]').value===''`),'AI first turn did not clear sent text for follow-up');
  check(await run(main,`document.querySelector('.ai-transcript').textContent.includes('你希望先安排今天的一次审视')&&!document.querySelector('[aria-label^="确认应用"]')`),'First model reply asks for clarification and makes no changes');
  const unchanged=await snapshot();check(!unchanged.state.tasks.find(t=>t.id===taskId).reviewSchedule,'Clarification does not silently configure item reviews');
  const followup='今天，先安排一次。';
  await input('[aria-label="给 AI 的问题"]',followup);await click('继续对话');
  await until(()=>run(main,`window.journalAI.get().then(s=>s.phase==='done'&&s.turns.length===2&&s.suggestions.some(x=>x.state==='pending'))`),'Follow-up did not produce a real item-review proposal');
  await until(()=>run(main,`!!document.querySelector('[aria-label="确认应用 设置事项审视"]')`),'Explicit review confirmation control missing');
  check(requests.length===2&&requests.every(r=>r.authorized)&&requests[1].body.messages.some(m=>m.role==='user'&&m.content===firstPrompt)&&requests[1].body.messages.some(m=>m.role==='assistant'&&m.content.includes(clarification)),'Native follow-up includes the earlier user request and assistant clarification');
  check(requests[1].body.messages.at(-1).content.includes(taskId)&&requests[1].body.tools[0].function.parameters.properties.changes.items.properties.command.properties.type.enum.includes('item-review.configure'),'Follow-up uses the real item ID and existing review command schema');
  const pending=await snapshot();check(pending.state.tasks.length===unchanged.state.tasks.length&&!pending.state.tasks.find(t=>t.id===taskId).reviewSchedule,'Pending AI review proposal adds no Inbox task and changes nothing before confirmation');
  const composerMetrics=()=>run(main,`(()=>{const dialog=document.querySelector('dialog[open]'),pane=dialog.querySelector('.ai-transcript'),composer=dialog.querySelector('.ai-compose'),question=composer.querySelector('textarea'),button=composer.querySelector('.ai-compose-actions button'),r=dialog.getBoundingClientRect(),q=question.getBoundingClientRect(),b=button.getBoundingClientRect(),p=pane.getBoundingClientRect();return {fits:q.top>=r.top&&q.bottom<=Math.min(r.bottom,innerHeight)&&b.bottom<=Math.min(r.bottom,innerHeight)&&b.top>=r.top,editable:!question.readOnly&&!question.disabled&&!button.disabled,independent:!pane.contains(composer)&&getComputedStyle(pane).overflowY==='auto'&&p.height>40,historyScrolls:pane.scrollHeight>pane.clientHeight,outerFits:dialog.scrollHeight<=dialog.clientHeight+2,focus:document.activeElement===question,selection:question.selectionStart===3&&question.selectionEnd===7,width:innerWidth,height:innerHeight};})()`);
  await input('[aria-label="给 AI 的问题"]','原生验证：继续追问的草稿');await run(main,`(()=>{const e=document.querySelector('[aria-label="给 AI 的问题"]');e.focus();e.setSelectionRange(3,7);const p=document.querySelector('.ai-transcript');p.scrollTop=0;p.dispatchEvent(new Event('scroll'));})()`);await wait(80);
  const normal=await composerMetrics();check(normal.fits&&normal.editable&&normal.independent&&normal.historyScrolls&&normal.outerFits&&normal.focus&&normal.selection,`Two-turn composer remains visible and editable while history scrolls at normal height: ${JSON.stringify(normal)}`);
  fs.writeFileSync(path.join(output,'ai-followup-pending.png'),(await main.webContents.capturePage()).toPNG());
  const originalBounds=main.getBounds(),minimum=main.getMinimumSize();try{main.setMinimumSize(760,520);main.setContentSize(900,600);await wait(120);const narrow=await composerMetrics();check(narrow.fits&&narrow.editable&&narrow.independent&&narrow.historyScrolls&&narrow.outerFits&&narrow.focus&&narrow.selection,`Two-turn composer remains visible and editable in a short narrow window: ${JSON.stringify(narrow)}`);fs.writeFileSync(path.join(output,'ai-followup-narrow.png'),(await main.webContents.capturePage()).toPNG());}finally{main.setMinimumSize(...minimum);main.setBounds(originalBounds);await wait(100);}
  await input('[aria-label="给 AI 的问题"]','');
  await click('确认应用 设置事项审视',true);await until(async()=>!!(await snapshot()).state.tasks.find(t=>t.id===taskId)?.reviewSchedule?.enabled,'Confirmed item review did not save');
  const applied=await snapshot(),original=applied.state.tasks.find(t=>t.id===taskId),inboxIds=s=>s.state.tasks.filter(t=>t.parentId==='inbox').map(t=>t.id).sort().join(',');
  check(original.reviewSchedule.nextDate===reviewDate&&original.reviewSchedule.interval.unit==='once'&&original.dueAt===created.dueAt&&original.parentId===null,'Confirmed review configures the original overdue item without changing its deadline or identity');
  check(applied.state.tasks.length===unchanged.state.tasks.length&&inboxIds(applied)===inboxIds(unchanged)&&applied.state.sessions.length===unchanged.state.sessions.length&&applied.state.itemReviews.length===unchanged.state.itemReviews.length,'Review scheduling creates no Inbox task, effort or false completed-review record');
  await until(()=>run(main,`!!document.querySelector('.ai-applied')`),'AI applied status missing');
  const conversation=await run(main,'window.journalAI.get()');await run(main,`document.querySelector('dialog[open] header [aria-label="关闭"]').click()`);await until(()=>run(main,`!document.querySelector('dialog[open]')`),'AI conversation did not close');await open();
  check(await run(main,`(()=>{const turns=document.querySelectorAll('.ai-turn');return turns.length===2&&!!document.querySelector('.ai-applied')&&document.querySelector('.ai-transcript').textContent.includes(${JSON.stringify(firstPrompt)});})()`),'Closing and reopening retains both user requests, responses and the applied review result');
  check((await run(main,'window.journalAI.get()')).conversationId===conversation.conversationId,'Reopening continues the same native conversation');
  fs.writeFileSync(path.join(output,'ai-conversation-reopened.png'),(await main.webContents.capturePage()).toPNG());
  fs.writeFileSync(path.join(output,'ai-conversation-evidence.json'),JSON.stringify({taskId,conversationId:conversation.conversationId,turnId:conversation.id,reviewDate,dueAt:created.dueAt,turns:conversation.turns.length},null,2));
  await click('打开事项审视');await until(()=>run(main,`!!document.querySelector('.item-review-workspace')`),'AI review link did not open the existing review workspace');
  check(await run(main,`[...document.querySelectorAll('.review-queue button strong')].some(el=>el.textContent===${JSON.stringify(title)})`),'The original overdue item appears in the real item-review queue');
  check(serverErrors.length===0,'Synthetic AI provider completed without protocol errors');
  fs.writeFileSync(path.join(output,'ai-original-item-review.png'),(await main.webContents.capturePage()).toPNG());
 }finally{
  if(configured)try{await run(main,'window.journalAI.cancel().then(()=>window.journalAI.clearKey())');}catch{}
  for(const socket of sockets)socket.destroy();await new Promise(resolve=>server.close(()=>resolve()));
 }
};
