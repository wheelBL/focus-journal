import {test} from 'node:test';
import assert from 'node:assert/strict';
import {primaryModifier,defaultCaptureShortcut,shortcutLabel} from '../core/desktop-platform';
import {mainWindowChrome,applicationMenu} from '../electron/desktop-platform';
import {CaptureShortcut} from '../electron/capture-shortcut';
import {macosConfig} from '../scripts/macos-config.mjs';
test('platform conventions retain Windows control and isolate native macOS window chrome',()=>{
 assert.equal(primaryModifier({ctrlKey:true,metaKey:false},'win32'),true);assert.equal(primaryModifier({ctrlKey:true,metaKey:false},'darwin'),false);assert.equal(primaryModifier({ctrlKey:false,metaKey:true},'darwin'),true);
 assert.equal(shortcutLabel('Ctrl+Enter','darwin'),'⌘+Enter');assert.equal(shortcutLabel('Ctrl+Enter','win32'),'Ctrl+Enter');
 assert.equal(mainWindowChrome('darwin').titleBarOverlay,undefined);assert.deepEqual(mainWindowChrome('darwin').trafficLightPosition,{x:14,y:14});assert.ok(mainWindowChrome('win32').titleBarOverlay);
 assert.equal(applicationMenu('win32','专注记'),null);assert.ok(applicationMenu('darwin','专注记')!.some(m=>m.label==='编辑'));
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
