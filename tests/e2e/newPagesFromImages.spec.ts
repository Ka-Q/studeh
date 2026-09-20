import { test, expect } from '@playwright/test';
import { addPageFromImages, createDocument, SAMPLE_IMAGE_PATH, uniqueName } from './helpers';

test('a failed upload mid-batch rolls back that page and continues with the rest', async ({ page }) => {
    await page.goto('/');
    await createDocument(page, uniqueName('Batch Upload Doc'));

    let uploadCount = 0;
    await page.route('**/api/documents/*/pages/*/image', async function onRoute(route) {
        if (route.request().method() !== 'POST') {
            await route.continue();
            return;
        }
        uploadCount += 1;
        if (uploadCount === 2) {
            await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'boom' }) });
        } else {
            await route.continue();
        }
    });

    await addPageFromImages(page, [SAMPLE_IMAGE_PATH, SAMPLE_IMAGE_PATH, SAMPLE_IMAGE_PATH]);

    await expect(page.locator('.page-item')).toHaveCount(2);
});
