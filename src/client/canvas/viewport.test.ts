import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fitViewport } from './viewport';

test('fitViewport centers and scales a smaller canvas down to fit', function () {
    const viewport = fitViewport({ width: 200, height: 100 }, { width: 100, height: 100 });

    assert.equal(viewport.zoom, 0.5);
    assert.equal(viewport.panX, 0);
    assert.equal(viewport.panY, 25);
});

test('fitViewport never scales an image up past 1', function () {
    const viewport = fitViewport({ width: 50, height: 50 }, { width: 200, height: 200 });

    assert.equal(viewport.zoom, 1);
});
