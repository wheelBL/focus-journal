import { build } from 'esbuild';
import { mkdirSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Timer48Filled } from '@fluentui/react-icons';
import sharp from 'sharp';
mkdirSync('assets',{recursive:true});
// The icon is the official Fluent UI Timer asset, not a hand-drawn approximation.
const svg=renderToStaticMarkup(React.createElement(Timer48Filled,{color:'#C45230',width:256,height:256}));
await sharp(Buffer.from(svg)).resize(256,256).png().toFile('assets/icon.png');
await build({entryPoints:['electron/main.ts'],outfile:'dist-electron/main.cjs',bundle:true,platform:'node',format:'cjs',external:['electron','node:sqlite'],sourcemap:true});
await build({entryPoints:['electron/preload.ts'],outfile:'dist-electron/preload.cjs',bundle:true,platform:'node',format:'cjs',external:['electron'],sourcemap:true});

await build({entryPoints:['electron/reminder-preload.ts'],outfile:'dist-electron/reminder-preload.cjs',bundle:true,platform:'node',format:'cjs',external:['electron'],sourcemap:true});

await build({entryPoints:['electron/capture-preload.ts'],outfile:'dist-electron/capture-preload.cjs',bundle:true,platform:'node',format:'cjs',external:['electron'],sourcemap:true});
await build({entryPoints:['electron/floating-timer-preload.ts'],outfile:'dist-electron/floating-timer-preload.cjs',bundle:true,platform:'node',format:'cjs',external:['electron'],sourcemap:true});
