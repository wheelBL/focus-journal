import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lock = JSON.parse(readFileSync(path.join(root, 'package-lock.json'), 'utf8'));
const sections = [
  'Third-party notices for Focus Journal / 专注记',
  'Generated from the locked production dependencies. Some packages are removed by bundling/tree shaking.',
  'Electron and Chromium notices are supplied separately as LICENSE and LICENSES.chromium.html in the Windows distribution.',
  'These notices apply to third-party components, not to the application source as a whole.',
];
const seen = new Set();
for (const [relative, entry] of Object.entries(lock.packages).sort(([a], [b]) => a.localeCompare(b))) {
  if (!relative || entry.dev || entry.link) continue;
  const directory = path.join(root, relative);
  const manifest = JSON.parse(readFileSync(path.join(directory, 'package.json'), 'utf8'));
  const identity = `${manifest.name}@${manifest.version}`;
  if (seen.has(identity)) continue;
  seen.add(identity);
  const files = readdirSync(directory).filter(name => /^(licen[sc]e|notice|copying)([.\-_]|$)/i.test(name) && statSync(path.join(directory, name)).isFile()).sort();
  sections.push('\n' + '='.repeat(72), identity, `License: ${manifest.license ?? entry.license ?? 'see text below'}`);
  if (!files.length) {
    const fallback = {
      '@fluentui/react-icons': 'fluentui-system-icons.txt',
      'clean-git-ref': 'clean-git-ref.txt',
      'diff3': 'diff3.txt',
      'minimisted': 'minimisted.txt',
    }[manifest.name];
    if (!fallback) throw new Error(`Missing third-party license text: ${identity}`);
    sections.push(readFileSync(path.join(root, '../docs/licenses', fallback), 'utf8').trim());
  }
  for (const name of files) sections.push(`--- ${name} ---`, readFileSync(path.join(directory, name), 'utf8').trim());
  if (manifest.name === 'pako') {
    const notice = readFileSync(path.join(directory, 'lib/zlib/deflate.js'), 'utf8').match(/^\/\/.*(?:\r?\n\/\/.*)*/m)?.[0];
    if (!notice) throw new Error('Missing pako zlib source notice');
    sections.push('--- zlib source notice ---', notice);
  }
}
writeFileSync(path.join(root, '..', 'THIRD_PARTY_NOTICES.txt'), sections.join('\n\n') + '\n', 'utf8');
console.log(`Collected notices for ${seen.size} production packages.`);
