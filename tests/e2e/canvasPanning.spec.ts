import { test, expect } from '@playwright/test';
import { addPage, assignActivePageImage, createDocument, dragOnCanvas, fetchManifest, getCanvas, imageOnScreenRect, saveDocument, uniqueName } from './helpers';

test('releasing the pan modifier away from the window does not leave the cursor stuck on grab', async ({ page }) => {
    await page.goto('/');
    await createDocument(page, uniqueName('Pan Modifier Doc'));
    await addPage(page);
    await assignActivePageImage(page);
    const imageRect = await imageOnScreenRect(page);
    const canvas = getCanvas(page);

    await page.keyboard.down('Shift');
    await page.mouse.move(imageRect.left + 100, imageRect.top + 80);
    await expect(canvas).toHaveCSS('cursor', 'grab');

    await page.evaluate(function blurWindow() {
        window.dispatchEvent(new Event('blur'));
    });

    // The blur handler alone must reset the cursor: check before releasing the key,
    // since a trailing keyboard.up('Shift') would independently reset it too and
    // mask a broken blur handler.
    await expect(canvas).not.toHaveCSS('cursor', 'grab');

    // Release the (already-blurred) key for realism; the cursor must stay put.
    await page.keyboard.up('Shift');
    await page.mouse.move(imageRect.left + 110, imageRect.top + 90, { steps: 3 });
    await expect(canvas).not.toHaveCSS('cursor', 'grab');
});

test('arrow keys pan the view a step, as scrolling would', async ({ page }) => {
    await page.goto('/');
    const docId = await createDocument(page, uniqueName('Keyboard Pan Doc'));
    await addPage(page);
    await assignActivePageImage(page);
    const imageRect = await imageOnScreenRect(page);
    const canvasBox = (await getCanvas(page).boundingBox())!;
    const step = canvasBox.width * 0.1;

    await dragOnCanvas(page, { x: imageRect.left + 100, y: imageRect.top + 60 }, { x: imageRect.left + 140, y: imageRect.top + 100 });
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowUp');
    // Panned right, the shape now sits a step to the left of where it was drawn.
    await page.mouse.click(imageRect.left + 120 - step, imageRect.top + 80);
    await page.keyboard.press('Delete');

    await saveDocument(page);
    const manifest = await fetchManifest(page, docId);
    expect(manifest.pages[0].shapes).toHaveLength(0);
});

test('a pan pad arrow pans a step per click, anywhere in its quarter of the pad', async ({ page }) => {
    await page.goto('/');
    const docId = await createDocument(page, uniqueName('Pan Pad Doc'));
    await addPage(page);
    await assignActivePageImage(page);
    const imageRect = await imageOnScreenRect(page);
    const step = (await getCanvas(page).boundingBox())!.width * 0.1;

    await dragOnCanvas(page, { x: imageRect.left + 100, y: imageRect.top + 60 }, { x: imageRect.left + 140, y: imageRect.top + 100 });
    // Off the arrow icon, up in the right quarter.
    const padBox = (await page.locator('.canvas-pan').boundingBox())!;
    await page.getByRole('button', { name: /^Pan right/ }).click({ position: { x: padBox.width * 0.8, y: padBox.height * 0.35 } });
    await page.mouse.click(imageRect.left + 120 - step, imageRect.top + 80);
    await page.keyboard.press('Delete');

    await saveDocument(page);
    const manifest = await fetchManifest(page, docId);
    expect(manifest.pages[0].shapes).toHaveLength(0);
});

test('the pan pad knob is a joystick: held pushed right, the view keeps panning right', async ({ page }) => {
    await page.goto('/');
    await createDocument(page, uniqueName('Pan Joystick Doc'));
    await addPage(page);
    await assignActivePageImage(page);
    const imageRect = await imageOnScreenRect(page);
    const canvasBox = (await getCanvas(page).boundingBox())!;
    const probe = { x: imageRect.left + imageRect.width - 3 - canvasBox.x, y: imageRect.top + imageRect.height / 2 - canvasBox.y };
    const isImageAtProbe = () => getCanvas(page).evaluate(function readProbe(canvas, point) {
        const ratio = window.devicePixelRatio || 1;
        const pixel = (canvas as HTMLCanvasElement).getContext('2d')!.getImageData(point.x * ratio, point.y * ratio, 1, 1).data;
        // The sample image is a solid blue; outside it the canvas is clear or the faint edit-mode hatch.
        return pixel[3] === 255 && pixel[2] > pixel[0] + 60;
    }, probe);
    expect(await isImageAtProbe()).toBe(true);

    const knob = (await page.locator('.canvas-pan-knob').boundingBox())!;
    const grab = { x: knob.x + knob.width / 2, y: knob.y + knob.height / 2 };
    await page.mouse.move(grab.x, grab.y);
    await page.mouse.down();
    // A short push, well inside the screen, is enough: the view keeps panning while it is held.
    await page.mouse.move(grab.x + 20, grab.y, { steps: 2 });
    await page.waitForTimeout(300);
    await page.mouse.up();

    // Panned right, the image has slid left, off the point just inside its right edge.
    expect(await isImageAtProbe()).toBe(false);
});
