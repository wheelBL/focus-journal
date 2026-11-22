import {app, BrowserWindow, dialog, ipcMain, net, Notification, type MenuItemConstructorOptions} from 'electron';
import path from 'node:path';
import {WindowsUpdates, launchWindowsInstaller} from './windows-updates';

export function windowsUpdateUI(window: BrowserWindow, refreshTray: () => void, hasSavedAndClosed: () => boolean,
  log: (event: string, detail: unknown) => void) {
  let notified: string | undefined;
  let notice: Notification | undefined;
  let stopped = false;
  const updates = new WindowsUpdates({
    version: app.getVersion(), arch: process.arch, cache: path.join(app.getPath('userData'), 'release-downloads'),
    directory: path.dirname(process.execPath), fetch: net.fetch, launch: launchWindowsInstaller,
    quit: () => { app.quit(); return hasSavedAndClosed(); },
    changed: state => {
      if (stopped) return;
      window.webContents.send('windows-update:changed', state);
      refreshTray();
      if (!state) { notified = undefined; notice?.close(); return; }
      if (state.downloading || notified === state.version) return;
      notified = state.version;
      if (Notification.isSupported()) {
        notice?.close();
        notice = new Notification({title: `专注记 ${state.version} 可更新`, body: '点击下载并安装。校验完成后将保存计时并重启。'});
        notice.once('click', () => void install());
        notice.show();
      }
    },
  });
  const initialized = updates.clearOldDownloads().catch(error => log('update-cache-cleanup', String(error)));
  const install = async () => {
    try { await initialized; await updates.install(); }
    catch (error) { if (!stopped) dialog.showErrorBox('更新未完成，可以重试', error instanceof Error ? error.message : String(error)); }
  };
  const check = async (manual: boolean) => {
    try {
      await initialized;
      await updates.check();
      if (!manual || stopped) return;
      const state = updates.state;
      if (state) {
        const choice = await dialog.showMessageBox(window, {type:'info', message:`专注记 ${state.version} 可更新`,
          detail:'下载并校验后将保存计时、退出并安装到当前目录。请先保存正在编辑的表单。', buttons:['稍后','下载并安装'], defaultId:1, cancelId:0});
        if (choice.response === 1 && !stopped) await install();
      } else await dialog.showMessageBox(window, {message:`当前版本为 ${app.getVersion()}，暂无更高版本。`});
    } catch (error) {
      if (stopped) return;
      log('update-check-failed', String(error));
      if (manual) dialog.showErrorBox('检查更新未完成', error instanceof Error ? error.message : String(error));
    }
  };
  const trusted = (event: Electron.IpcMainInvokeEvent) => {
    if (event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame) throw Error('无效的更新请求。');
  };
  ipcMain.handle('windows-update:status', event => { trusted(event); return updates.state; });
  ipcMain.handle('windows-update:install', event => { trusted(event); return install(); });
  const first = setTimeout(() => void check(false), 45000);
  const repeat = setInterval(() => void check(false), 6 * 60 * 60_000);
  return {
    menuItem(): MenuItemConstructorOptions {
      const state = updates.state;
      return {label: state?.downloading ? '正在下载新版…' : state ? `下载并安装 ${state.version}` : '检查更新…',
        enabled: !state?.downloading, click: () => state ? void install() : void check(true)};
    },
    dispose() {
      stopped = true;
      clearTimeout(first); clearInterval(repeat); updates.dispose(); notice?.close();
      ipcMain.removeHandler('windows-update:status'); ipcMain.removeHandler('windows-update:install');
    },
  };
}
