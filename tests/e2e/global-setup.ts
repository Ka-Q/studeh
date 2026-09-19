import fs from 'node:fs/promises';
import { TEST_DOCUMENTS_DIR } from './testPaths.js';

export default async function globalSetup(): Promise<void> {
    await fs.rm(TEST_DOCUMENTS_DIR, { recursive: true, force: true });
    await fs.mkdir(TEST_DOCUMENTS_DIR, { recursive: true });
}
