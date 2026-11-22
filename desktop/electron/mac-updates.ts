import {execFile} from 'node:child_process';
import {constants, mkdtempSync, renameSync, rmSync} from 'node:fs';
import {access, lstat, open} from 'node:fs/promises';
import path from 'node:path';
import {promisify} from 'node:util';

import {downloadVerified, latestUpdate, type ReleaseStatus, type UpdateFetch} from './release-updates';
const appName = '专注记.app';
const appId = 'local.focusjournal.desktop';
const run = promisify(execFile);
export type UpdateStatus = ReleaseStatus | {state: 'ready'; version: string};

async function verifyArchitecture(app: string, arch: string): Promise<void> {
  // Release packages contain a thin 64-bit Mach-O executable.
  const executable = await open(path.join(app, 'Contents/MacOS/专注记'), 'r');
  try {
    const {buffer, bytesRead} = await executable.read(Buffer.alloc(8), 0, 8, 0);
    const cpuType = arch === 'arm64' ? 0x0100000c : 0x01000007;
    if (bytesRead !== 8 || buffer.readUInt32LE(0) !== 0xfeedfacf || buffer.readUInt32LE(4) !== cpuType) {
      throw new Error('更新包与 Mac 架构不匹配。');
    }
  } finally {
    await executable.close();
  }
}

export function replaceMacApp(target: string, staged: string, backup: string): void {
  renameSync(target, backup);
  try {
    renameSync(staged, target);
  } catch (error) {
    try {
      renameSync(backup, target);
    } catch (restoreError) {
      throw new AggregateError([error, restoreError], `旧版应用保存在 ${backup}，请将它移回 ${target}。`);
    }
    throw error;
  }
}

export class MacUpdates {
  private readonly controller = new AbortController();
  private checking?: Promise<UpdateStatus>;
  private staging?: string;
  private prepared?: {stage: string; version: string};

  constructor(private readonly options: {
    target: string; version: string; arch: string; fetch: UpdateFetch;
  }) {}

  check(): Promise<UpdateStatus> {
    if (this.prepared) return Promise.resolve({state: 'ready', version: this.prepared.version});
    this.checking ??= this.prepare().finally(() => { this.checking = undefined; });
    return this.checking;
  }

  cancel(): void {
    this.controller.abort();
    if (this.staging) rmSync(this.staging, {recursive: true, force: true});
  }

  // Call only after the journal has completed its normal shutdown.
  install(): boolean {
    if (!this.prepared) return false;
    const {stage} = this.prepared;
    this.prepared = undefined;
    replaceMacApp(this.options.target, path.join(stage, appName), path.join(stage, 'previous.app'));
    // Replacement is complete even if a temporary file cannot be removed.
    try { rmSync(stage, {recursive: true, force: true}); } catch { /* Best-effort cleanup. */ }
    return true;
  }

  private async prepare(): Promise<UpdateStatus> {
    const {target, version, arch, fetch} = this.options;
    const signal = this.controller.signal;
    const update = await latestUpdate(fetch, version, 'darwin', arch, signal);
    if ('state' in update) return update;

    const parent = path.dirname(target);
    await access(parent, constants.W_OK);
    signal.throwIfAborted();
    const stage = mkdtempSync(path.join(parent, '.focus-journal-update-'));
    this.staging = stage;
    const zip = path.join(stage, 'update.zip');
    try {
      await downloadVerified(fetch, update, zip, signal);

      await run('/usr/bin/ditto', ['-x', '-k', zip, stage], {signal, timeout: 120000});
      const app = path.join(stage, appName);
      if (!(await lstat(app)).isDirectory()) throw new Error('更新包中缺少专注记应用。');
      await run('/usr/bin/codesign', ['--verify', '--deep', '--strict', '-R', `=identifier "${appId}"`, app], {signal});
      const {stdout} = await run('/usr/bin/plutil', ['-extract', 'CFBundleShortVersionString', 'raw', '-o', '-', path.join(app, 'Contents/Info.plist')], {signal});
      if (stdout.trim() !== update.version) throw new Error('应用版本与 GitHub 发布版本不一致。');
      await verifyArchitecture(app, arch);
      signal.throwIfAborted();
      rmSync(zip);
      this.prepared = {stage, version: update.version};
      return {state: 'ready', version: update.version};
    } finally {
      this.staging = undefined;
      if (this.prepared?.stage !== stage) rmSync(stage, {recursive: true, force: true});
    }
  }
}
