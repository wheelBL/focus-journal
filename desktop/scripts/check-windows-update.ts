/** Run the production download + installer launcher on a disposable Windows CI account. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {fork, spawn} from 'node:child_process';
import {once} from 'node:events';
import {readFile, mkdtemp, mkdir, writeFile, access} from 'node:fs/promises';
import {homedir, tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {setTimeout as delay} from 'node:timers/promises';
import {WindowsUpdates, launchWindowsInstaller} from '../electron/windows-updates';
import {initializeWorkspace, WORKSPACE_MARKER} from '../electron/workspace-location';

assert.equal(process.platform, 'win32');
assert.equal(process.env.RUNNER_ENVIRONMENT, 'github-hosted', 'Use a disposable hosted Windows runner.');
const {version} = JSON.parse(await readFile('package.json', 'utf8'));
const name = `FocusJournal-${version}-Windows-x64-Setup.exe`;
async function simulatedOldClient(root: string, directory: string) {
  const url = `https://github.com/wheelBL/focus-journal/releases/download/v${version}/${name}`;
  const bytes = await readFile(path.join('release', name));
  const digest = createHash('sha256').update(bytes).digest('hex');
  let downloads = 0;
  const updates = new WindowsUpdates({version:'0.0.1', arch:'x64', directory, cache:path.join(root,'cache'),
    fetch:async address => {
      if (address === url) { downloads++; return new Response(bytes); }
      assert.equal(address, 'https://api.github.com/repos/wheelBL/focus-journal/releases/latest');
      return Response.json({tag_name:`v${version}`, draft:false, prerelease:false, assets:[{name, browser_download_url:url, size:bytes.length,digest:`sha256:${digest}`,state:'uploaded'}]});
    }, changed:()=>{}, launch:launchWindowsInstaller, quit:()=>{process.send!('quit-requested');return true;},
  });
  await updates.clearOldDownloads();
  await updates.check();
  assert.deepEqual(updates.state,{version,downloading:false});
  assert.equal(downloads,0);
  const releaseParent=once(process,'message');
  await updates.install();
  assert.equal(downloads,1);
  await releaseParent;
  updates.dispose();
  process.disconnect!();
}

async function verifyInstalledUpdate() {
  const profile=path.join(homedir(),'.focus-journal');
  await assert.rejects(access(profile),{code:'ENOENT'});
  await initializeWorkspace(profile,null);
  const marker=await readFile(path.join(profile,WORKSPACE_MARKER),'utf8');
  const root = await mkdtemp(path.join(tmpdir(), 'focus journal 验证 '));
  const directory = path.join(root, '专注记 & test');
  await mkdir(directory);
  const existing = path.join(directory,'personal-file.txt');
  await writeFile(existing, 'keep');
  const client=fork(fileURLToPath(import.meta.url),['--client',root,directory]);
  try {
    const exited=once(client,'exit');
    const message=await Promise.race([once(client,'message'),exited.then(()=>{throw Error('Update client exited before launching Setup.');})]);
    assert.equal(message[0],'quit-requested');
    await delay(2000);
    await assert.rejects(access(path.join(directory, 'build-info.json')), {code:'ENOENT'});
    client.send('saved-and-closed');
    assert.equal((await exited)[0],0);
    let ready=false;
    for(let attempt=0;attempt<180;attempt++){
      const log=await readFile(path.join(profile,'startup.log'),'utf8').catch(()=> '');
      if(log.includes(`"version":"${version}"`) && log.includes(' ready ')){ ready=true;break; }
      await delay(1000);
    }
    assert.ok(ready,'Setup must reopen the installed application automatically');
    const info=JSON.parse(await readFile(path.join(directory,'build-info.json'),'utf8'));
    assert.equal(info.app,version); assert.equal(info.qa,false);
    const asar=await readFile(path.join(directory,'resources/app.asar'));
    assert.equal(createHash('sha256').update(asar).digest('hex'),info.asarSha256);
    assert.equal(await readFile(existing,'utf8'),'keep');
    assert.equal(await readFile(path.join(profile,WORKSPACE_MARKER),'utf8'),marker);
    const quit=spawn(path.join(directory,'专注记.exe'),['--quit'],{stdio:'ignore'});
    assert.equal((await once(quit,'exit'))[0],0);
    console.log(`Verified ${name}: metadata-only check, real installer launch, existing directory, saved workspace and automatic app restart.`);
  }finally{if(client.exitCode===null)client.kill();}
}

if(process.argv[2]==='--client')await simulatedOldClient(process.argv[3],process.argv[4]);
else await verifyInstalledUpdate();
