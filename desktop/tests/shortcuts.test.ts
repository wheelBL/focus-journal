import {test} from 'node:test';
import assert from 'node:assert/strict';
import {defaultsForPlatform,validateShortcutBindings,shortcutFromEvent,formatShortcut} from '../core/shortcuts';

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
