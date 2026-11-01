// Isolated Electron fixture only; never included in production packages.
const {app,safeStorage,BrowserWindow}=require('electron');
const fs=require('node:fs'),path=require('node:path');
const [phase,root,bundle]=process.argv.slice(2),home=path.join(root,'home'),legacy=path.join(home,'AppData','Roaming','专注记'),canonical=path.join(home,'.focus-journal');
const lib=require(bundle),sample='focus-journal-synthetic-workspace-vault-not-a-user-key';
app.setName('专注记');
const profile=['verify','probe'].includes(phase)?canonical:legacy;
fs.mkdirSync(profile,{recursive:true});app.setPath('userData',profile);app.setPath('sessionData',profile);
const owns=app.requestSingleInstanceLock();
if(phase==='lock-check'){
 fs.writeFileSync(path.join(root,'lock-check.json'),JSON.stringify({ok:!owns,ownsLock:owns,windows:BrowserWindow.getAllWindows().length}));app.quit();
}else if(!owns){fs.writeFileSync(path.join(root,phase+'.json'),JSON.stringify({ok:false,reason:'unexpected second instance'}));app.quit();}
else app.whenReady().then(async()=>{
 const checks=[];let ok=false;
 const check=(value,label)=>{if(!value)throw Error(label);checks.push(label);};
 try{
  if(phase==='prepare'){
   check(safeStorage.isEncryptionAvailable(),'OS encryption is available');
   const cipher=safeStorage.encryptString(sample);fs.writeFileSync(path.join(legacy,'synthetic-vault.json'),JSON.stringify({encrypted:cipher.toString('base64')}));check(!cipher.includes(Buffer.from(sample)),'Synthetic credential is encrypted');
  }else if(phase==='migrate'){
   const before=lib.inspectWorkspace(legacy,'synthetic source');await lib.initializeWorkspace(canonical,before);check(lib.inspectWorkspace(canonical,'destination').rowsHash===before.rowsHash,'All SQLite records match after migration');check(lib.inspectWorkspace(legacy,'retained source').rowsHash===before.rowsHash,'Original database is retained');
  }else if(phase==='verify'||phase==='probe'){
   const credential=JSON.parse(fs.readFileSync(path.join(canonical,'synthetic-vault.json'),'utf8'));
   check(safeStorage.decryptString(Buffer.from(credential.encrypted,'base64'))===sample,'Profile-bound encryption survives migration and process restart');
   const plan=lib.workspacePlan({platform:'win32',home,appData:path.join(root,phase==='probe'?'launcher-cache':'other-entry'),defaultUserData:legacy,args:[]});check(plan.mode==='normal'&&plan.directory===canonical,'Different launch context resolves the same canonical profile');
   check(lib.inspectWorkspace(canonical,'canonical').sessions===1,'Recorded effort survives different entry');
  }else if(phase==='holder'){
   if(!process.send)throw Error('Private fixture IPC missing');process.send({ready:true});process.once('message',()=>app.quit());return;
  }else throw Error('Unknown fixture phase');
  check(BrowserWindow.getAllWindows().length===0,'No fixture windows or trays');ok=true;
 }catch(error){checks.push('FAIL: '+error.message);}
 fs.writeFileSync(path.join(root,phase+'.json'),JSON.stringify({ok,checks,windows:BrowserWindow.getAllWindows().length},null,2));app.quit();
});
