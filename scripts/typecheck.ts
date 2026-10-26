import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

// Runs tsc --noEmit on the given tsconfig, or on its `tsconfig.local-analysis.json` sibling when `useLocal` is set in analysis.config.json,
// so the types are checked against the same analysis package that vite.config.ts bundles.
const [tsconfigPath] = process.argv.slice(2);
if (!tsconfigPath) {
    throw new Error('Usage: node scripts/typecheck.ts <path/to/tsconfig.json>');
}

const { useLocal } = JSON.parse(readFileSync('analysis.config.json', 'utf8')) as { useLocal: boolean };
if (useLocal) {
    console.warn('[studeh] analysis.config.json: typechecking against the local ../image-analysis checkout');
}
const project = useLocal ? join(dirname(tsconfigPath), 'tsconfig.local-analysis.json') : tsconfigPath;
const result = spawnSync('npx', ['tsc', '--noEmit', '-p', project], { stdio: 'inherit' });
process.exit(result.status ?? 1);
