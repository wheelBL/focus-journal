import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {spawn,execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {build} from 'esbuild';
import {JournalService} from '../core/service.ts';
import {SqliteJournalStore} from '../core/store.ts';
import {outsideLaunchScript} from '../electron/windows-workspace-launch.ts';
const version=JSON.parse(fs.readFileSync('package.json','utf8')).version;
const output=path.resolve(`qa-evidence/workspace-location-${version}`),runtime=path.resolve('node_modules/electron/dist/electron.exe'),script=path.resolve('scripts/workspace-native-smoke.cjs');
fs.mkdirSync(output,{recursive:true});fs.mkdirSync('qa-data',{recursive:true});
const root=fs.mkdtempSync(path.resolve('qa-data/workspace-native-')),bundle=path.join(output,'workspace-bundle.cjs');
await build({stdin:{contents:"export * from './electron/workspace-location';",resolveDir:process.cwd()},outfile:bundle,bundle:true,platform:'node',format:'cjs',external:['node:sqlite']});
const legacy=path.join(root,'home','AppData','Roaming','专注记');
const service=new JournalService(new SqliteJournalStore(path.join(legacy,'journal.sqlite')));
try{const state=service.execute({type:'task.save',payload:{title:'Synthetic native migration evidence',parentId:'inbox'}}).state;service.execute({type:'session.manual',payload:{taskId:state.tasks.at(-1).id,date:'2026-10-22',minutes:12,summary:'Synthetic effort'}});}finally{service.shutdown();}
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const run=phase=>new Promise((resolve,reject)=>{
 const child=spawn(runtime,[script,phase,root,bundle],{windowsHide:true,stdio:'ignore'}),timeout=setTimeout(()=>{child.kill();reject(Error('Fixture timeout: '+phase));},15000);
 child.once('error',reject);child.once('exit',code=>{clearTimeout(timeout);try{assert.equal(code,0);const result=JSON.parse(fs.readFileSync(path.join(root,phase+'.json'),'utf8'));assert.equal(result.ok,true,JSON.stringify(result));resolve(result);}catch(error){reject(error);}});
});
const result={root,checks:[],phases:{}};let holder;
try{
 for(const phase of ['prepare','migrate','verify'])result.phases[phase]=await run(phase);
 holder=spawn(runtime,[script,'holder',root,bundle],{windowsHide:true,stdio:['ignore','ignore','ignore','ipc']});
 await new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(Error('Holder timeout')),10000);holder.once('message',()=>{clearTimeout(timeout);resolve();});holder.once('error',reject);});
 result.phases.lockCheck=await run('lock-check');
 await new Promise(resolve=>{holder.once('exit',resolve);holder.send({quit:true});});holder=undefined;
 const scriptText=outsideLaunchScript(runtime,[script,'probe',root,bundle],path.resolve('qa-data'));
 await promisify(execFile)(path.join(process.env.SystemRoot??'C:\\Windows','System32','WindowsPowerShell','v1.0','powershell.exe'),['-NoLogo','-NoProfile','-NonInteractive','-WindowStyle','Hidden','-EncodedCommand',Buffer.from(scriptText,'utf16le').toString('base64')],{windowsHide:true,timeout:15000});
 for(let attempt=0;attempt<100&&!fs.existsSync(path.join(root,'probe.json'));attempt++)await wait(100);
 result.phases.probe=JSON.parse(fs.readFileSync(path.join(root,'probe.json'),'utf8'));assert.equal(result.phases.probe.ok,true);
 result.ok=true;result.checks=Object.values(result.phases).flatMap(phase=>phase.checks??['Existing source-profile lock prevents migration while in use']);
 fs.writeFileSync(path.join(output,'result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify({ok:true,checks:result.checks.length,phases:Object.keys(result.phases),output}));
}finally{if(holder)holder.send({quit:true});}
