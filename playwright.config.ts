import { defineConfig } from '@playwright/test';
import { TEST_BASE_URL, TEST_DOCUMENTS_DIR, TEST_PORT } from './tests/e2e/testPaths.js';

export default defineConfig({
    testDir: './tests/e2e',
    globalSetup: './tests/e2e/global-setup.ts',
    globalTeardown: './tests/e2e/global-teardown.ts',
    fullyParallel: true,
    use: {
        baseURL: TEST_BASE_URL
    },
    webServer: {
        command: 'npm run start',
        url: TEST_BASE_URL,
        reuseExistingServer: false,
        env: {
            PORT: String(TEST_PORT),
            STUDEH_DOCUMENTS_DIR: TEST_DOCUMENTS_DIR,
            SKIP_OPEN_BROWSER: '1'
        }
    }
});
