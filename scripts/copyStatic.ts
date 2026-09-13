import { copyFileSync, cpSync, mkdirSync, rmSync } from 'node:fs';
import { dirname } from 'node:path';

const staticFiles = [
    ['src/client/index.html', 'public/index.html'],
    ['src/client/css/app.css', 'public/css/app.css'],
];

for (const [from, to] of staticFiles) {
    mkdirSync(dirname(to), { recursive: true });
    copyFileSync(from, to);
}

rmSync('public/icons', { recursive: true, force: true });
cpSync('src/client/icons', 'public/icons', { recursive: true });
