import assert from 'node:assert/strict';
import { test } from 'node:test';
import { canvasToImage, fitViewport, imageToCanvas, zoomAtCanvasPoint } from './viewport';

test('fitViewport centers and scales a smaller canvas down to fit', function () {
    const viewport = fitViewport({ width: 200, height: 100 }, { width: 100, height: 100 });

    assert.equal(viewport.zoom, 0.5);
    assert.equal(viewport.panX, 0);
    assert.equal(viewport.panY, 25);
});

test('fitViewport never scales an image up past 1 and centers it with letterboxing', function () {
    const viewport = fitViewport({ width: 50, height: 50 }, { width: 200, height: 200 });

    assert.equal(viewport.zoom, 1);
    assert.equal(viewport.panX, 75);
    assert.equal(viewport.panY, 75);
});

test('imageToCanvas and canvasToImage are inverse transforms', function () {
    const viewport = { zoom: 1.75, panX: 12, panY: -34 };
    const original = { x: 123.4, y: -56.7 };

    const canvasPoint = imageToCanvas(viewport, original);
    const roundTripped = canvasToImage(viewport, canvasPoint);

    assert.ok(Math.abs(roundTripped.x - original.x) < 1e-9);
    assert.ok(Math.abs(roundTripped.y - original.y) < 1e-9);
});

test('zoomAtCanvasPoint keeps the image point under the cursor fixed', function () {
    const viewport = { zoom: 1, panX: 10, panY: 20 };
    const canvasPoint = { x: 150, y: 80 };
    const imagePointBefore = canvasToImage(viewport, canvasPoint);

    const zoomed = zoomAtCanvasPoint(viewport, canvasPoint, 2);
    const imagePointAfter = canvasToImage(zoomed, canvasPoint);

    assert.notEqual(zoomed.zoom, viewport.zoom);
    assert.ok(Math.abs(imagePointAfter.x - imagePointBefore.x) < 1e-9);
    assert.ok(Math.abs(imagePointAfter.y - imagePointBefore.y) < 1e-9);
});
