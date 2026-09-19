import os from 'node:os';
import path from 'node:path';

export const TEST_PORT = 3111;
export const TEST_BASE_URL = `http://localhost:${TEST_PORT}`;
export const TEST_DOCUMENTS_DIR = path.join(os.tmpdir(), 'studeh-e2e-documents');
