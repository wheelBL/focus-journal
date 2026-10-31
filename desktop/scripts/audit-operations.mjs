import ts from 'typescript';
import {readdirSync,readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import path from 'node:path';

// Source inventory for review, not a claim that every runtime state was tested.
const out=path.resolve(process.argv[2]??'design-audits/2026-10-23-operations');
mkdirSync(out,{recursive:true});
const controls=[];
function scan(dir){for(const entry of readdirSync(dir,{withFileTypes:true})){const file=path.join(dir,entry.name);if(entry.isDirectory())scan(file);else if(file.endsWith('.tsx')){
 const source=ts.createSourceFile(file,readFileSync(file,'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
 function walk(node){
  if(ts.isJsxOpeningElement(node)||ts.isJsxSelfClosingElement(node)){
   const tag=node.tagName.getText(source);
   if(['Button','button','input','select','textarea','summary'].includes(tag)){
    const attrs=Object.fromEntries(node.attributes.properties.filter(ts.isJsxAttribute).map(a=>[a.name.getText(source),a.initializer?.getText(source)??'true']));
    const container=ts.isJsxOpeningElement(node)?node.parent:node;
    const content=ts.isJsxElement(container)?container.children.map(child=>child.getText(source)).join(' ').replace(/<[^>]*>/g,'').replace(/\s+/g,' ').trim():'';
    controls.push({file:file.replaceAll('\\','/'),line:source.getLineAndCharacterOfPosition(node.getStart(source)).line+1,control:tag,label:attrs['aria-label']??content??'',title:attrs.title??'',field:attrs.type??'',disabled:attrs.disabled??attrs.readOnly??'',actions:Object.entries(attrs).filter(([key])=>/^on(Click|Change|KeyDown|Submit|ContextMenu|Pointer)/.test(key)).map(([key,value])=>`${key}: ${value}`).join('\n')});
   }
  }
  ts.forEachChild(node,walk);
 }
 walk(source);
}}}
scan('src');
writeFileSync(path.join(out,'controls.json'),JSON.stringify({scope:'Current src JSX control definitions. Shared components and dynamic states require separate interaction verification.',controls},null,2));
const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const rows=controls.map(c=>`<tr><td>${escape(c.file)}:${c.line}</td><td>${c.control}</td><td>${escape(c.label||c.title||'通过父级标签或图标定义')}<small>${escape(c.title)}</small></td><td><pre>${escape(c.actions)}</pre></td><td><pre>${escape(c.disabled)}</pre></td></tr>`).join('');
writeFileSync(path.join(out,'controls.html'),`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>专注记 · 控件操作清单</title><style>body{font:14px/1.6 system-ui;margin:28px;color:#263343;background:#f6f8fb}h1{font-size:24px}input{font:inherit;padding:10px;width:min(600px,90%);margin:12px 0}table{width:100%;border-collapse:collapse;background:white}th,td{text-align:left;vertical-align:top;padding:10px;border-bottom:1px solid #e7ecf3}th{position:sticky;top:0;background:#edf3fb}td:first-child{width:210px;overflow-wrap:anywhere}small{display:block;color:#65738a}pre{white-space:pre-wrap;overflow-wrap:anywhere;margin:0;font:12px/1.5 monospace;max-width:500px}tr[hidden]{display:none}</style><h1>控件与操作清单</h1><p>共 ${controls.length} 处控件定义，来自当前 src 下的 React 组件。共享组件、条件分支与动态列表会产生不同运行状态；此表用于逐项检查，不等同于所有状态均已自动测试。</p><p>每项检查：用户目标、入口、名称、操作层级、前提、执行结果、返回与取消、失败重试、撤销、键盘及保存中行为。</p><input id="filter" aria-label="筛选操作清单" placeholder="输入页面、按钮文字或动作查找"><table><thead><tr><th>组件位置</th><th>控件</th><th>名称 / 提示</th><th>交互</th><th>禁用 / 只读条件</th></tr></thead><tbody>${rows}</tbody></table><script>document.getElementById('filter').addEventListener('input',e=>{const q=e.target.value.toLowerCase();document.querySelectorAll('tbody tr').forEach(row=>row.hidden=!row.textContent.toLowerCase().includes(q));});</script></html>`);
console.log(JSON.stringify({definitions:controls.length,files:new Set(controls.map(c=>c.file)).size,output:out}));
