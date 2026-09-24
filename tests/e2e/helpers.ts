import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Page } from '@playwright/test';

const currentDir = path.dirname(fileURLToPath(import.meta.url));

export const SAMPLE_IMAGE_PATH = path.join(currentDir, 'fixtures', 'sample.png');
export const SAMPLE_IMAGE_SIZE = { width: 240, height: 180 };

export function uniqueName(label: string): string {
    return `${label} ${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function createDocument(page: Page, name: string): Promise<string> {
    const previousUrl = page.url();
    await page.locator('#btn-new').click();
    await page.locator('#new-document-name').fill(name);
    await page.locator('#btn-confirm-new-document').click();
    await page.waitForFunction(function urlChangedToDocument(prev) {
        return location.href !== prev && /\/doc-[a-z0-9]+$/.test(location.pathname);
    }, previousUrl);
    return new URL(page.url()).pathname.slice(1);
}

export async function addPage(page: Page): Promise<void> {
    await page.locator('#btn-add-page').click();
    await page.keyboard.press('Escape');
}

export function getCanvas(page: Page) {
    return page.locator('#canvas-area .canvas-body canvas');
}

export async function assignActivePageImage(page: Page, filePath = SAMPLE_IMAGE_PATH): Promise<void> {
    await page.locator('#canvas-area input[type="file"]').first().setInputFiles(filePath);
    await getCanvas(page).waitFor();
}

export async function addPageFromImages(page: Page, filePaths: string[] = [SAMPLE_IMAGE_PATH]): Promise<void> {
    await page.locator('#sidebar-footer input[type="file"]').setInputFiles(filePaths);
}

export interface ScreenRect {
    left: number;
    top: number;
    width: number;
    height: number;
}

export async function resetZoomTo100(page: Page): Promise<void> {
    await getCanvas(page).click();
    await page.keyboard.press('0');
}

export async function imageOnScreenRect(page: Page, imageSize = SAMPLE_IMAGE_SIZE): Promise<ScreenRect> {
    // Fit-to-view no longer guarantees 100% zoom (it can scale small images up
    // past that), so pin zoom to a known 1:1 scale before computing this rect --
    // every caller relies on screen-space offsets mapping directly to image pixels.
    await resetZoomTo100(page);
    const box = await getCanvas(page).boundingBox();
    if (!box) {
        throw new Error('Canvas has no bounding box');
    }
    return {
        left: box.x + (box.width - imageSize.width) / 2,
        top: box.y + (box.height - imageSize.height) / 2,
        width: imageSize.width,
        height: imageSize.height
    };
}

export async function dragOnCanvas(page: Page, from: { x: number; y: number }, to: { x: number; y: number }): Promise<void> {
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(to.x, to.y, { steps: 5 });
    await page.mouse.up();
}

export async function fetchManifest(page: Page, documentId: string): Promise<{
    id: string;
    pages: { id: string; shapes: { id: string }[] }[];
}> {
    const res = await page.request.get(`/api/documents/${documentId}`);
    return res.json();
}

export async function isShapeRevealed(page: Page, point: { x: number; y: number }): Promise<boolean> {
    return getCanvas(page).evaluate(async function readPixel(canvas: HTMLCanvasElement, target: { x: number; y: number }) {
        function samplePixel(): Uint8ClampedArray {
            const rect = canvas.getBoundingClientRect();
            const context = canvas.getContext('2d')!;
            return context.getImageData(
                Math.round((target.x - rect.left) * (canvas.width / rect.width)),
                Math.round((target.y - rect.top) * (canvas.height / rect.height)),
                1,
                1
            ).data;
        }

        // A freshly (re)mounted canvas hasn't drawn the image yet on the first
        // animation frame or two — wait for this point to stop being transparent
        // (cleared, never drawn) before treating its color as meaningful.
        const deadline = Date.now() + 2000;
        let pixel = samplePixel();
        while (pixel[3] === 0 && Date.now() < deadline) {
            await new Promise(function waitForNextFrame(resolve) {
                requestAnimationFrame(resolve);
            });
            pixel = samplePixel();
        }
        if (pixel[3] === 0) {
            throw new Error('Canvas did not paint within 2000ms');
        }

        // Matches imageCanvas.ts's OCCLUSION_FILL_STYLE ('rgb(121, 122, 123)') — this
        // runs serialized in the browser context, so it can't import that constant.
        const occlusionFillRgb = { r: 121, g: 122, b: 123 };
        const tolerance = 12;
        return !(
            Math.abs(pixel[0] - occlusionFillRgb.r) < tolerance &&
            Math.abs(pixel[1] - occlusionFillRgb.g) < tolerance &&
            Math.abs(pixel[2] - occlusionFillRgb.b) < tolerance
        );
    }, point);
}

export async function saveDocument(page: Page): Promise<void> {
    await page.locator('#btn-save').click();
    await page.locator('#save-status.visible').filter({ hasText: 'Saved' }).waitFor();
}
