import assert from 'node:assert/strict';
import { test, after } from 'node:test';
import fs from 'node:fs/promises';
import path from 'node:path';

const relativeDocumentsDir = 'tmp-studeh-paths-test-override';
process.env.STUDEH_DOCUMENTS_DIR = relativeDocumentsDir;

const { documentsRoot } = await import('./paths.ts');
const { createDocument } = await import('./store.ts');

after(async function cleanup() {
    await fs.rm(documentsRoot, { recursive: true, force: true });
});

test('STUDEH_DOCUMENTS_DIR overrides the documents storage root, resolved against the cwd', async function () {
    assert.equal(documentsRoot, path.resolve(relativeDocumentsDir));

    const manifest = await createDocument('Override test');

    await fs.access(path.join(documentsRoot, manifest.id, 'manifest.json'));
});
