import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { RotatedRect } from '@studeh/image-analysis';
import { createAutoOcclusionController, MIN_LETTERS_RANGE, type AutoOcclusionTarget } from './autoOcclusionController';

const TARGET: AutoOcclusionTarget = { documentId: 'doc-1', pageId: 'page-1', imageFile: 'a.png', imageUrl: 'http://x/a.png', shapes: [] };

// Two label boxes one under the other, 2 apart, and a third far away.
const BOXES: RotatedRect[] = [{ x: 0, y: 0, width: 100, height: 10 }, { x: 0, y: 12, width: 100, height: 10 }, { x: 500, y: 500, width: 100, height: 10 }];

function setup(options: { valid?: () => boolean } = {}) {
    const asked: { minLetters: number; answer: (boxes: RotatedRect[]) => void }[] = [];
    const applied: { pageId: string; boxes: RotatedRect[] }[] = [];
    const counts = { change: 0, boxes: 0 };
    const controller = createAutoOcclusionController({
        findBoxes: (_url, minLetters, onFound) => asked.push({ minLetters, answer: onFound }),
        applyBoxes: (pageId, boxes) => applied.push({ pageId, boxes }),
        isStillValid: options.valid ?? (() => true),
        onChange: () => counts.change++,
        onBoxesChange: () => counts.boxes++
    });
    return { controller, asked, applied, counts };
}

test('detection asks for the longest labels first, and opens a preview with the answer', function () {
    const { controller, asked, counts } = setup();

    controller.start(TARGET);
    assert.equal(controller.isDetecting('page-1'), true);
    assert.equal(controller.preview(), null);
    assert.equal(asked[0].minLetters, MIN_LETTERS_RANGE.max);
    asked[0].answer(BOXES);

    assert.equal(controller.isDetecting('page-1'), false);
    assert.deepEqual(controller.preview()?.boxes, BOXES);
    assert.equal(controller.preview()?.merge, null);
    assert.equal(counts.change, 2);
});

test('detection does not start twice, nor while a preview is open', function () {
    const { controller, asked } = setup();

    controller.start(TARGET);
    controller.start(TARGET);
    asked[0].answer(BOXES);
    controller.start(TARGET);

    assert.equal(asked.length, 1);
});

test('an answer for a page that is no longer shown opens no preview', function () {
    let valid = true;
    const { controller, asked } = setup({ valid: () => valid });

    controller.start(TARGET);
    valid = false;
    asked[0].answer(BOXES);

    assert.equal(controller.preview(), null);
    assert.equal(controller.isDetecting('page-1'), false);
});

test('moving the length asks again, and a late answer to an earlier length never replaces a later one', function () {
    const { controller, asked, counts } = setup();
    controller.start(TARGET);
    asked[0].answer([BOXES[0]]);

    controller.setMinLetters(10);
    controller.setMinLetters(4);
    asked[2].answer(BOXES);
    asked[1].answer([BOXES[2]]);

    assert.deepEqual(asked.slice(1).map((request) => request.minLetters), [10, 4]);
    assert.deepEqual(controller.preview()?.boxes, BOXES);
    assert.equal(controller.preview()?.minLetters, 4);
    assert.equal(counts.boxes, 1);
});

test('merging joins the boxes within the distance, in line heights, and switching it off shows the found boxes again', function () {
    const { controller, asked } = setup();
    controller.start(TARGET);
    asked[0].answer(BOXES);

    controller.setMerge(0.5);
    assert.deepEqual(controller.preview()?.boxes, [{ x: 0, y: 0, width: 100, height: 22 }, BOXES[2]]);
    assert.deepEqual(controller.preview()?.groupSizes, [2, 1]);
    controller.setMerge(0.1);
    assert.deepEqual(controller.preview()?.boxes, BOXES);
    controller.setMerge(null);
    assert.deepEqual(controller.preview()?.boxes, BOXES);
    assert.deepEqual(controller.preview()?.groupSizes, [1, 1, 1]);
});

test('the merge direction limits what is merged, and is kept as the distance moves', function () {
    const side = [{ x: 0, y: 0, width: 100, height: 10 }, { x: 102, y: 0, width: 100, height: 10 }, { x: 0, y: 12, width: 100, height: 10 }];
    const { controller, asked } = setup();
    controller.start(TARGET);
    asked[0].answer(side);

    controller.setMerge(0.5);
    assert.deepEqual(controller.preview()?.groupSizes, [3]);
    controller.setMergeDirection('horizontal');
    assert.deepEqual(controller.preview()?.groupSizes, [2, 1]);
    controller.setMerge(0.1);
    assert.deepEqual(controller.preview()?.groupSizes, [1, 1, 1]);
    controller.setMerge(0.5);
    controller.setMergeDirection('vertical');
    assert.deepEqual(controller.preview()?.groupSizes, [2, 1]);
    assert.equal(controller.preview()?.mergeDirection, 'vertical');
});

test('merging is kept when the length changes: the new boxes are merged too', function () {
    const { controller, asked } = setup();
    controller.start(TARGET);
    asked[0].answer([BOXES[2]]);
    controller.setMerge(0.5);

    controller.setMinLetters(3);
    asked[1].answer(BOXES);

    assert.deepEqual(controller.preview()?.boxes, [{ x: 0, y: 0, width: 100, height: 22 }, BOXES[2]]);
});

test('apply hands the shown boxes to the page and closes the preview; an answer arriving after is ignored', function () {
    const { controller, asked, applied } = setup();
    controller.start(TARGET);
    asked[0].answer(BOXES);
    controller.setMinLetters(3);
    controller.setMerge(0.5);

    controller.apply();
    asked[1].answer([BOXES[0]]);

    assert.deepEqual(applied, [{ pageId: 'page-1', boxes: [{ x: 0, y: 0, width: 100, height: 22 }, BOXES[2]] }]);
    assert.equal(controller.preview(), null);
});

test('cancel closes the preview without applying anything', function () {
    const { controller, asked, applied, counts } = setup();
    controller.start(TARGET);
    asked[0].answer(BOXES);
    const changes = counts.change;

    controller.cancel();
    controller.cancel();

    assert.equal(controller.preview(), null);
    assert.deepEqual(applied, []);
    assert.equal(counts.change, changes + 1);
});

test('a preview that is no longer valid ends without a redraw', function () {
    let valid = true;
    const { controller, asked, counts } = setup({ valid: () => valid });
    controller.start(TARGET);
    asked[0].answer(BOXES);
    const changes = counts.change;

    assert.equal(controller.endIfInvalid(), false);
    valid = false;
    assert.equal(controller.endIfInvalid(), true);

    assert.equal(controller.preview(), null);
    assert.equal(counts.change, changes);
});
