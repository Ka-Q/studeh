import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
    clampMoveToBounds,
    clampRectToBounds,
    hitTestRectangle,
    moveRect,
    rectFromPoints,
    resizeRect,
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

test('resizeRect normalizes negative dimensions when a handle is dragged past the opposite edge', function () {
    const rect = { x: 20, y: 20, width: 40, height: 40 };

    const resized = resizeRect(rect, 'se', -80, -80);

    assert.equal(resized.width > 0, true);
    assert.equal(resized.height > 0, true);
    assert.deepEqual(resized, { x: -20, y: -20, width: 40, height: 40 });
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
