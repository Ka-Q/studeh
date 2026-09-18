import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

const GENERATED_HEADER = '// AUTO-GENERATED from src/shared/types.ts - do not edit directly.\n\n';

const source = readFileSync('src/shared/types.ts', 'utf8');
const generated = GENERATED_HEADER + source;

const targets = [
    'src/client/document/types.ts',
    'src/server/documents/types.ts',
];

for (const target of targets) {
    if (existsSync(target) && readFileSync(target, 'utf8') === generated) {
        continue;
    }
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, generated);
}
