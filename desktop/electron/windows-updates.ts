import {spawn} from 'node:child_process';
import {mkdir, mkdtemp, readdir, rm} from 'node:fs/promises';
import path from 'node:path';
import type {WindowsUpdateState} from '../core/update-types';
import {downloadVerified, latestUpdate, type ReleaseAsset, type UpdateFetch} from './release-updates';

export function launchWindowsInstaller(file: string, directory: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(file, ['/SILENT', '/NORESTART', `/DIR=${directory}`, `/FocusParent=${process.pid}`], {
      detached: true, stdio: 'ignore', cwd: path.dirname(file),
    });
    child.once('error', reject);
    child.once('spawn', () => { child.unref(); resolve(); });
  });
}

export class WindowsUpdates {
  private asset?: ReleaseAsset;
  private checkInFlight?: Promise<void>;
  private installation?: Promise<void>;
  private readonly controller = new AbortController();
  private busy = false;

  constructor(private readonly options: {
    version: string; arch: string; cache: string; directory: string; fetch: UpdateFetch;
    changed: (state: WindowsUpdateState) => void;
    launch: typeof launchWindowsInstaller; quit: () => boolean;
  }) {}

  get state(): WindowsUpdateState {
    return this.asset ? {version: this.asset.version, downloading: this.busy} : null;
  }

  async clearOldDownloads() {
    // The desktop single-instance lock is held. Only remove our previous staging directories.
    await mkdir(this.options.cache, {recursive: true});
    for (const entry of await readdir(this.options.cache, {withFileTypes: true})) {
      if (entry.isDirectory() && /^setup-[a-zA-Z0-9]{6}$/.test(entry.name)) {
        await rm(path.join(this.options.cache, entry.name), {recursive: true, force: true}).catch(() => {});
      }
    }
  }

  check(): Promise<void> {
    if (this.busy) return Promise.resolve();
    this.checkInFlight ??= this.find().finally(() => { this.checkInFlight = undefined; });
    return this.checkInFlight;
  }

  private async find() {
    const {fetch, version, arch} = this.options;
    const result = await latestUpdate(fetch, version, 'win32', arch, this.controller.signal);
    if (this.busy || this.controller.signal.aborted) return;
    this.asset = 'state' in result ? undefined : result;
    this.options.changed(this.state);
    if ('state' in result && result.state === 'unavailable') throw new Error('此发布暂无可校验的 Windows x64 安装程序。');
  }

  install(): Promise<void> {
    if (!this.asset) return Promise.reject(new Error('请重新检查更新。'));
    this.installation ??= this.downloadAndLaunch(this.asset).finally(() => {
      this.installation = undefined;
      this.busy = false;
      if (!this.controller.signal.aborted) this.options.changed(this.state);
    });
    return this.installation;
  }

  private async downloadAndLaunch(asset: ReleaseAsset) {
    this.busy = true;
    this.options.changed(this.state);
    const {cache, directory, fetch, launch, quit} = this.options;
    const stage = await mkdtemp(path.join(cache, 'setup-'));
    const file = path.join(stage, `FocusJournal-${asset.version}-Setup.exe`);
    let started = false;
    try {
      await downloadVerified(fetch, asset, file, this.controller.signal);
      this.controller.signal.throwIfAborted();
      await launch(file, directory);
      started = true;
      // Setup waits for this process to exit and fails without replacing files on timeout.
      if (!quit()) throw new Error('工作区仍在使用，更新已暂停。请先保存工作，再重试。');
    } finally {
      if (!started) await rm(stage, {recursive: true, force: true});
    }
  }

  dispose() { this.controller.abort(); }
}
