import {createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {constants, createWriteStream, mkdtempSync, renameSync, rmSync} from 'node:fs';
import {access, lstat, open} from 'node:fs/promises';
import path from 'node:path';
import {Readable, Transform} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import {promisify} from 'node:util';

const repository = 'wheelBL/focus-journal';
const releaseUrl = `https://api.github.com/repos/${repository}/releases/latest`;
const appName = '专注记.app';
const appId = 'local.focusjournal.desktop';
const versionPattern = /^(0|[1-9]\d{0,8})\.(0|[1-9]\d{0,8})\.(0|[1-9]\d{0,8})$/;
const maximumBytes = 1024 ** 3;
const run = promisify(execFile);

type Asset = {version: string; url: string; size: number; digest: string};
type Release = {tag_name?: string; draft?: boolean; prerelease?: boolean; assets?: Array<{
  name: string; browser_download_url: string; size: number; digest?: string; state: string;
}>};
export type UpdateStatus = {state: 'current' | 'unavailable'} | {state: 'ready'; version: string};

export function selectMacUpdate(release: Release, installed: string, arch: string): Asset | UpdateStatus {
  const version = release.tag_name?.startsWith('v') ? release.tag_name.slice(1) : '';
  if (!versionPattern.test(version) || !versionPattern.test(installed) ||
      !['arm64', 'x64'].includes(arch) || release.draft || release.prerelease) {
    return {state: 'unavailable'};
  }
  const before = installed.split('.').map(Number);
  const delta = version.split('.').map((part, index) => Number(part) - before[index]).find(Boolean) ?? 0;
  if (delta <= 0) return {state: 'current'};

  const name = `FocusJournal-${version}-macOS-${arch}.zip`;
  const url = `https://github.com/${repository}/releases/download/v${version}/${name}`;
  const asset = release.assets?.find(item => item.name === name && item.state === 'uploaded');
  if (!asset || asset.browser_download_url !== url || !/^sha256:[a-f0-9]{64}$/.test(asset.digest ?? '') ||
      !Number.isSafeInteger(asset.size) || asset.size <= 0 || asset.size > maximumBytes) {
    return {state: 'unavailable'};
  }
  return {version, url, size: asset.size, digest: asset.digest!.slice(7)};
}

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
    target: string; version: string; arch: string; fetch: (url: string, init?: RequestInit) => Promise<Response>;
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
    const response = await fetch(releaseUrl, {
      headers: {Accept: 'application/vnd.github+json'},
      signal: AbortSignal.any([signal, AbortSignal.timeout(15000)]),
    });
    if (response.status === 404) return {state: 'unavailable'};
    if (!response.ok) throw new Error(`GitHub 返回 HTTP ${response.status}。`);
    const update = selectMacUpdate(await response.json() as Release, version, arch);
    if ('state' in update) return update;

    const parent = path.dirname(target);
    await access(parent, constants.W_OK);
    signal.throwIfAborted();
    const stage = mkdtempSync(path.join(parent, '.focus-journal-update-'));
    this.staging = stage;
    const zip = path.join(stage, 'update.zip');
    try {
      const downloadSignal = AbortSignal.any([signal, AbortSignal.timeout(600000)]);
      const download = await fetch(update.url, {signal: downloadSignal});
      if (!download.ok || !download.body) throw new Error(`下载失败（HTTP ${download.status}）。`);
      const hash = createHash('sha256');
      let size = 0;
      const verify = new Transform({transform(chunk: Buffer, _encoding, callback) {
        size += chunk.length;
        if (size > update.size) return callback(new Error('更新包大小超出 GitHub 发布记录。'));
        hash.update(chunk);
        callback(null, chunk);
      }});
      await pipeline(Readable.fromWeb(download.body as import('node:stream/web').ReadableStream<Uint8Array>), verify, createWriteStream(zip, {flags: 'wx'}), {signal: downloadSignal});
      if (size !== update.size || hash.digest('hex') !== update.digest) throw new Error('更新包 SHA-256 校验失败。');

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
