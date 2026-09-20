import { test, expect } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import { addPage, assignActivePageImage, createDocument, saveDocument, uniqueName } from './helpers';

const REAL_DOCUMENTS_DIR = path.resolve(process.cwd(), 'data', 'documents');

async function snapshotRealDocumentsDir(): Promise<Record<string, number>> {
    try {
        const entries = await fs.readdir(REAL_DOCUMENTS_DIR, { withFileTypes: true });
        const snapshot: Record<string, number> = {};
        for (const entry of entries) {
            const stat = await fs.stat(path.join(REAL_DOCUMENTS_DIR, entry.name));
            snapshot[entry.name] = stat.mtimeMs;
        }
        return snapshot;
    } catch {
        return {};
    }
}

test('creating, editing and saving a document through the e2e server never touches the real data/documents directory', async ({ page }) => {
    const before = await snapshotRealDocumentsDir();

    await page.goto('/');
    await createDocument(page, uniqueName('Storage Isolation Doc'));
    await addPage(page);
    await assignActivePageImage(page);
    await saveDocument(page);

    const after = await snapshotRealDocumentsDir();
    expect(after).toEqual(before);
});
