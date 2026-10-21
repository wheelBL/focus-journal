import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {spawn,spawnSync} from 'node:child_process';
import {mkdtempSync,mkdirSync,rmSync,readFileSync} from 'node:fs';
import fs from 'node:fs';
import path from 'node:path';
import * as git from 'isomorphic-git';
import {GitCodeRemote,secureGitHttp,gitFailure,SYNC_FILE} from '../electron/gitcode-remote';

test('loopback Git HTTP upload/download preserves history and unrelated files; stale pushes and failed auth do not overwrite',async()=>{
 const folder=mkdtempSync(path.resolve('qa-evidence/git-http-')),bare=path.join(folder,'journal.git');mkdirSync(bare);
 const command=(args:string[])=>{const r=spawnSync('git',args,{encoding:'utf8',windowsHide:true});assert.equal(r.status,0,r.stderr);return r.stdout.trim();};
 command(['init','--bare',bare]);command(['-C',bare,'config','http.receivepack','true']);
 const credentials=Buffer.from('tester:fake-test-token').toString('base64');let requests=0,rejected=0;
 const server=createServer(async(req,res)=>{
  if(req.headers.authorization!==`Basic ${credentials}`){rejected++;res.writeHead(401,{'WWW-Authenticate':'Basic realm="Test Git"'});res.end();return;}
  requests++;const chunks:Buffer[]=[];for await(const c of req)chunks.push(c);const body=Buffer.concat(chunks);const url=new URL(req.url!,'http://localhost');
  const service=req.method==='GET'?url.searchParams.get('service'):url.pathname.split('/').at(-1);
  if(!['git-upload-pack','git-receive-pack'].includes(service??'')){res.statusCode=404;res.end();return;}
  const args=[service!.slice(4),'--stateless-rpc',...(req.method==='GET'?['--advertise-refs']:[]),bare];
  const child=spawn('git',args,{env:{...process.env,GIT_PROTOCOL:String(req.headers['git-protocol']??'')},windowsHide:true});
  const output:Buffer[]=[];child.stdout.on('data',c=>output.push(c));child.stderr.resume();
  child.on('error',()=>{res.statusCode=500;res.end();});child.on('close',code=>{if(code){res.statusCode=500;res.end();return;}
   res.setHeader('Content-Type',`application/x-${service}-${req.method==='GET'?'advertisement':'result'}`);
   if(req.method==='GET'){const line=`# service=${service}\n`;res.write((Buffer.byteLength(line)+4).toString(16).padStart(4,'0')+line+'0000');}
   res.end(Buffer.concat(output));});child.stdin.end(body);
 });
 await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));const address=server.address() as {port:number};
 const url=`http://127.0.0.1:${address.port}/journal.git`,config={repository:url,branch:'focus-journal',username:'tester',token:'fake-test-token'};
 const http=(signal:AbortSignal):git.HttpClient=>({request:async r=>{const destination=new URL(r.url);assert.equal(destination.origin,new URL(url).origin,'Tests may contact only their ephemeral loopback server');assert.ok(destination.pathname.startsWith('/journal.git/'),'Tests may use only their synthetic repository');const chunks:Uint8Array[]=[];if(r.body)for await(const c of r.body)chunks.push(c);const response=await fetch(r.url,{method:r.method,headers:r.headers,body:chunks.length?Buffer.concat(chunks):undefined,signal,redirect:'error'});const bytes=new Uint8Array(await response.arrayBuffer());return {url:response.url,statusCode:response.status,statusMessage:response.statusText,headers:Object.fromEntries(response.headers),body:(async function*(){yield bytes;})()};}});
 const signal=new AbortController().signal,a=new GitCodeRemote(path.join(folder,'a'),config,http),b=new GitCodeRemote(path.join(folder,'b'),config,http);
 try{
  await a.test(signal);assert.deepEqual(await a.read(signal),{head:null,content:null});
  const first=await a.write(null,'first snapshot',signal);
  assert.equal((await b.read(signal)).content,'first snapshot');
  const second=await b.write(first,'second snapshot',signal);assert.equal((await a.read(signal)).content,'second snapshot');
  const commit=await git.readCommit({fs,gitdir:bare,oid:second});assert.deepEqual(commit.commit.parent,[first]);
  await assert.rejects(a.write(first,'stale snapshot',signal),/远端刚刚/);assert.equal((await a.read(signal)).head,second);
  const tree=(await git.readTree({fs,gitdir:bare,oid:second})).tree;const blob=await git.writeBlob({fs,gitdir:bare,blob:Buffer.from('keep me')});const treeOid=await git.writeTree({fs,gitdir:bare,tree:[...tree,{mode:'100644',path:'README.md',oid:blob,type:'blob'}]});
  const external=await git.commit({fs,gitdir:bare,ref:'refs/heads/focus-journal',parent:[second],tree:treeOid,message:'external file',author:{name:'Tester',email:'test@example.invalid'}});
  const last=await a.write(external,'third snapshot',signal);const lastTree=(await git.readTree({fs,gitdir:bare,oid:last})).tree;assert.deepEqual(lastTree.map(t=>t.path),['README.md',SYNC_FILE]);assert.equal(Buffer.from((await git.readBlob({fs,gitdir:bare,oid:last,filepath:'README.md'})).blob).toString(),'keep me');
  assert.equal((await git.readCommit({fs,gitdir:bare,oid:last})).commit.parent[0],external);
  const denied=new GitCodeRemote(path.join(folder,'denied'),{...config,token:'wrong-token'},http);await assert.rejects(denied.test(signal),/身份验证/);assert.equal((await a.read(signal)).head,last);
  assert.ok(requests>8);assert.ok(rejected>0);assert.doesNotMatch(readFileSync(path.join(folder,'a','.git','config'),'utf8'),/fake-test-token|Basic /);
 }finally{await new Promise<void>((resolve,reject)=>server.close(e=>e?reject(e):resolve()));const relative=path.relative(path.resolve('qa-evidence'),path.resolve(folder));assert.ok(relative.startsWith('git-http-')&&!relative.includes(path.sep)&&!path.isAbsolute(relative),'Cleanup must stay inside the isolated QA folder');rmSync(folder,{recursive:true,force:true});}
});

test('production HTTP refuses foreign destinations and error messages never expose server-supplied secrets',async()=>{
 const http=secureGitHttp('https://gitcode.com/team/repo.git',new AbortController().signal);
 for(const url of ['https://other.example/repo','https://gitcode.com/team/repo.git.evil/info/refs','https://gitcode.com/other/repo.git/info/refs'])await assert.rejects(http.request({url}),/地址不匹配/);
 for(const error of [{code:'HttpError',data:{statusCode:401},message:'secret'},{code:'HttpError',data:{statusCode:403},message:'secret'},{code:'HttpError',data:{statusCode:404},message:'secret'},{code:'UnknownError',message:'secret'}])assert.doesNotMatch(gitFailure(error).message,/secret/);
});
