import assert from 'node:assert/strict';
import {readFileSync,readdirSync,mkdirSync,writeFileSync} from 'node:fs';
import {gzipSync} from 'node:zlib';
import path from 'node:path';

const directory=path.resolve('dist/client/assets'),files=new Map(readdirSync(directory).filter(name=>name.endsWith('.js')).map(name=>[name,readFileSync(path.join(directory,name),'utf8')]));
const entry=path.basename(readFileSync('dist/client/index.html','utf8').match(/<script[^>]+src="([^"]+)"/)[1]);
const find=name=>{const file=[...files.keys()].find(file=>file.startsWith(`${name}-`));assert.ok(file,`Missing deferred ${name} chunk`);return file;};
const direct=file=>[...files.get(file).matchAll(/\bfrom\s*["'](\.\/[^"']+\.js)["']|\bimport\s*["'](\.\/[^"']+\.js)["']/g)].map(match=>path.basename(match[1]??match[2]));
const closure=(...roots)=>{const seen=new Set(),queue=[...roots];while(queue.length){const file=queue.pop();if(seen.has(file))continue;assert.ok(files.has(file),`Missing dependency ${file}`);seen.add(file);queue.push(...direct(file));}return [...seen];};
const summarize=names=>({files:names.length,bytes:names.reduce((sum,name)=>sum+Buffer.byteLength(files.get(name)),0),gzipBytes:names.reduce((sum,name)=>sum+gzipSync(files.get(name)).length,0)});
const mainFiles=closure(entry,find('App')),optional=['Calendar','Review','Settings','SearchResults','dialogs'];
for(const feature of optional)assert.ok(!mainFiles.includes(find(feature)),`${feature} was eagerly pulled into the main workspace`);
assert.ok(/default/.test(files.get(find('App'))),'Main workspace must export its default component');
assert.equal(readdirSync(directory).filter(name=>name.endsWith('.css')).length,1,'Feature loading must not insert late CSS after the theme');
const panels=Object.fromEntries(['CapturePanel','ReminderPanel','FloatingTimerPanel'].map(name=>{const selected=closure(entry,find(name));assert.ok(!selected.includes(find('App')),`${name} loads the main workspace`);return [name,summarize(selected)];}));
const baseline={bytes:551338,gzipBytes:171162},main=summarize(mainFiles),report={baseline,initialEntry:summarize(closure(entry)),mainWorkspace:main,mainReductionPercent:Math.round((1-main.bytes/baseline.bytes)*1000)/10,panels,deferred:Object.fromEntries(optional.map(name=>[name,summarize([find(name)])])),cssFiles:1};
const version=JSON.parse(readFileSync('package.json','utf8')).version,output=path.resolve(`qa-evidence/release-${version}/module-build.json`);mkdirSync(path.dirname(output),{recursive:true});writeFileSync(output,JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
