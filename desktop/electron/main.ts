import {mainWindowChrome,applicationMenu} from './desktop-platform';
import {UsageStore} from './usage-store';
import {AiController} from './ai-controller';
import {LocalApiController} from './local-api-controller';
import {AppearanceController} from './appearance';
import {CaptureWindow} from './capture-window';
import {FloatingTimerWindow} from './floating-timer-window';
import { app, BrowserWindow, ipcMain, Menu, Tray, nativeImage, Notification, dialog, shell, powerMonitor, safeStorage } from 'electron';
import {createHash,randomUUID} from 'node:crypto';
import {SyncController} from './sync-controller';
import {GitCodeRemote} from './gitcode-remote';
import {FileSyncPersistence,atomicWrite,SyncError} from './sync-storage';
import type {SyncInput} from '../core/sync-types';
import { mkdirSync, writeFileSync, readFileSync, existsSync, appendFileSync } from 'node:fs';
import path from 'node:path';
import {ReminderWindow} from './reminder-window';
import {timerMenu,breakMenu} from './timer-menu';
import { JournalService } from '../core/service';
import { SqliteJournalStore } from '../core/store';
import { localDate, type Command } from '../core/types';

let win:BrowserWindow|null=null, tray:Tray|null=null, service:JournalService;
let quitting=false,closed=false;
const flag=(name:string)=>{const i=process.argv.indexOf(name);return i>=0?process.argv[i+1]:undefined;};
const demo=process.argv.includes('--demo');
const treePrototype=process.argv.includes('--tree-prototype');
const explicitData=flag('--data-dir');
if(explicitData)app.setPath('userData',path.resolve(explicitData));
app.setName('专注记');if(process.platform==='win32')app.setAppUserModelId('local.focusjournal.desktop');
if(!app.requestSingleInstanceLock())app.quit();
else {
  app.on('second-instance',(_event,argv)=>{if(argv.includes('--quit')){app.quit();return;}win?.show();win?.focus();});
  app.whenReady().then(()=>{
    const dataDir=app.getPath('userData');mkdirSync(dataDir,{recursive:true});
    const appearance=new AppearanceController(path.join(dataDir,'appearance.json'),path.join(__dirname,'../dist/client/index.html'));
    const log=(event:string,details:unknown='')=>{try{appendFileSync(path.join(dataDir,'startup.log'),`${new Date().toISOString()} ${event} ${JSON.stringify(details)}\n`);}catch{/* Diagnostics must not interrupt the journal. */}};
    log('start',{version:app.getVersion(),electron:process.versions.electron,node:process.versions.node,packaged:app.isPackaged,demo});
    service=new JournalService(new SqliteJournalStore(path.join(dataDir,'journal.sqlite')),undefined,demo,app.getVersion());
    if(treePrototype)service.seedTreeDemo();else if(demo)service.seedDemo();
    const backups=path.join(dataDir,'backups');mkdirSync(backups,{recursive:true});
    const dailyBackup=path.join(backups,`${localDate()}.json`);
    if(!existsSync(dailyBackup))writeFileSync(dailyBackup,service.exportJson(),'utf8');
    const menu=applicationMenu(process.platform,app.getName());Menu.setApplicationMenu(menu?Menu.buildFromTemplate(menu):null);
    const icon=path.join(__dirname,'../assets/icon.png');
    win=new BrowserWindow({width:demo&&!treePrototype?1060:1440,height:demo&&!treePrototype?640:920,minWidth:900,minHeight:640,show:false,title:treePrototype?'专注记 · 任务树交互稿':'专注记',icon,backgroundColor:'#FFFFFF',...mainWindowChrome(process.platform),webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true}});
    appearance.setMain(win);
    win.webContents.setWindowOpenHandler(()=>({action:'deny'}));
    win.webContents.on('render-process-gone',(_event,details)=>log('renderer-exit',details));
    win.webContents.on('did-fail-load',(_event,code,description)=>log('load-error',{code,description}));
    win.webContents.on('console-message',(_event,level,message)=>{if(level>=3)log('renderer-error',message);});
    win.webContents.on('did-finish-load',()=>log('ready'));
    win.webContents.on('will-navigate',event=>event.preventDefault());
    win.once('ready-to-show',()=>win?.show());
    win.on('close',event=>{if(!quitting){event.preventDefault();if(demo)app.quit();else win?.hide();}});
    win.loadFile(path.join(__dirname,'../dist/client/index.html'),treePrototype?{query:{prototype:'tree'}}:{});
    const show=()=>{if(win?.isMinimized())win.restore();win?.show();win?.focus();};
    app.on('activate',()=>{if(!quitting&&!closed)show();});
    const openSession=(id:string)=>{show();win?.webContents.send('journal:open-session',id);};
    const trayIcon=nativeImage.createFromPath(icon).resize({width:18,height:18});if(process.platform==='darwin')trayIcon.setTemplateImage(true);tray=new Tray(process.platform==='darwin'?trayIcon:nativeImage.createFromPath(icon));tray.setToolTip(demo?'专注记 · 测试工作区':'专注记 · 点击打开工作日志');tray.on('click',show);
    const performTimer=(command:Command)=>{try{
      const result=service.execute({...command,meta:{source:'user',entry:'tray.timer'}});changed();
      if(result.focusReminder&&Notification.isSupported())new Notification({title:'专注提醒',body:result.focusReminder,icon}).show();
      if(command.type==='focus.stop'&&command.payload?.rest!==true){const record=result.state.sessions.find(r=>r.id===command.payload?.sessionId);if(record)openSession(record.id);else show();}else if(command.type==='focus.start-unassigned'||command.type.startsWith('break.')||command.payload?.rest===true)show();
    }catch(e){report(e);}};
    const refreshTray=()=>tray?.setContextMenu(Menu.buildFromTemplate([
      {label:'打开工作日志',click:show},{label:'显示屏边计时签',enabled:!!service.floatingTimerSnapshot().timers.length||!!service.floatingTimerSnapshot().rest,click:()=>floating.open()},{label:'快速记录',click:()=>capture.open()},{label:'先计时，结束后补充事项',click:()=>performTimer({type:'focus.start-unassigned'})},
      ...timerMenu(service.snapshot(),performTimer),...breakMenu(service.snapshot(),performTimer),
      {type:'separator'},{label:'退出专注记',click:()=>app.quit()}
    ]));
    const reminders=new ReminderWindow(service,()=>changed(),icon,log,id=>{show();win?.webContents.send('journal:open-item',id);},openSession,reveal=>{if(reveal||win?.isVisible()&&!win.isMinimized())show();},()=>floating?.sync());
    const floating=new FloatingTimerWindow(service,win,()=>changed(),()=>reminders.isPresenting(),icon,path.join(dataDir,'floating-timer-position.json'),show,openSession,log);
    const capture=new CaptureWindow(service,()=>changed(),icon,path.join(dataDir,'capture-settings.json'),demo);
    const changed=()=>{win?.webContents.send('journal:changed');refreshTray();reminders.sync();floating.sync();tray?.setToolTip(floating.tooltip());};
    const sync=new SyncController({journal:service,persistence:new FileSyncPersistence(path.join(dataDir,'sync-config.json')),
      vault:{encrypt:token=>{if(!safeStorage.isEncryptionAvailable())throw new Error('Encryption unavailable');return safeStorage.encryptString(token).toString('base64');},decrypt:token=>safeStorage.decryptString(Buffer.from(token,'base64'))},
      remote:config=>new GitCodeRemote(path.join(dataDir,'sync-cache',createHash('sha256').update(config.repository+'\n'+config.branch).digest('hex')),config),
      backup:content=>atomicWrite(path.join(backups,`before-sync-${Date.now()}-${randomUUID()}.json`),content),
      changed:status=>{if(!win?.isDestroyed())win?.webContents.send('sync:changed',status);},journalChanged:changed});
    const trusted=(event:Electron.IpcMainInvokeEvent)=>{if(event.sender!==win?.webContents||event.senderFrame!==win.webContents.mainFrame)throw new Error('无效的应用请求。');};
    const usage=new UsageStore(path.join(dataDir,'usage-records.json'),app.getVersion());
    service.setOperationRecorder((operation,entry,result)=>usage.record({operation,entry,result,version:app.getVersion()}));
    ipcMain.handle('usage:record',(event,value)=>{trusted(event);usage.record(value);});
    ipcMain.handle('usage:snapshot',event=>{trusted(event);return usage.snapshot();});
    ipcMain.handle('usage:configure',(event,value)=>{trusted(event);return usage.configure(value);});
    ipcMain.handle('usage:clear',(event,kind)=>{trusted(event);return usage.clear(kind);});
    ipcMain.handle('usage:feedback',(event,id,rating,note)=>{trusted(event);return usage.feedback(id,rating,note);});
    ipcMain.handle('usage:export',async event=>{trusted(event);const choice=await dialog.showSaveDialog(win!,{title:'导出本机使用记录',defaultPath:'专注记使用记录.json'});if(choice.canceled||!choice.filePath)return null;writeFileSync(choice.filePath,JSON.stringify(usage.snapshot(),null,2));return choice.filePath;});
    const ai=new AiController(path.join(dataDir,'ai-config.json'),win,path.join(__dirname,'../dist/client/index.html'),service,changed,usage);
    const localApi=new LocalApiController(service,path.join(dataDir,'local-api.json'),{encrypt:token=>{if(!safeStorage.isEncryptionAvailable())throw new Error('Encryption unavailable');return safeStorage.encryptString(token).toString('base64');},decrypt:cipher=>safeStorage.decryptString(Buffer.from(cipher,'base64'))},changed,app.getVersion(),sync);
    void localApi.initialize();
    ipcMain.handle('local-api:status',event=>{trusted(event);return localApi.status();});
    ipcMain.handle('local-api:configure',(event,value:unknown)=>{trusted(event);return localApi.configure(value);});
    ipcMain.handle('local-api:token',event=>{trusted(event);return localApi.token();});
    ipcMain.handle('local-api:rotate-token',event=>{trusted(event);return localApi.rotateToken();});
    const syncHandler=(name:string,fn:(...args:any[])=>unknown)=>ipcMain.handle(`sync:${name}`,async(event,...args)=>{trusted(event);try{return await fn(...args);}catch(e){throw new Error(e instanceof SyncError?e.message:'同步操作未完成，本机工作记录已保留。');}});
    syncHandler('status',()=>sync.status());syncHandler('configure',(input:SyncInput)=>sync.configure(input));syncHandler('disconnect',()=>sync.disconnect());
    syncHandler('test',()=>sync.test());syncHandler('run',()=>sync.run());syncHandler('resolve',(id:string,choice:'local'|'remote')=>sync.resolve(id,choice));
    ipcMain.handle('journal:capture-open',event=>{trusted(event);capture.open();});
    ipcMain.handle('journal:capture-preferences',event=>{trusted(event);return capture.preferences();});
    ipcMain.handle('journal:capture-configure',(event,value:unknown)=>{trusted(event);return capture.configure(value);});
    ipcMain.handle('journal:clock',event=>{trusted(event);return service.clockSnapshot();});
    ipcMain.handle('journal:snapshot',event=>{trusted(event);return service.snapshot();});
    ipcMain.handle('journal:reminder-preview',(event,settings:unknown,mode:unknown)=>{trusted(event);return reminders.preview(settings,mode);});
    ipcMain.handle('journal:command',(event,command:Command)=>{trusted(event);if(!command||typeof command.type!=='string')throw new Error('操作无效。');const result=service.execute({...command,meta:{...command.meta,version:app.getVersion()}});changed();return result;});
    ipcMain.handle('journal:export',async(event,format:string)=>{
      trusted(event);if(!['json','csv'].includes(format))throw new Error('格式无效。');
      const choice=await dialog.showSaveDialog(win!,{title:format==='json'?'备份全部数据':'导出投入记录',defaultPath:path.join(app.getPath('documents'),`专注记-${localDate()}.${format}`),filters:[{name:format.toUpperCase(),extensions:[format]}]});
      if(choice.canceled||!choice.filePath)return null;
      writeFileSync(choice.filePath,format==='json'?service.exportJson():service.exportCsv(),'utf8');return choice.filePath;
    });
    ipcMain.handle('journal:import',async event=>{
      trusted(event);if(service.snapshot().timers.length)throw new Error('请先结束专注，再恢复备份。');
      const choice=await dialog.showOpenDialog(win!,{title:'恢复专注记备份',defaultPath:backups,properties:['openFile'],filters:[{name:'专注记备份',extensions:['json']}]});
      if(choice.canceled)return null;
      const confirm=await dialog.showMessageBox(win!,{type:'question',message:'用这份备份替换当前数据？',detail:'当前数据会先保存到 backups 文件夹，方便找回。',buttons:['取消','恢复备份'],defaultId:0,cancelId:0});
      if(confirm.response!==1)return null;
      const content=readFileSync(choice.filePaths[0],'utf8');
      writeFileSync(path.join(backups,`before-restore-${Date.now()}.json`),service.exportJson(),'utf8');
      const result=service.importJson(content);changed();return result;
    });
    ipcMain.handle('journal:folder',event=>{trusted(event);return shell.openPath(dataDir);});
    ipcMain.handle('journal:window',(event,action:string)=>{trusted(event);if(action==='minimize')win?.minimize();else if(action==='maximize'){win?.isMaximized()?win.unmaximize():win?.maximize();}else if(action==='close')win?.close();else if(action==='quit')app.quit();});
    powerMonitor.on('suspend',()=>{try{service.suspend();changed();}catch(e){report(e);}});
    powerMonitor.on('resume',changed);
    const interval=setInterval(()=>{try{if(service.tick().length)changed();reminders.sync();floating.sync();tray?.setToolTip(floating.tooltip());}catch(e){report(e);}},1000);
    refreshTray();
    app.on('before-quit',event=>{
      if(closed)return;
      try{ai.dispose();usage.dispose();localApi.dispose();sync.dispose();service.shutdown();closed=true;quitting=true;clearInterval(interval);floating.dispose();reminders.dispose();capture.dispose();appearance.dispose();tray?.destroy();log('shutdown');}
      catch(e){event.preventDefault();report(e);}
    });
    win.on('session-end',()=>{if(!closed){try{ai.dispose();usage.dispose();localApi.dispose();sync.dispose();service.shutdown();closed=true;clearInterval(interval);floating.dispose();reminders.dispose();capture.dispose();appearance.dispose();tray?.destroy();}catch{/* The last durable checkpoint remains recoverable. */}}});
  }).catch(error=>{dialog.showErrorBox('专注记启动失败',String(error));quitting=true;app.quit();});
}
let lastError='';
function report(error:unknown){const message=error instanceof Error?error.message:String(error);if(lastError===message)return;lastError=message;win?.webContents.send('journal:error',message);dialog.showErrorBox('操作未保存',`${message}\n请检查磁盘空间和数据文件权限。`);}
