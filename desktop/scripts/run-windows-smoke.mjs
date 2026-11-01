// Run only the explicitly packaged QA executable; never touch a personal profile.
import assert from 'node:assert/strict';
import {spawn, execFileSync} from 'node:child_process';
import {existsSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

if (process.platform !== 'win32' || process.arch !== 'x64') throw Error('Windows x64 is required.');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
const packageDir = path.join(root, 'release', `qa-${pkg.version}`);
const executable = path.join(packageDir, '专注记.exe');
const output = path.join(root, 'qa-evidence', `release-${pkg.version}`);
const dataDir = path.join(root, 'qa-data', `release-${pkg.version}`);
assert.equal(JSON.parse(readFileSync(path.join(packageDir, 'build-info.json'), 'utf8')).qa, true);
assert.ok(existsSync(path.join(dataDir, 'journal.sqlite')), 'Seed the isolated QA profile first.');
mkdirSync(output, {recursive: true});
// Refuse stale evidence instead of reporting an earlier run as successful.
for (const name of ['packaged-smoke.json', 'packaged-restart.json']) {
  assert.equal(existsSync(path.join(output, name)), false, 'Use a fresh checkout for native CI verification.');
}
for (const restart of [false, true]) {
  const name = restart ? 'restart' : 'smoke';
  let stdout = '', stderr = '', timedOut = false;
  const env = {...process.env};
  delete env.ELECTRON_RUN_AS_NODE;
  const child = spawn(executable, restart ? ['--restart-verification'] : [], {
    cwd: root, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', value => stdout += value);
  child.stderr.on('data', value => stderr += value);
  const stopOwnedTree = () => {
    if (!child.pid || child.exitCode !== null || child.signalCode !== null) return;
    try {
      execFileSync('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], {windowsHide: true, stdio: 'pipe', timeout: 10000});
    } catch { child.kill(); }
  };
  const timeout = setTimeout(() => { timedOut = true; stopOwnedTree(); }, 60000);
  let code;
  try {
    code = await new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('close', resolve);
    });
  } finally {
    clearTimeout(timeout);
    stopOwnedTree();
    writeFileSync(path.join(output, `windows-${name}.log`), stdout);
    writeFileSync(path.join(output, `windows-${name}.err`), stderr);
  }
  assert.equal(timedOut, false, `${name} exceeded the timeout.`);
  assert.equal(code, 0, `${name} exited unsuccessfully; inspect the verification logs.`);
  const result = JSON.parse(readFileSync(path.join(output, `packaged-${name}.json`), 'utf8'));
  assert.equal(result.version, pkg.version);
  assert.equal(result.packaged, true);
  assert.equal(path.resolve(result.dataDir), dataDir);
  assert.deepEqual(result.failures, []);
  assert.equal(result.remainingWindows, 0);
  assert.ok(result.checks.length >= (restart ? 7 : 30), 'Incomplete native verification.');
  console.log(`Windows ${name}: ${result.checks.length} passed; application exited with no windows left.`);
}
