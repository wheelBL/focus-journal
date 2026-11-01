import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdirSync} from 'node:fs';
import path from 'node:path';
import {app,dialog} from 'electron';
import {discoverWorkspaces,initializeWorkspace,inspectWorkspace,normalLaunchArgs,registerWorkspace,unambiguousWorkspace,workspacePlan,type WorkspacePlan} from './workspace-location';
import {outsideLaunchScript} from './windows-workspace-launch';
export function prepareWorkspace(){
 const plan=workspacePlan({platform:process.platform,home:app.getPath('home'),appData:app.getPath('appData'),defaultUserData:app.getPath('userData'),args:process.argv.slice(1)});
 if(process.platform==='win32'&&plan.mode==='normal'&&!plan.explicit&&plan.directory===plan.canonical)registerWorkspace(plan.directory);
 mkdirSync(plan.directory,{recursive:true});app.setPath('userData',plan.directory);app.setPath('sessionData',plan.directory);
 return plan;
}
/** All migration/bootstrap paths exit before constructing JournalService or any tray/window. */
export async function finishWorkspaceStartup(plan:WorkspacePlan){
 if(plan.mode==='normal')return true;
 if(plan.mode==='outside'){
  const script=outsideLaunchScript(process.execPath,[...normalLaunchArgs(plan.args),'--workspace-outside'],process.cwd());
  app.releaseSingleInstanceLock();
  await promisify(execFile)(path.join(process.env.SystemRoot??'C:\\Windows','System32','WindowsPowerShell','v1.0','powershell.exe'),['-NoLogo','-NoProfile','-NonInteractive','-WindowStyle','Hidden','-EncodedCommand',Buffer.from(script,'utf16le').toString('base64')],{windowsHide:true,timeout:20000});
  app.quit();return false;
 }
 if(plan.mode==='migrate'){
  await initializeWorkspace(plan.canonical,inspectWorkspace(plan.source!,'选定的原工作区'));
 }else{
  const candidates=discoverWorkspaces(app.getPath('home'),app.getPath('appData'));
  let selected=unambiguousWorkspace(candidates);
  if(candidates.length&&!selected){
   const choices=candidates.map(c=>`${c.label} · ${c.items} 个事项 / ${c.sessions} 条投入`);
   const result=await dialog.showMessageBox({type:'question',title:'选择继续使用的数据',message:'发现多份不同的专注记数据，请选择一份作为统一工作区。',detail:candidates.map((c,i)=>`${i+1}. ${c.label}\n${c.directory}\n${c.items} 个事项，${c.sessions} 条投入`).join('\n\n')+'\n\n所有原始目录都会保留，不会自动合并或覆盖其他副本。',buttons:[...choices,'取消'],defaultId:choices.length,cancelId:choices.length,noLink:true});
   if(result.response>=candidates.length){app.quit();return false;}selected=candidates[result.response];
  }
  if(selected){app.relaunch({args:[...plan.args,'--migrate-workspace',selected.directory]});app.quit();return false;}
  await initializeWorkspace(plan.canonical,null);
 }
 app.relaunch({args:plan.args});app.quit();return false;
}
