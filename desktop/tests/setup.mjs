import { mkdirSync } from 'node:fs';

// Test artifacts are local-only. A fresh clone must not depend on old QA output.
for (const directory of ['qa-evidence', 'qa-data']) {
  mkdirSync(new URL(`../${directory}/`, import.meta.url), { recursive: true });
}
