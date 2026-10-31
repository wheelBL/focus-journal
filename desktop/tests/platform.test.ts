import {test} from 'node:test';
import assert from 'node:assert/strict';
import {primaryModifier,defaultCaptureShortcut,shortcutLabel} from '../core/desktop-platform';
import {mainWindowChrome,applicationMenu,configureCompanionWindow} from '../electron/desktop-platform';
import {CaptureShortcut} from '../electron/capture-shortcut';
import {macosConfig} from '../scripts/macos-config.mjs';
import {readFileSync} from 'node:fs';
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
