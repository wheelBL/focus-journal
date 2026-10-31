export type DesktopPlatform='darwin'|'win32'|'linux';
export type DesktopEditAction='undo'|'redo'|'selectAll';
export interface ModifierKeys {ctrlKey:boolean;metaKey:boolean;altKey?:boolean;shiftKey?:boolean}
export function primaryModifier(event:ModifierKeys,platform:DesktopPlatform){return platform==='darwin'?event.metaKey:event.ctrlKey;}
export function defaultCaptureShortcut(platform:DesktopPlatform){return platform==='darwin'?'CommandOrControl+Shift+Space':'Ctrl+Alt+Space';}
export function shortcutLabel(value:string,platform:DesktopPlatform){return platform==='darwin'?value.replace(/CommandOrControl|CmdOrCtrl|Ctrl|Control/g,'⌘').replace(/Command|Cmd/g,'⌘').replace(/Alt|Option/g,'⌥').replace(/Shift/g,'⇧'):value;}
