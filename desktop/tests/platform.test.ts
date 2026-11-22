import {test} from 'node:test';
import assert from 'node:assert/strict';
import {primaryModifier,defaultCaptureShortcut,shortcutLabel} from '../core/desktop-platform';
import {mainWindowChrome,applicationMenu,configureCompanionWindow} from '../electron/desktop-platform';
import {CaptureShortcut} from '../electron/capture-shortcut';
import {MacUpdates, replaceMacApp} from '../electron/mac-updates';
import {selectUpdate} from '../electron/release-updates';
import {macosConfig} from '../scripts/macos-config.mjs';
import {mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {Script} from 'node:vm';
import ts from 'typescript';
test('platform conventions retain Windows control and isolate native macOS window chrome',()=>{
 assert.equal(primaryModifier({ctrlKey:true,metaKey:false},'win32'),true);assert.equal(primaryModifier({ctrlKey:true,metaKey:false},'darwin'),false);assert.equal(primaryModifier({ctrlKey:false,metaKey:true},'darwin'),true);
 assert.equal(shortcutLabel('Ctrl+Enter','darwin'),'⌘+Enter');assert.equal(shortcutLabel('Ctrl+Enter','win32'),'Ctrl+Enter');
 assert.equal(mainWindowChrome('darwin').titleBarOverlay,undefined);assert.deepEqual(mainWindowChrome('darwin').trafficLightPosition,{x:14,y:14});assert.ok(mainWindowChrome('win32').titleBarOverlay);
 const spaces:unknown[]=[];const companion={setVisibleOnAllWorkspaces:(...args:unknown[])=>{spaces.push(args);}};configureCompanionWindow(companion,'win32');assert.equal(spaces.length,0);configureCompanionWindow(companion,'darwin');assert.deepEqual(spaces,[[true,{visibleOnFullScreen:true}]]);
 assert.equal(applicationMenu('win32','专注记'),null);assert.ok(applicationMenu('darwin','专注记')!.some(m=>m.label==='编辑'));
 const edits:string[]=[],editMenu=applicationMenu('darwin','专注记',action=>edits.push(action))!.find(m=>m.label==='编辑')!.submenu as import('electron').MenuItemConstructorOptions[];
 for(const item of editMenu)if(item.click)(item.click as ()=>void)();assert.deepEqual(edits,['undo','redo','selectAll']);
});
test('macOS default capture shortcut registers without breaking existing Windows customizations',()=>{
 const registered=new Set<string>(),s=new CaptureShortcut({register:key=>{registered.add(key);return true;},unregister:key=>{registered.delete(key);},isRegistered:key=>registered.has(key)},()=>{},()=>{});
 s.configure(defaultCaptureShortcut('darwin'));assert.equal(s.preferences().registered,true);s.configure('Command+Option+K');assert.equal(s.preferences().shortcut,'Command+Option+K');s.configure(defaultCaptureShortcut('win32'));assert.equal(s.preferences().shortcut,'Ctrl+Alt+Space');s.dispose();assert.equal(registered.size,0);
});
test('macOS production package has explicit ad-hoc signing and excludes QA entries and personal data',()=>{
 const pkg={build:{appId:'local.focusjournal.desktop',productName:'专注记'},devDependencies:{electron:'44.9.0'},version:'0.30.0'};
 const config=macosConfig(pkg,{root:process.cwd(),stage:'/stage',output:'/output'});assert.equal(config.mac.identity,'-');assert.equal(config.mac.notarize,false);assert.equal(config.asar,true);assert.equal(config.files.some((f:string)=>f.includes('qa-')),false);
 assert.equal(macosConfig(pkg,{root:process.cwd(),stage:'/stage',output:'/output',qa:true}).files.includes('qa-start.cjs'),true);
});

const updateName = 'FocusJournal-0.41.10-macOS-arm64.zip';
const updateUrl = `https://github.com/wheelBL/focus-journal/releases/download/v0.41.10/${updateName}`;
const updateAsset = {name:updateName,browser_download_url:updateUrl,size:3,digest:`sha256:${'a'.repeat(64)}`,state:'uploaded'};
const updateRelease = {tag_name:'v0.41.10',draft:false,prerelease:false,assets:[updateAsset]};

test('macOS update selection requires a newer stable release and the verified asset for the current architecture',()=>{
 assert.deepEqual(selectUpdate(updateRelease,'0.41.9','darwin','arm64'),{version:'0.41.10',url:updateUrl,size:3,digest:'a'.repeat(64)});
 assert.deepEqual(selectUpdate(updateRelease,'0.41.10','darwin','arm64'),{state:'current'});
 assert.deepEqual(selectUpdate(updateRelease,'0.42.0','darwin','arm64'),{state:'current'});
 assert.deepEqual(selectUpdate(updateRelease,'0.41.9','darwin','x64'),{state:'unavailable'});
 assert.deepEqual(selectUpdate({...updateRelease,prerelease:true},'0.41.9','darwin','arm64'),{state:'unavailable'});
 assert.deepEqual(selectUpdate({...updateRelease,assets:[{...updateAsset,digest:undefined}]},'0.41.9','darwin','arm64'),{state:'unavailable'});
});

test('the macOS menu keeps a downloaded update visible and opens its update action',()=>{
 let clicks=0;
 const check=()=>{clicks++;};
 const items=(version?:string)=>applicationMenu('darwin','专注记',undefined,{check,version})![0].submenu as import('electron').MenuItemConstructorOptions[];
 assert.ok(items().some(item=>item.label==='检查更新…'));
 const ready=items('0.41.10').find(item=>item.label==='新版 0.41.10 已就绪…');
 assert.ok(ready);
 (ready.click as ()=>void)();
 assert.equal(clicks,1);
});

test('a failed update download leaves the current app intact and can be retried',async()=>{
 const root=mkdtempSync(path.join(tmpdir(),'focus-update-test-'));
 try{
  const target=path.join(root,'current.app');
  writeFileSync(target,'current');
  let checks=0;
  const fetchUpdate:typeof fetch=async url=>{
   if(url===updateUrl)return new Response('bad');
   checks++;
   return Response.json(updateRelease);
  };
  const updates=new MacUpdates({target,version:'0.41.9',arch:'arm64',fetch:fetchUpdate});
  const first=updates.check();
  assert.equal(updates.check(),first);
  await assert.rejects(first,/SHA-256/);
  await assert.rejects(updates.check(),/SHA-256/);
  assert.equal(checks,2);
  assert.equal(updates.install(),false);
  assert.equal(readFileSync(target,'utf8'),'current');
  assert.deepEqual(readdirSync(root),['current.app']);
 }finally{rmSync(root,{recursive:true,force:true});}
});

test('macOS replacement restores the original app when the staged bundle cannot be moved',()=>{
 const root=mkdtempSync(path.join(tmpdir(),'focus-replace-test-'));
 try{
  const current=path.join(root,'current.app'), staged=path.join(root,'staged.app'), backup=path.join(root,'backup.app');
  writeFileSync(current,'current');
  assert.throws(()=>replaceMacApp(current,staged,backup),{code:'ENOENT'});
  assert.equal(readFileSync(current,'utf8'),'current');
  assert.deepEqual(readdirSync(root),['current.app']);
 }finally{rmSync(root,{recursive:true,force:true});}
});

test('native QA renderer expressions parse before remote packaging',()=>{
 const source=ts.createSourceFile('qa-macos-smoke.cjs',readFileSync('scripts/qa-macos-smoke.cjs','utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);let expressions=0;
 const visit=(node:ts.Node)=>{if(ts.isCallExpression(node)&&ts.isIdentifier(node.expression)&&node.expression.text==='js'){
  const arg=node.arguments[1];let code:string;
  if(ts.isStringLiteralLike(arg))code=arg.text;
  else if(ts.isTemplateExpression(arg))code=arg.head.text+arg.templateSpans.map(span=>'null'+span.literal.text).join('');
  else throw Error('QA renderer expressions must be inspectable literals');
  assert.doesNotThrow(()=>new Script(code),code);expressions++;
 }ts.forEachChild(node,visit);};visit(source);assert.ok(expressions>=25);
});
