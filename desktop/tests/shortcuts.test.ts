import {test} from 'node:test';
import assert from 'node:assert/strict';
import {defaultsForPlatform,validateShortcutBindings,shortcutFromEvent,shortcutAction,formatShortcut} from '../core/shortcuts';

test('defaults are conflict free on both platforms and protect text editing',()=>{
 for(const platform of ['win32','darwin'] as const){const defaults=defaultsForPlatform(platform);assert.equal(validateShortcutBindings(defaults,platform),null);assert.match(validateShortcutBindings({...defaults,create:'Primary+C'},platform)!,/文字编辑/);assert.match(validateShortcutBindings({...defaults,create:defaults['search-current']},platform)!,/冲突/);assert.ok(validateShortcutBindings({...defaults,create:'Tab'},platform));assert.ok(validateShortcutBindings({...defaults,create:'Primary+Enter'},platform));}
});
test('keyboard recording is normalized and ignores composition and foreign modifier',()=>{
 const base={key:'f',code:'KeyF',ctrlKey:true,metaKey:false,altKey:false,shiftKey:false};assert.equal(shortcutFromEvent(base,'win32'),'Primary+F');assert.equal(shortcutFromEvent({...base,isComposing:true},'win32'),null);assert.equal(shortcutFromEvent(base,'darwin'),null);assert.equal(formatShortcut('Primary+Shift+N','darwin'),'⌘ + ⇧ + N');
});

test('IME boundary and AltGraph input are never interpreted as shortcuts',()=>{
 const base={key:'f',code:'KeyF',ctrlKey:true,metaKey:false,altKey:true,shiftKey:false};
 assert.equal(shortcutFromEvent({...base,keyCode:229},'win32'),null);
 assert.equal(shortcutFromEvent({...base,getModifierState:(name:string)=>name==='AltGraph'},'win32'),null);
 assert.equal(shortcutFromEvent({...base,getModifierState:()=>false},'win32'),'Primary+Alt+F');
});

test('business undo and redo are configurable while native clipboard chords stay reserved',()=>{
 const bindings=defaultsForPlatform('win32'),event={key:'z',ctrlKey:true,metaKey:false,altKey:false,shiftKey:false};
 assert.equal(shortcutAction(event,bindings,'win32'),'undo');
 assert.equal(shortcutAction({...event,shiftKey:true},bindings,'win32'),'redo');
 assert.equal(shortcutAction({...event,key:'y'},bindings,'win32'),'redo');
 const changed={...bindings,undo:'Primary+U',redo:'Primary+R'};
 assert.equal(validateShortcutBindings(changed,'win32'),null);
 assert.equal(shortcutAction(event,changed,'win32'),null);
 assert.equal(shortcutAction({...event,key:'y'},changed,'win32'),null);
 assert.equal(shortcutAction({...event,key:'u'},changed,'win32'),'undo');
 assert.match(validateShortcutBindings({...bindings,create:'Primary+Z'},'win32'),/保留/);
 assert.match(validateShortcutBindings({...bindings,undo:'Primary+C'},'win32'),/保留/);
 assert.equal(shortcutAction({...event,ctrlKey:false,metaKey:true},defaultsForPlatform('darwin'),'darwin'),'undo');
});
