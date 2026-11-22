/** Native acceptance on a disposable Windows runner: real setup, GitHub-shaped metadata and local asset bytes. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {readFile, mkdtemp, mkdir, writeFile, access} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {WindowsUpdates} from '../electron/windows-updates';

const {version} = JSON.parse(await readFile('package.json', 'utf8'));
const name = `FocusJournal-${version}-Windows-x64-Setup.exe`;
const url = `https://github.com/wheelBL/focus-journal/releases/download/v${version}/${name}`;
const bytes = await readFile(path.join('release', name));
const digest = createHash('sha256').update(bytes).digest('hex');
const root = await mkdtemp(path.join(tmpdir(), 'focus journal 验证 '));
const directory = path.join(root, '专注记 & test');
await mkdir(directory);
const existing = path.join(directory,'personal-file.txt');
await writeFile(existing, 'keep');
const parent = spawn(process.execPath, ['-e', 'setInterval(()=>{},1000)']);
await once(parent, 'spawn');
let completed: Promise<unknown[]> | undefined;
let downloads = 0;
const updates = new WindowsUpdates({version:'0.0.1', arch:'x64', directory, cache:path.join(root,'cache'),
  fetch:async address => {
    if (address === url) { downloads++; return new Response(bytes); }
    assert.equal(address, 'https://api.github.com/repos/wheelBL/focus-journal/releases/latest');
    return Response.json({tag_name:`v${version}`, draft:false, prerelease:false, assets:[{name, browser_download_url:url, size:bytes.length,digest:`sha256:${digest}`,state:'uploaded'}]});
  }, changed:()=>{}, launch:async (file, target) => {
    const child = spawn(file, ['/VERYSILENT','/NORESTART','/SUPPRESSMSGBOXES','/FocusNoLaunch=1',`/FocusParent=${parent.pid}`,`/DIR=${target}`]);
    completed = once(child, 'exit');
    await once(child, 'spawn');
    await delay(2000);
    await assert.rejects(access(path.join(directory, 'build-info.json')), {code:'ENOENT'});
  }, quit:()=>parent.kill(),
});
try {
  await updates.clearOldDownloads();
  await updates.check();
  assert.deepEqual(updates.state,{version,downloading:false});
  assert.equal(downloads,0);
  await updates.install();
  assert.equal(downloads,1);
  assert.ok(completed);
  assert.equal((await completed)[0],0);
  const info = JSON.parse(await readFile(path.join(directory,'build-info.json'),'utf8'));
  assert.equal(info.app,version); assert.equal(info.qa,false);
  const asar = await readFile(path.join(directory,'resources/app.asar'));
  assert.equal(createHash('sha256').update(asar).digest('hex'),info.asarSha256);
  assert.equal(await readFile(existing,'utf8'),'keep');
  const exe = path.join(directory,'专注记.exe');
  const profile = path.join(root,'isolated-profile');
  const app = spawn(exe,['--data-dir',profile],{stdio:'ignore'});
  try {
    let ready=false;
    for(let attempt=0;attempt<60;attempt++){
      const log=await readFile(path.join(profile,'startup.log'),'utf8').catch(()=> '');
      if(log.includes(`"version":"${version}"`) && log.includes(' ready ')){ ready=true;break; }
      await delay(500);
    }
    assert.ok(ready,'installed app must open its main window');
  } finally {
    const exit=app.exitCode===null?once(app,'exit'):undefined;
    if(exit){spawn(exe,['--data-dir',profile,'--quit'],{stdio:'ignore'});await exit;}
  }
  console.log(`Verified click-to-install with ${name}, wait for exit, install path, app hash, existing file and native startup.`);
} finally { parent.kill(); updates.dispose(); }
