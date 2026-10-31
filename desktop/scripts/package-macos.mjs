import {build,Platform,Arch} from 'electron-builder';
import {cpSync,copyFileSync,mkdirSync,mkdtempSync,readFileSync,realpathSync,rmSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {macosConfig} from './macos-config.mjs';
import './third-party-notices.mjs';
if(process.platform!=='darwin')throw Error('macOS 包必须在 Mac 上构建；Windows 可通过 GitHub macOS 工作流构建。');
const root=realpathSync(path.join(path.dirname(fileURLToPath(import.meta.url)),'..'));
const pkg=JSON.parse(readFileSync(path.join(root,'package.json'),'utf8')),qa=process.argv.includes('--qa');
const arch=process.argv.find(a=>a.startsWith('--arch='))?.slice(7)??process.arch;
if(!['arm64','x64'].includes(arch))throw Error('macOS 架构仅支持 arm64 / x64。');
const release=path.join(root,'release');mkdirSync(release,{recursive:true});
const stage=mkdtempSync(path.join(release,'.mac-source-')),output=path.join(release,`${qa?'qa-':''}macos-${arch}`);
try{
 for(const directory of ['dist/client','dist-electron','assets'])cpSync(path.join(root,directory),path.join(stage,directory),{recursive:true});
 copyFileSync(path.join(root,'../THIRD_PARTY_NOTICES.txt'),path.join(stage,'THIRD_PARTY_NOTICES.txt'));
 writeFileSync(path.join(stage,'package.json'),JSON.stringify({name:pkg.name,version:pkg.version,description:pkg.description,author:pkg.author,productName:pkg.build.productName,main:qa?'qa-start.cjs':pkg.main},null,2));
 if(qa){
  const data=path.join(root,'qa-data',`macos-${arch}-${pkg.version}`),evidence=path.join(root,'qa-evidence',`release-${pkg.version}`,`macos-${arch}`);
  mkdirSync(evidence,{recursive:true});
  copyFileSync(path.join(root,'scripts/qa-macos-smoke.cjs'),path.join(stage,'qa-macos-smoke.cjs'));
  writeFileSync(path.join(stage,'qa-start.cjs'),`process.argv.push('--demo','--data-dir',${JSON.stringify(data)});require('./dist-electron/main.cjs');require('./qa-macos-smoke.cjs')(${JSON.stringify({data,evidence,version:pkg.version,arch})});\n`);
 }
 // Explicit ad-hoc signing never searches the user's signing identities or notarization secrets.
 process.env.CSC_IDENTITY_AUTO_DISCOVERY='false';
 await build({targets:Platform.MAC.createTarget(qa?['dir']:['zip','dmg'],arch==='arm64'?Arch.arm64:Arch.x64),config:macosConfig(pkg,{root,stage,output,qa}),publish:'never'});
 console.log(`macOS ${arch} ${qa?'QA':'production'}: ${output}`);
}finally{
 const resolved=realpathSync(stage);if(!resolved.startsWith(realpathSync(release)+path.sep))throw Error('Unexpected staging directory');rmSync(resolved,{recursive:true,force:true});
}
