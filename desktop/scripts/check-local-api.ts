import {app,BrowserWindow,ipcMain,safeStorage} from 'electron';
import {createServer} from 'node:http';
import {randomUUID} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import {JournalService} from '../core/service';
import {emptyState,type JournalState} from '../core/types';
import {LocalApiController} from '../electron/local-api-controller';
import {SyncController} from '../electron/sync-controller';
import {blankSync} from '../electron/sync-storage';

const root=process.cwd(),version=JSON.parse(readFileSync('package.json','utf8')).version;
const output=path.join(root,`qa-evidence/release-${version}/local-api`),profile=path.join(root,`qa-data/local-api-${version}-${Date.now()}`);
mkdirSync(output,{recursive:true});mkdirSync(profile,{recursive:true});app.setPath('userData',profile);app.disableHardwareAcceleration();
class Store{path='isolated local API QA';state=emptyState();load(){return structuredClone(this.state);}save(s:JournalState){this.state=structuredClone(s);}close(){}}
const service=new JournalService(new Store(),undefined,true);
let win:BrowserWindow,api:LocalApiController,sync:SyncController;
const failures:string[]=[],checks:any[]=[],flows:string[]=[];
const delay=(ms:number)=>new Promise(r=>setTimeout(r,ms)),run=(code:string)=>win.webContents.executeJavaScript(code);
async function until(code:string){for(let n=0;n<100;n++){if(await run(code))return;await delay(40);}throw Error('UI condition timed out: '+code);}
async function click(selector:string){
 await until(`!!document.querySelector(${JSON.stringify(selector)})`);
 await run(`document.querySelector(${JSON.stringify(selector)}).scrollIntoView({block:'center'})`);
 await run('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
 const p=await run(`(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`),zoom=win.webContents.getZoomFactor(),point={x:Math.round(p.x*zoom),y:Math.round(p.y*zoom)};
 for(const type of ['mouseMove','mouseDown','mouseUp'] as const)win.webContents.sendInputEvent({type,button:'left',clickCount:1,...point});await delay(100);
}
async function button(text:string){await run(`(()=>{const b=[...document.querySelectorAll('#settings-api button')].find(e=>e.textContent.trim()===${JSON.stringify(text)});if(!b)throw Error('Missing API action');b.dataset.qaAction='true';})()`);await click('[data-qa-action=true]');await run(`document.querySelector('[data-qa-action=true]')?.removeAttribute('data-qa-action')`);}
const changed=()=>win?.webContents.send('journal:changed');
async function main(){try{
 await app.whenReady();
 sync=new SyncController({journal:service,persistence:{load:blankSync,save:()=>{}},vault:{encrypt:()=>'',decrypt:()=>''},remote:()=>{throw Error('No QA remote configured');},backup:()=>{},changed:()=>{},journalChanged:changed});
 api=new LocalApiController(service,path.join(profile,'local-api.json'),{encrypt:t=>safeStorage.encryptString(t).toString('base64'),decrypt:t=>safeStorage.decryptString(Buffer.from(t,'base64'))},changed,version,sync);
 ipcMain.handle('journal:snapshot',()=>service.snapshot());ipcMain.handle('journal:clock',()=>service.clockSnapshot());ipcMain.handle('journal:command',(_e,c)=>{const s=service.execute(c);changed();return s;});
 ipcMain.handle('journal:capture-preferences',()=>({shortcut:'',registered:false}));ipcMain.handle('journal:window',()=>{});ipcMain.handle('sync:status',()=>sync.status());
 for(const [name,fn] of Object.entries({status:()=>api.status(),configure:(value:any)=>api.configure(value),token:()=>api.token(),'rotate-token':()=>api.rotateToken()}))ipcMain.handle('local-api:'+name,(_event,...args)=>fn(...args as [any]));
 win=new BrowserWindow({show:false,width:1487,height:1058,frame:false,webPreferences:{preload:path.join(root,'dist-electron/preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true,offscreen:true,backgroundThrottling:false}});
 win.webContents.on('console-message',(_e,level,message)=>{if(level>=3)failures.push(message);});
 await win.loadFile(path.join(root,'dist/client/index.html'));await until(`!!document.querySelector('.today-page')`);
 await click('[aria-label="设置"]');await until(`!!document.querySelector('#settings-api')`);
 const temp=createServer();await new Promise<void>(r=>temp.listen(0,'127.0.0.1',r));const port=(temp.address() as {port:number}).port;await new Promise<void>(r=>temp.close(()=>r()));
 await click('[aria-label="API 端口"]');await run(`(()=>{const e=document.querySelector('[aria-label="API 端口"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(String(port))});e.dispatchEvent(new Event('input',{bubbles:true}));})()`);
 await click('[aria-label="启用本机 API"]');await button('保存 API 设置');await until(`!!document.querySelector('[aria-label="API 连接地址"]')`);
 if(!api.status().running||api.status().access!=='read'||api.status().port!==port)throw Error('Pointer save did not enable readonly listener');
 let token=api.token();const base=api.status().baseUrl!;
 const get=async(route:string,key=token)=>{const r=await fetch(base+route,{headers:{Authorization:`Bearer ${key}`}});return {status:r.status,body:await r.json() as any};};
 const command=async(type:string,payload:any)=>{const r=await fetch(base+'/commands',{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json','If-Match':(await get('/status')).body.revision,'Idempotency-Key':randomUUID()},body:JSON.stringify({type,payload})});return {status:r.status,body:await r.json() as any};};
 if((await command('item.create',{title:'只读不能创建'})).status!==403)throw Error('Readonly changed data');
 await run(`(()=>{const e=document.querySelector('[aria-label="API 访问权限"]');e.value='write';e.dispatchEvent(new Event('change',{bubbles:true}));})()`);await button('保存 API 设置');
 await button('显示访问密钥');if(await run(`document.querySelector('[aria-label="API 访问密钥"]').value.length`)!==64)throw Error('Key did not display');
 await button('隐藏访问密钥');await button('重新生成密钥');const old=token;token=api.token();if((await get('/status',old)).status!==401)throw Error('Old key still accepted');await button('隐藏访问密钥');
 if(readFileSync(path.join(profile,'local-api.json'),'utf8').includes(token))throw Error('Secret stored as plaintext');
 flows.push('pointer enable and save','readonly enforced','key display hide rotate','Windows encrypted token');
 for(const [width,height,zoom] of [[1487,1058,1],[900,640,1.25],[1060,720,1.5]]){
  win.setContentSize(width,height);win.webContents.setZoomFactor(zoom);await delay(150);await run(`document.querySelector('#settings-api').scrollIntoView({block:'start'})`);await delay(100);
  const geometry=await run(`(()=>{const s=document.querySelector('#settings-api'),inputs=[...s.querySelectorAll('input,select')];return {overflow:document.documentElement.scrollWidth>innerWidth+1,clipped:inputs.some(e=>e.getBoundingClientRect().right>innerWidth+1),secretVisible:!!s.querySelector('[aria-label="API 访问密钥"]')};})()`);
  checks.push({width,height,zoom,...geometry});if(geometry.overflow||geometry.clipped||geometry.secretVisible)throw Error('API settings layout');
  writeFileSync(path.join(output,`settings-${width}-${zoom}.png`),(await win.webContents.capturePage()).toPNG());
 }
 win.setContentSize(1487,1058);win.webContents.setZoomFactor(1);await delay(120);
 const added=await command('item.create',{title:'API 联动验证事项',tagNames:['API验证']});if(added.status!==200)throw Error(JSON.stringify(added.body));const id=added.body.data.createdItemIds[0];
 await command('item.focus',{id});await click('[aria-label="事项"]');await until(`!!document.querySelector('[data-outline-id="${id}"] .daily-focus-badge')`);
 const started=await command('focus.start',{taskId:id}),sid=started.body.data.createdSessionIds[0];await until(`document.querySelector('[data-outline-id="${id}"]').textContent.includes('计时中')||document.querySelector('[data-outline-id="${id}"]').textContent.includes('专注中')`);
 await command('focus.pause',{sessionId:sid});await command('focus.stop',{sessionId:sid});await command('session.manual',{taskId:id,date:'2026-10-19',minutes:20,summary:'通过接口补记'});
 if((await get('/items/'+id)).body.data.effort.ownMs<1200000)throw Error('Manual effort missing');
 if((await get('/sync/status')).body.data.phase!=='unconfigured')throw Error('Sync status unavailable');
 flows.push('API create and focus reflected in tree','API timer reflected in UI','manual effort reaches item','sync status through same service');
 const python=process.env.PYTHON??'python';
 const cli=await promisify(execFile)(python,[path.join(root,'tools/journal-api.py'),'--url',base,'read','/status'],{env:{...process.env,FOCUS_JOURNAL_TOKEN:token,PYTHONIOENCODING:'utf-8'},windowsHide:true});
 if(JSON.parse(cli.stdout).data.appVersion!==version)throw Error('Python client failed');flows.push('Python client against actual Electron API');
 await click('[aria-label="设置"]');await click('[aria-label="启用本机 API"]');await button('保存 API 设置');if(api.status().running)throw Error('Disable did not close API');
 let closed=false;try{await get('/status');}catch{closed=true;}if(!closed)throw Error('Listener remained active');
 flows.push('pointer disable closes listener');
 }catch(e){failures.push(String(e));console.error(e);if(win)writeFileSync(path.join(output,'failure.png'),(await win.webContents.capturePage()).toPNG());}
 finally{api?.dispose();sync?.dispose();win?.destroy();service.shutdown();writeFileSync(path.join(output,'results.json'),JSON.stringify({version,checks,flows,failures,qaProfile:profile},null,2));console.log(JSON.stringify({cases:checks.length,flows:flows.length,failures,output}));app.exit(failures.length?1:0);}
}
void main();
