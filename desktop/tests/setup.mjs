import { mkdirSync } from 'node:fs';

// Test artifacts are local-only. A fresh clone must not depend on old QA output.
mkdirSync(new URL('../qa-evidence/', import.meta.url), { recursive: true });
