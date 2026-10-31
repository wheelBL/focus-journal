import {spawn} from 'node:child_process';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import {macAppPath} from './macos-config.mjs';
if(process.platform!=='darwin')throw Error('macOS 原生验证需在 Mac 上运行。');
const root=process.cwd(),pkg=JSON.parse(readFileSync('package.json','utf8')),arch=process.arch;
const executable=path.join(macAppPath(root,arch,true),'Contents/MacOS/专注记'),output=path.join(root,'qa-evidence',`release-${pkg.version}`,`macos-${arch}`);mkdirSync(output,{recursive:true});
for(const restart of [false,true]){
 const name=restart?'restart':'smoke';let stdout='',stderr='';
 const child=spawn(executable,restart?['--restart-verification']:[],{detached:true,stdio:['ignore','pipe','pipe']});
 child.stdout.on('data',v=>stdout+=v);child.stderr.on('data',v=>stderr+=v);
 const timeout=setTimeout(()=>{try{process.kill(-child.pid,'SIGKILL');}catch{}},60000);
 let code;try{code=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',resolve);});}finally{clearTimeout(timeout);try{process.kill(-child.pid,'SIGKILL');}catch{}writeFileSync(path.join(output,name+'.log'),stdout);writeFileSync(path.join(output,name+'.err'),stderr);}
 const result=JSON.parse(readFileSync(path.join(output,name+'.json'),'utf8'));
 if(code!==0||result.failures.length||result.remainingWindows!==0)throw Error(`macOS ${name} failed: ${JSON.stringify(result)}`);
 console.log(`${arch} ${name}: ${result.checks.length} passed; no windows left`);
}
