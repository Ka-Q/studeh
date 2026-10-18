import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
    boundingRect,
    clampMoveToBounds,
    clampRectToBounds,
    hitTestRectangle,
    moveRect,
    offsetCopyRect,
    rectFromPoints,
    rectCorners,
    resizeRect,
    rotatedHandleDirection,
    rotationTowards,
    shapesInReadingOrder,
    topmostShapeAt,
    type Rect
} from './rectangle';
import type { RectangleShape } from '../../shared/types';

test('rectFromPoints normalizes all four drag directions to the same rect', function () {
    const topLeft = { x: 10, y: 20 };
    const bottomRight = { x: 50, y: 60 };

    const downRight = rectFromPoints(topLeft, bottomRight);
    const downLeft = rectFromPoints(bottomRight, topLeft);
    const upRight = rectFromPoints({ x: 10, y: 60 }, { x: 50, y: 20 });
    const upLeft = rectFromPoints({ x: 50, y: 20 }, { x: 10, y: 60 });

    for (const rect of [downRight, downLeft, upRight, upLeft]) {
        assert.deepEqual(rect, { x: 10, y: 20, width: 40, height: 40 });
    }
});

test('clampRectToBounds clamps each out-of-bounds edge independently', function () {
    const bounds = { width: 100, height: 100 };

    assert.deepEqual(clampRectToBounds({ x: -10, y: 20, width: 30, height: 30 }, bounds), { x: 0, y: 20, width: 20, height: 30 });
    assert.deepEqual(clampRectToBounds({ x: 90, y: 20, width: 30, height: 30 }, bounds), { x: 90, y: 20, width: 10, height: 30 });
    assert.deepEqual(clampRectToBounds({ x: 20, y: -10, width: 30, height: 30 }, bounds), { x: 20, y: 0, width: 30, height: 20 });
    assert.deepEqual(clampRectToBounds({ x: 20, y: 90, width: 30, height: 30 }, bounds), { x: 20, y: 90, width: 30, height: 10 });
    assert.deepEqual(clampRectToBounds({ x: -10, y: -10, width: 130, height: 130 }, bounds), { x: 0, y: 0, width: 100, height: 100 });
    assert.deepEqual(clampRectToBounds({ x: 20, y: 20, width: 30, height: 30 }, bounds), { x: 20, y: 20, width: 30, height: 30 });
});

test('topmostShapeAt resolves the last shape in array order on overlap', function () {
    const bottom: RectangleShape = { id: 'shape-1', type: 'rectangle', x: 0, y: 0, width: 100, height: 100, visible: false };
    const top: RectangleShape = { id: 'shape-2', type: 'rectangle', x: 50, y: 50, width: 100, height: 100, visible: false };

    const hit = topmostShapeAt({ x: 75, y: 75 }, [bottom, top]);

    assert.equal(hit?.id, 'shape-2');
});

test('hitTestRectangle is inclusive of the shape bounds', function () {
    const shape: RectangleShape = { id: 'shape-1', type: 'rectangle', x: 10, y: 10, width: 20, height: 20, visible: false };

    assert.equal(hitTestRectangle({ x: 10, y: 10 }, shape), true);
    assert.equal(hitTestRectangle({ x: 30, y: 30 }, shape), true);
    assert.equal(hitTestRectangle({ x: 9, y: 15 }, shape), false);
    assert.equal(hitTestRectangle({ x: 15, y: 31 }, shape), false);
});

test('moveRect preserves size while clampMoveToBounds clamps translation to image bounds', function () {
    const rect = { x: 80, y: 80, width: 30, height: 30 };
    const bounds = { width: 100, height: 100 };

    const moved = moveRect(rect, 50, 50);
    assert.deepEqual(moved, { x: 130, y: 130, width: 30, height: 30 });

    const clamped = clampMoveToBounds(moved, bounds);
    assert.deepEqual(clamped, { x: 70, y: 70, width: 30, height: 30 });
});

test('offsetCopyRect shifts down-right, or up/left on an axis where the copy would leave the image', function () {
    const bounds = { width: 100, height: 100 };

    assert.deepEqual(offsetCopyRect({ x: 10, y: 10, width: 30, height: 30 }, 5, bounds), { x: 15, y: 15, width: 30, height: 30 });
    assert.deepEqual(offsetCopyRect({ x: 70, y: 10, width: 30, height: 30 }, 5, bounds), { x: 65, y: 15, width: 30, height: 30 });
    assert.deepEqual(offsetCopyRect({ x: 70, y: 70, width: 30, height: 30 }, 5, bounds), { x: 65, y: 65, width: 30, height: 30 });
    assert.deepEqual(offsetCopyRect({ x: 0, y: 0, width: 100, height: 100 }, 5, bounds), { x: 0, y: 0, width: 100, height: 100 });
});

test('resizeRect normalizes negative dimensions when a handle is dragged past the opposite edge', function () {
    const rect = { x: 20, y: 20, width: 40, height: 40 };

    const resized = resizeRect(rect, 'se', -80, -80);

    assert.equal(resized.width > 0, true);
    assert.equal(resized.height > 0, true);
    assert.deepEqual(resized, { x: -20, y: -20, width: 40, height: 40 });
});

function assertPointClose(actual: { x: number; y: number }, expected: { x: number; y: number }): void {
    assert.ok(Math.hypot(actual.x - expected.x, actual.y - expected.y) < 1e-9, `${JSON.stringify(actual)} is not ${JSON.stringify(expected)}`);
}

test('hitTestRectangle tests a rotated shape in its own frame', function () {
    const shape: RectangleShape = { id: 'shape-1', type: 'rectangle', x: 0, y: 40, width: 100, height: 20, visible: false, rotation: 90 };

    assert.equal(hitTestRectangle({ x: 50, y: 5 }, shape), true);
    assert.equal(hitTestRectangle({ x: 5, y: 50 }, shape), false);
});

test('boundingRect of a quarter-turned rect swaps its sides about its centre', function () {
    const box = boundingRect({ x: 0, y: 40, width: 100, height: 20, rotation: 90 });

    assertPointClose({ x: box.x, y: box.y }, { x: 40, y: 0 });
    assertPointClose({ x: box.width, y: box.height }, { x: 20, y: 100 });
});

test('clampMoveToBounds keeps a rotated rect\'s bounding box inside the bounds', function () {
    const clamped = clampMoveToBounds({ x: -10, y: 40, width: 100, height: 20, rotation: 90 }, { width: 200, height: 200 });

    assert.ok(Math.abs(boundingRect(clamped).y) < 1e-9);
    assert.equal(clamped.rotation, 90);
});

test('offsetCopyRect keeps the rotation', function () {
    assert.deepEqual(offsetCopyRect({ x: 10, y: 10, width: 30, height: 30, rotation: 30 }, 5, { width: 100, height: 100 }).rotation, 30);
});

test('resizeRect on a rotated rect resizes in its own frame, keeping the opposite corner in place on the page', function () {
    const original = { x: 20, y: 20, width: 40, height: 20, rotation: 30 };
    // 10 along the rect's own x axis, 5 along its y axis, given in page coordinates.
    const radians = 30 * Math.PI / 180;
    const dx = 10 * Math.cos(radians) - 5 * Math.sin(radians);
    const dy = 10 * Math.sin(radians) + 5 * Math.cos(radians);

    const resized = resizeRect(original, 'se', dx, dy);

    assertPointClose({ x: resized.width, y: resized.height }, { x: 50, y: 25 });
    assert.equal(resized.rotation, 30);
    assertPointClose(rectCorners(resized)[0], rectCorners(original)[0]);
});

test('rotationTowards turns the rect\'s top towards the point, snapping to the step when given', function () {
    const center = { x: 0, y: 0 };

    assert.equal(rotationTowards(center, { x: 0, y: -10 }), 0);
    assert.equal(rotationTowards(center, { x: 10, y: 0 }), 90);
    assert.equal(rotationTowards(center, { x: -10, y: 0 }), 270);
    assert.equal(rotationTowards(center, { x: 10, y: -8 }, 45), 45);
    assert.equal(rotationTowards(center, { x: -1, y: -10 }, 45), 0);
});

test('rotatedHandleDirection gives the page direction a handle points in once rotated', function () {
    assert.equal(rotatedHandleDirection('n', 90), 'e');
    assert.equal(rotatedHandleDirection('nw', 0), 'nw');
    assert.equal(rotatedHandleDirection('w', 50), 'nw');
    assert.equal(rotatedHandleDirection('n', 315), 'nw');
});

function rect(x: number, y: number, width: number, height: number): Rect {
    return { x, y, width, height };
}

test('shapesInReadingOrder keeps a slightly higher shape to the right in the same row, after its left neighbour', function () {
    const left = rect(20, 20, 70, 40);
    const right = rect(120, 15, 80, 55);

    assert.deepEqual(shapesInReadingOrder([right, left]), [left, right]);
});

test('shapesInReadingOrder reads a jittered grid row by row, left to right', function () {
    const topLeft = rect(0, 4, 50, 40);
    const topRight = rect(100, 0, 50, 40);
    const bottomLeft = rect(0, 100, 50, 40);
    const bottomRight = rect(100, 96, 50, 40);

    assert.deepEqual(shapesInReadingOrder([bottomRight, topRight, bottomLeft, topLeft]), [topLeft, topRight, bottomLeft, bottomRight]);
});

test('shapesInReadingOrder splits shapes overlapping by less than half the shorter height into separate rows', function () {
    const first = rect(100, 0, 50, 40);
    const second = rect(50, 25, 50, 40);
    const third = rect(0, 50, 50, 40);

    assert.deepEqual(shapesInReadingOrder([third, second, first]), [first, second, third]);
});

test('shapesInReadingOrder keeps a gently slanted row together, left to right', function () {
    const first = rect(5, 208, 150, 17);
    const second = rect(165, 207, 150, 15);
    const third = rect(326, 207, 150, 15);
    const fourth = rect(499, 203, 150, 16);
    const fifth = rect(675, 196, 150, 18);

    assert.deepEqual(shapesInReadingOrder([fifth, fourth, third, second, first]), [first, second, third, fourth, fifth]);
});

test('shapesInReadingOrder reads shapes stacked beside a tall one top to bottom, even when the lower starts further left', function () {
    const tall = rect(0, 0, 20, 100);
    const upper = rect(32, 0, 20, 20);
    const lower = rect(30, 30, 20, 20);

    assert.deepEqual(shapesInReadingOrder([lower, upper, tall]), [tall, upper, lower]);
});
