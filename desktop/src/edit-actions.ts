import type {DesktopEditAction} from '../core/desktop-platform';

/** Native text undo belongs to the focused editor, even with a modal open. */
export function isTextEditing(target:EventTarget|null):boolean {
 if(!(target instanceof HTMLElement))return false;
 const editor=target.closest('input,textarea,select,[contenteditable],[role="textbox"]');
 if(!editor)return false;
 if(editor instanceof HTMLInputElement)return !['checkbox','radio','button','submit','reset','range','color','file','hidden','image'].includes(editor.type);
 return editor.getAttribute('contenteditable')!=='false';
}

export function editDestination(action:DesktopEditAction,view:string,query:string,dialogOpen:boolean):'text'|'tree'|'history'|'blocked' {
 if(isTextEditing(document.activeElement))return 'text';
 if(dialogOpen||document.querySelector('dialog[open],[role="dialog"],[data-shortcut-recorder]:focus'))return 'blocked';
 if(action==='selectAll')return ['projects','inbox'].includes(view)&&!query?'tree':'text';
 return 'history';
}
