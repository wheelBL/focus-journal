import {createHash} from 'node:crypto';
import {createWriteStream} from 'node:fs';
import {Readable, Transform} from 'node:stream';
import {pipeline} from 'node:stream/promises';

const repository = 'wheelBL/focus-journal';
const releaseUrl = `https://api.github.com/repos/${repository}/releases/latest`;
const versionPattern = /^(0|[1-9]\d{0,8})\.(0|[1-9]\d{0,8})\.(0|[1-9]\d{0,8})$/;
const maximumBytes = 1024 ** 3;

export type ReleaseAsset = {version: string; url: string; size: number; digest: string};
type Release = {tag_name?: string; draft?: boolean; prerelease?: boolean; assets?: Array<{
  name: string; browser_download_url: string; size: number; digest?: string; state: string;
}>};
export type ReleaseStatus = {state: 'current' | 'unavailable'};

export function selectUpdate(release: Release, installed: string, platform: NodeJS.Platform, arch: string): ReleaseAsset | ReleaseStatus {
  const version = release.tag_name?.startsWith('v') ? release.tag_name.slice(1) : '';
  if (!versionPattern.test(version) || !versionPattern.test(installed) ||
      !(platform === 'darwin' && ['arm64','x64'].includes(arch) || platform === 'win32' && arch === 'x64') || release.draft || release.prerelease) {
    return {state: 'unavailable'};
  }
  const before = installed.split('.').map(Number);
  const delta = version.split('.').map((part, index) => Number(part) - before[index]).find(Boolean) ?? 0;
  if (delta <= 0) return {state: 'current'};

  const name = platform === 'win32' ? `FocusJournal-${version}-Windows-x64-Setup.exe` : `FocusJournal-${version}-macOS-${arch}.zip`;
  const url = `https://github.com/${repository}/releases/download/v${version}/${name}`;
  const asset = release.assets?.find(item => item.name === name && item.state === 'uploaded');
  if (!asset || asset.browser_download_url !== url || !/^sha256:[a-f0-9]{64}$/.test(asset.digest ?? '') ||
      !Number.isSafeInteger(asset.size) || asset.size <= 0 || asset.size > maximumBytes) {
    return {state: 'unavailable'};
  }
  return {version, url, size: asset.size, digest: asset.digest!.slice(7)};
}

export type UpdateFetch = (url: string, init?: RequestInit) => Promise<Response>;

export async function latestUpdate(fetch: UpdateFetch, version: string, platform: NodeJS.Platform, arch: string, signal: AbortSignal): Promise<ReleaseAsset | ReleaseStatus> {
  const response = await fetch(releaseUrl, {
    headers: {Accept: 'application/vnd.github+json'},
    signal: AbortSignal.any([signal, AbortSignal.timeout(15000)]),
  });
  if (response.status === 404) return {state: 'unavailable'};
  if (!response.ok) throw new Error(`GitHub 返回 HTTP ${response.status}。`);
  return selectUpdate(await response.json() as Release, version, platform, arch);
}

export async function downloadVerified(fetch: UpdateFetch, update: ReleaseAsset, destination: string, signal: AbortSignal) {
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
  await pipeline(Readable.fromWeb(download.body as import('node:stream/web').ReadableStream<Uint8Array>), verify, createWriteStream(destination, {flags: 'wx'}), {signal: downloadSignal});
  if (size !== update.size || hash.digest('hex') !== update.digest) throw new Error('更新包 SHA-256 校验失败。');
}
