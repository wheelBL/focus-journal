import path from 'node:path';
export function macosConfig(pkg,{root,stage,output,qa=false}){
 return {appId:pkg.build.appId,productName:pkg.build.productName,electronVersion:pkg.devDependencies.electron,
  directories:{app:stage,output},asar:true,npmRebuild:false,
  files:['dist/client/**/*','dist-electron/**/*','assets/**/*','package.json','THIRD_PARTY_NOTICES.txt',...(qa?['qa-start.cjs','qa-macos-smoke.cjs']:[])],
  artifactName:'FocusJournal-${version}-macOS-${arch}.${ext}',
  mac:{category:'public.app-category.productivity',minimumSystemVersion:'14.0',darkModeSupport:true,
   icon:path.join(root,'assets/icon.icns'),identity:'-',hardenedRuntime:false,notarize:false,
   entitlements:path.join(root,'build/entitlements.mac.plist'),entitlementsInherit:path.join(root,'build/entitlements.mac.plist')},
  dmg:{title:`专注记 ${pkg.version}`,sign:false}};
}
export function macAppPath(root,arch,qa=false){return path.join(root,'release',`${qa?'qa-':''}macos-${arch}`,arch==='arm64'?'mac-arm64':'mac','专注记.app');}
