import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect, type Page } from '@playwright/test';
import { addPage, assignActivePageImage, createDocument, dragOnCanvas, fetchManifest, imageOnScreenRect, saveDocument, uniqueName } from './helpers';

// Two labels, "Femur shaft" (295, 70) and "Patella" (30, 192), each with a leader to an ellipse.
const LABELS_IMAGE_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'labels.png');
const LABELS_IMAGE_SIZE = { width: 400, height: 260 };

type Box = { x: number; y: number; width: number; height: number };

async function savedShapes(page: Page, docId: string): Promise<Box[]> {
    await saveDocument(page);
    const manifest = await fetchManifest(page, docId);
    return manifest.pages[0].shapes as unknown as Box[];
}

async function openLabelsPage(page: Page, label: string): Promise<string> {
    await page.goto('/');
    const docId = await createDocument(page, uniqueName(label));
    await addPage(page);
    await assignActivePageImage(page, LABELS_IMAGE_PATH);
    return docId;
}

function covers(box: Box, x: number, y: number): boolean {
    return x >= box.x && x <= box.x + box.width && y >= box.y && y <= box.y + box.height;
}

// What the length slider says to a screen reader: its length and how many boxes that gives.
function says(bar: ReturnType<typeof previewBar>, text: string | RegExp) {
    return expect(bar.slider).toHaveAttribute('aria-valuetext', typeof text === 'string' ? new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) : text);
}

// The preview's controls: its slider and the box count it reads out.
function previewBar(page: Page) {
    return { slider: page.getByRole('slider', { name: 'Minimum label length' }), apply: page.getByRole('button', { name: 'Apply' }), cancel: page.getByRole('button', { name: 'Cancel' }), merge: page.getByRole('slider', { name: 'Merge distance' }) };
}

async function openPreview(page: Page): Promise<ReturnType<typeof previewBar>> {
    await page.getByRole('button', { name: 'Auto-occlude' }).click();
    const bar = previewBar(page);
    await expect(bar.slider).toBeVisible();
    return bar;
}

// The slider starts at the longest labels, where nothing is covered: moved to the far right it covers every label.
async function showAllBoxes(page: Page, bar: ReturnType<typeof previewBar>): Promise<void> {
    await bar.slider.focus();
    await page.keyboard.press('End');
    await expect(bar.apply).toBeEnabled();
}

test('auto-occlude shows its boxes as a preview, without asking, and applying them covers each label', async ({ page }) => {
    const docId = await openLabelsPage(page, 'Auto Occlude Doc');
    const imageRect = await imageOnScreenRect(page, LABELS_IMAGE_SIZE);
    await dragOnCanvas(page, { x: imageRect.left + 160, y: imageRect.top + 100 }, { x: imageRect.left + 200, y: imageRect.top + 140 });

    const bar = await openPreview(page);
    await showAllBoxes(page, bar);
    await expect(page.locator('#confirm-dialog')).not.toBeVisible();
    await expect(bar.apply).toHaveAttribute('title', 'Replaces 1 occlusion');
    // Nothing of the page has changed yet: the one drawn occlusion is the only edit to undo.
    await bar.apply.click();
    await expect(bar.slider).not.toBeVisible();
    await expect.poll(async () => (await savedShapes(page, docId)).length).toBe(2);
    const shapes = await savedShapes(page, docId);
    expect(shapes.some((box) => covers(box, 300, 80) && covers(box, 385, 80))).toBe(true);
    expect(shapes.some((box) => covers(box, 35, 202) && covers(box, 85, 202))).toBe(true);
});

test('applied auto-occlusion is one undo step', async ({ page }) => {
    const docId = await openLabelsPage(page, 'Auto Occlude Undo Doc');
    const imageRect = await imageOnScreenRect(page, LABELS_IMAGE_SIZE);
    await dragOnCanvas(page, { x: imageRect.left + 160, y: imageRect.top + 100 }, { x: imageRect.left + 200, y: imageRect.top + 140 });

    const bar = await openPreview(page);
    await showAllBoxes(page, bar);
    await bar.apply.click();
    await expect.poll(async () => (await savedShapes(page, docId)).length).toBe(2);
    await page.locator('#btn-undo').click();

    const shapes = await savedShapes(page, docId);
    expect(shapes).toHaveLength(1);
    expect(covers(shapes[0], 180, 120)).toBe(true);
});

test('the slider starts at the longest labels and covers more as it moves right, live', async ({ page }) => {
    const docId = await openLabelsPage(page, 'Auto Occlude Slider Doc');
    const bar = await openPreview(page);
    await says(bar, 'Minimum length 24 units');
    const countAt = async () => Number(/(\d+) box/.exec((await bar.slider.getAttribute('aria-valuetext')) ?? '')?.[1] ?? 0);

    await bar.slider.focus();
    await page.keyboard.press('End');
    await says(bar, 'Minimum length 2 units');
    await expect.poll(countAt).toBe(2);
    await page.keyboard.press('Home');
    await says(bar, 'Minimum length 24 units');
    await page.keyboard.press('End');
    await expect.poll(countAt).toBe(2);

    await page.keyboard.press('Escape');
    await expect(bar.slider).not.toBeVisible();
    expect(await savedShapes(page, docId)).toHaveLength(0);
    await page.getByRole('button', { name: 'Auto-occlude' }).click();
    await says(previewBar(page), 'Minimum length 24 units');
});

test('on a page without text the preview has no boxes and Apply is not offered', async ({ page }) => {
    await page.goto('/');
    await createDocument(page, uniqueName('Auto Occlude No Text Doc'));
    await addPage(page);
    await assignActivePageImage(page);

    const bar = await openPreview(page);

    await says(bar, 'no boxes');
    await expect(bar.apply).toBeDisabled();
});

// Two labels one under the other, close enough that their boxes nearly touch, but read as two labels.
const CLOSE_LABELS_IMAGE_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'labels-close.png');

test('merging joins boxes that lie within the distance, live, and applying gives the merged box', async ({ page }) => {
    await page.goto('/');
    const docId = await createDocument(page, uniqueName('Auto Occlude Merge Doc'));
    await addPage(page);
    await assignActivePageImage(page, CLOSE_LABELS_IMAGE_PATH);
    const bar = await openPreview(page);
    await showAllBoxes(page, bar);
    await says(bar, '2 boxes');
    // Merging starts off, at the left end of its slider; moving right joins boxes by how near they are.
    await expect(bar.merge).toHaveAttribute('aria-valuetext', 'Merge boxes: Off');
    await bar.merge.focus();
    await page.keyboard.press('End');
    await expect(bar.merge).toHaveAttribute('aria-valuetext', 'Merge boxes: within 3 lines');
    await says(bar, '1 box');
    await page.keyboard.press('Home');
    await says(bar, '2 boxes');
    await page.keyboard.press('End');
    await says(bar, '1 box');

    // The same distance typed: the number field and the slider follow each other, and empty is Off.
    const typed = page.getByRole('spinbutton', { name: 'Merge distance in line heights' });
    await expect(typed).toHaveValue('3');
    await typed.fill('');
    await expect(bar.merge).toHaveAttribute('aria-valuetext', 'Merge boxes: Off');
    await says(bar, '2 boxes');
    await typed.fill('2');
    await expect(bar.merge).toHaveAttribute('aria-valuetext', 'Merge boxes: within 2 lines');
    await says(bar, '1 box');
    await typed.fill('0');
    await expect(bar.merge).toHaveAttribute('aria-valuetext', 'Merge boxes: touching');
    await says(bar, '2 boxes');
    await bar.merge.focus();
    await page.keyboard.press('End');
    await expect(typed).toHaveValue('3');

    await bar.apply.click();
    await expect.poll(async () => (await savedShapes(page, docId)).length).toBe(1);
    const [box] = await savedShapes(page, docId);
    expect(covers(box, 40, 45) && covers(box, 40, 90)).toBe(true);
});

test('keyboard focus goes to the length slider when the preview opens and back to the button when it closes', async ({ page }) => {
    await openLabelsPage(page, 'Auto Occlude Focus Doc');

    const bar = await openPreview(page);
    await expect(bar.slider).toBeFocused();
    await page.keyboard.press('Escape');

    await expect(bar.slider).not.toBeVisible();
    await expect(page.getByRole('button', { name: 'Auto-occlude' })).toBeFocused();
});

test('the mouse wheel over the sliders and the number field moves them, up towards more', async ({ page }) => {
    await openLabelsPage(page, 'Auto Occlude Wheel Doc');
    const bar = await openPreview(page);
    await says(bar, 'Minimum length 24 units');

    const lengthBox = (await bar.slider.boundingBox())!;
    await page.mouse.move(lengthBox.x + lengthBox.width / 2, lengthBox.y + lengthBox.height / 2);
    await page.mouse.wheel(0, -100);
    await says(bar, 'Minimum length 23 units');
    await page.mouse.wheel(0, 100);
    await says(bar, 'Minimum length 24 units');

    const mergeBox = (await bar.merge.boundingBox())!;
    await page.mouse.move(mergeBox.x + mergeBox.width / 2, mergeBox.y + mergeBox.height / 2);
    await expect(bar.merge).toHaveAttribute('aria-valuetext', 'Merge boxes: Off');
    await page.mouse.wheel(0, -100);
    await expect(bar.merge).toHaveAttribute('aria-valuetext', 'Merge boxes: overlapping by 2 lines');
    await page.mouse.wheel(0, 100);
    await expect(bar.merge).toHaveAttribute('aria-valuetext', 'Merge boxes: Off');

    const typed = page.getByRole('spinbutton', { name: 'Merge distance in line heights' });
    const typedBox = (await typed.boundingBox())!;
    await page.mouse.move(typedBox.x + typedBox.width / 2, typedBox.y + typedBox.height / 2);
    await page.mouse.wheel(0, -100);
    await expect(typed).toHaveValue('-2');
    await page.mouse.wheel(0, -100);
    await expect(typed).toHaveValue('-1.75');
    // The field goes on past the slider's end, and comes back down to Off.
    await typed.fill('3');
    await page.mouse.wheel(0, -100);
    await expect(typed).toHaveValue('3.25');
    await expect(bar.merge).toHaveAttribute('aria-valuetext', 'Merge boxes: within 3.25 lines');
    await typed.fill('-2');
    await page.mouse.wheel(0, 100);
    await expect(typed).toHaveValue('');
    await expect(bar.merge).toHaveAttribute('aria-valuetext', 'Merge boxes: Off');
});

test('Esc closes an open dialog and leaves the preview as it is', async ({ page }) => {
    await openLabelsPage(page, 'Auto Occlude Dialog Doc');
    const bar = await openPreview(page);

    await page.locator('#btn-help').click();
    await expect(page.locator('#help-dialog')).toBeVisible();
    await page.keyboard.press('Escape');

    await expect(page.locator('#help-dialog')).not.toBeVisible();
    await expect(bar.slider).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(bar.slider).not.toBeVisible();
});

test('Esc and Cancel discard the preview and leave the page\'s occlusions as they were', async ({ page }) => {
    const docId = await openLabelsPage(page, 'Auto Occlude Cancel Doc');
    const imageRect = await imageOnScreenRect(page, LABELS_IMAGE_SIZE);
    await dragOnCanvas(page, { x: imageRect.left + 160, y: imageRect.top + 100 }, { x: imageRect.left + 200, y: imageRect.top + 140 });

    let bar = await openPreview(page);
    await page.keyboard.press('Escape');
    await expect(bar.slider).not.toBeVisible();
    bar = await openPreview(page);
    await bar.cancel.click();
    await expect(bar.slider).not.toBeVisible();

    expect(await savedShapes(page, docId)).toHaveLength(1);
});

test('a click or drag on the image during the preview changes nothing: it neither ends the preview nor draws a box', async ({ page }) => {
    const docId = await openLabelsPage(page, 'Auto Occlude Click Doc');
    const imageRect = await imageOnScreenRect(page, LABELS_IMAGE_SIZE);

    const bar = await openPreview(page);
    await dragOnCanvas(page, { x: imageRect.left + 160, y: imageRect.top + 100 }, { x: imageRect.left + 200, y: imageRect.top + 140 });
    await page.mouse.click(imageRect.left + 300, imageRect.top + 200);

    await expect(bar.slider).toBeVisible();
    await showAllBoxes(page, bar);
    await bar.apply.click();
    // Only the detected labels were added: the drag drew nothing.
    await expect.poll(async () => (await savedShapes(page, docId)).length).toBe(2);
});

test('clear occlusions asks, then removes every occlusion from the page', async ({ page }) => {
    const docId = await openLabelsPage(page, 'Clear Occlusions Doc');
    const clearButton = page.getByRole('button', { name: 'Clear occlusions' });
    await expect(clearButton).toBeDisabled();
    const imageRect = await imageOnScreenRect(page, LABELS_IMAGE_SIZE);
    await dragOnCanvas(page, { x: imageRect.left + 20, y: imageRect.top + 20 }, { x: imageRect.left + 80, y: imageRect.top + 60 });
    await dragOnCanvas(page, { x: imageRect.left + 160, y: imageRect.top + 100 }, { x: imageRect.left + 200, y: imageRect.top + 140 });

    await clearButton.click();
    await expect(page.locator('#confirm-dialog-message')).toHaveText('Remove all occlusions from this page?');
    await page.locator('#btn-confirm-delete').click();

    await expect(clearButton).toBeDisabled();
    expect(await savedShapes(page, docId)).toHaveLength(0);
});

test('a label written up the page is covered by a shape turned along it', async ({ page }) => {
    await page.goto('/');
    const docId = await createDocument(page, uniqueName('Auto Occlude Turned Doc'));
    await addPage(page);
    await assignActivePageImage(page, path.join(path.dirname(LABELS_IMAGE_PATH), 'label-vertical.png'));

    const bar = await openPreview(page);
    await showAllBoxes(page, bar);
    await bar.apply.click();

    await expect.poll(async () => (await savedShapes(page, docId)).length).toBe(1);
    const [shape] = (await savedShapes(page, docId)) as (Box & { rotation?: number })[];
    expect(Math.abs(Math.abs(shape.rotation ?? 0) - 90)).toBeLessThan(5);
    expect(shape.x + shape.width / 2).toBeCloseTo(73, -1);
    expect(shape.y + shape.height / 2).toBeCloseTo(157, -1);
    expect(shape.width).toBeGreaterThan(140);
});
