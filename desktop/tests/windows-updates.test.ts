import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createHash} from 'node:crypto';
import {mkdtemp, readdir, readFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {selectUpdate} from '../electron/release-updates';
import {WindowsUpdates} from '../electron/windows-updates';

const version='0.41.3';
const name=`FocusJournal-${version}-Windows-x64-Setup.exe`;
const body='fixture only';
const url=`https://github.com/wheelBL/focus-journal/releases/download/v${version}/${name}`;
const asset={name, browser_download_url:url, size:body.length, state:'uploaded', digest:`sha256:${createHash('sha256').update(body).digest('hex')}`};
const release={tag_name:`v${version}`, draft:false, prerelease:false, assets:[asset]};

test('Windows requires the matching stable installer, source, size, and digest',()=>{
  for(const broken of [{...asset, name:name.replace('Setup.exe','zip')},{...asset,browser_download_url:'https://example.org/setup.exe'},
    {...asset,digest:''},{...asset,size:0}]) {
    assert.deepEqual(selectUpdate({...release,assets:[broken]},'0.41.2','win32','x64'),{state:'unavailable'});
  }
  assert.deepEqual(selectUpdate({...release,prerelease:true},'0.41.2','win32','x64'),{state:'unavailable'});
  assert.deepEqual(selectUpdate(release,'0.42.0','win32','x64'),{state:'current'});
});

test('checking only fetches metadata; a click starts one verified download; failures keep the app open for retry',async()=>{
  const cache=await mkdtemp(path.join(tmpdir(),'focus-win-update-'));
  let downloads=0,checks=0,launches=0,quits=0;
  const directory=path.join(cache,'existing app');
  const updates=new WindowsUpdates({cache,directory,arch:'x64',version:'0.41.2',
    fetch:async address=>{
      if(address===url){downloads++;return new Response(downloads===1?'bad contents':body);}
      checks++;return Response.json(release);
    }, changed:()=>{}, launch:async(file,target)=>{assert.equal(await readFile(file,'utf8'),body);assert.equal(target,directory);launches++;},
    quit:()=>{quits++; return true;},
  });
  try{
    await updates.clearOldDownloads();
    await Promise.all([updates.check(),updates.check()]);
    assert.deepEqual([checks,downloads],[1,0]);
    await assert.rejects(updates.install(),/校验失败/);
    assert.deepEqual([launches,quits],[0,0]);
    assert.deepEqual(await readdir(cache),[]);
    assert.deepEqual(updates.state,{version,downloading:false});
    await Promise.all([updates.install(),updates.install()]);
    assert.deepEqual([downloads,launches,quits],[2,1,1]);
  }finally{updates.dispose();await rm(cache,{recursive:true,force:true});}
});
