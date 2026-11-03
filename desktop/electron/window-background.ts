import type {BrowserWindow} from 'electron';

// Electron's getBackgroundColor() omits alpha, so it cannot identify a
// transparent window. Keep that policy explicit across loads/theme changes.
const transparentWindows=new WeakSet<BrowserWindow>();

export function preserveWindowTransparency(window:BrowserWindow){
 transparentWindows.add(window);
 window.setBackgroundColor('#00000000');
}

export function applyWindowBackground(window:BrowserWindow,dark:boolean){
 window.setBackgroundColor(transparentWindows.has(window)?'#00000000':dark?'#26282D':'#FFFFFF');
}
