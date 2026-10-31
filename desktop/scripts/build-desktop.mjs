import { build } from 'esbuild';
import { mkdirSync,writeFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Timer48Filled } from '@fluentui/react-icons';
import sharp from 'sharp';
mkdirSync('assets',{recursive:true});
// The icon is the official Fluent UI Timer asset, not a hand-drawn approximation.
const svg=renderToStaticMarkup(React.createElement(Timer48Filled,{color:'#C45230',width:256,height:256}));
await sharp(Buffer.from(svg)).resize(256,256).png().toFile('assets/icon.png');
// ICNS stores standard PNG representations; regenerate from the same Fluent asset.
const largeSvg=renderToStaticMarkup(React.createElement(Timer48Filled,{color:'#C45230',width:1024,height:1024}));
const chunks=[];
for(const [type,size] of [['icp4',16],['icp5',32],['icp6',64],['ic07',128],['ic08',256],['ic09',512],['ic10',1024]]){
 const png=await sharp(Buffer.from(largeSvg)).resize(size,size).png().toBuffer(),header=Buffer.alloc(8);header.write(type);header.writeUInt32BE(png.length+8,4);chunks.push(header,png);
}
const header=Buffer.alloc(8);header.write('icns');header.writeUInt32BE(8+chunks.reduce((n,c)=>n+c.length,0),4);writeFileSync('assets/icon.icns',Buffer.concat([header,...chunks]));
await build({entryPoints:['electron/main.ts'],outfile:'dist-electron/main.cjs',bundle:true,platform:'node',format:'cjs',external:['electron','node:sqlite'],sourcemap:true});
await build({entryPoints:['electron/preload.ts'],outfile:'dist-electron/preload.cjs',bundle:true,platform:'node',format:'cjs',external:['electron'],sourcemap:true});

await build({entryPoints:['electron/reminder-preload.ts'],outfile:'dist-electron/reminder-preload.cjs',bundle:true,platform:'node',format:'cjs',external:['electron'],sourcemap:true});

await build({entryPoints:['electron/capture-preload.ts'],outfile:'dist-electron/capture-preload.cjs',bundle:true,platform:'node',format:'cjs',external:['electron'],sourcemap:true});
await build({entryPoints:['electron/floating-timer-preload.ts'],outfile:'dist-electron/floating-timer-preload.cjs',bundle:true,platform:'node',format:'cjs',external:['electron'],sourcemap:true});
