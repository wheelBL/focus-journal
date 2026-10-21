import {existsSync} from 'node:fs';
import path from 'node:path';
import {JournalService} from '../core/service.ts';
import {SqliteJournalStore} from '../core/store.ts';
const file=path.resolve('qa-data/reminders/journal.sqlite');
if(existsSync(file))throw new Error('Reminder smoke profile already exists; do not overwrite it.');
class Clock{time=Date.now()-40000;mono=0;now(){return this.time;}monotonic(){return this.mono;}advance(ms){this.time+=ms;this.mono+=ms;}}
const clock=new Clock(),service=new JournalService(new SqliteJournalStore(file),clock,true);
for(const title of ['整理今天的工作记录','阅读并记录要点']){
 const taskId=service.execute({type:'task.save',payload:{title,estimateMinutes:25}}).state.tasks.at(-1).id;
 service.execute({type:'focus.start',payload:{taskId,targetMinutes:1}});
}
clock.advance(40000);service.shutdown();console.log(`Created isolated paused timers: ${file}`);
