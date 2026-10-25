import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mergeNearbyBoxes, signedDistance, typicalThickness } from './boxMerge';

test('boxes apart are as far as the gap between their edges, touching ones 0, overlapping ones minus the overlap', function () {
    assert.equal(signedDistance({ x: 0, y: 0, width: 10, height: 10 }, { x: 13, y: 0, width: 10, height: 10 }), 3);
    assert.equal(signedDistance({ x: 0, y: 0, width: 10, height: 10 }, { x: 10, y: 0, width: 10, height: 10 }), 0);
    assert.equal(signedDistance({ x: 0, y: 0, width: 10, height: 10 }, { x: 8, y: 0, width: 10, height: 10 }), -2);
    assert.equal(signedDistance({ x: 0, y: 0, width: 10, height: 10 }, { x: 8, y: 7, width: 10, height: 10 }), -2);
    assert.equal(Math.round(signedDistance({ x: 0, y: 0, width: 10, height: 10 }, { x: 13, y: 14, width: 10, height: 10 })), 5);
});

test('turned boxes are measured along their own edges', function () {
    // A bar turned a quarter turn about its centre is the same box as an upright one.
    const upright = { x: 0, y: 0, width: 10, height: 40 };
    const turned = { x: 12 + 15 - 20 + 0, y: 12 + 30 - 5, width: 40, height: 10, rotation: 90 };
    assert.ok(Math.abs(signedDistance({ x: 0, y: 0, width: 10, height: 10 }, { ...upright, x: 15 }) - 5) < 1e-9);
    assert.ok(Number.isFinite(signedDistance(upright, turned)));
    const slanted = { x: 100, y: 100, width: 100, height: 10, rotation: 45 };
    assert.ok(signedDistance(slanted, { x: 100, y: 100, width: 100, height: 10, rotation: 45 }) < 0);
    assert.ok(signedDistance(slanted, { x: 400, y: 400, width: 10, height: 10 }) > 100);
});

test('boxes within the distance become one, as a chain too; boxes further apart stay', function () {
    const boxes = [{ x: 0, y: 0, width: 10, height: 10 }, { x: 12, y: 0, width: 10, height: 10 }, { x: 24, y: 0, width: 10, height: 10 }, { x: 60, y: 0, width: 10, height: 10 }];

    assert.deepEqual(mergeNearbyBoxes(boxes, 2), [{ box: { x: 0, y: 0, width: 34, height: 10 }, count: 3 }, { box: boxes[3], count: 1 }]);
    assert.deepEqual(mergeNearbyBoxes(boxes, 1), boxes.map((box) => ({ box, count: 1 })));
});

test('a negative distance joins only boxes overlapping by that much', function () {
    const boxes = [{ x: 0, y: 0, width: 10, height: 10 }, { x: 8, y: 0, width: 10, height: 10 }, { x: 40, y: 0, width: 10, height: 10 }, { x: 49, y: 0, width: 10, height: 10 }];

    assert.deepEqual(mergeNearbyBoxes(boxes, -2), [{ box: { x: 0, y: 0, width: 18, height: 10 }, count: 2 }, { box: boxes[2], count: 1 }, { box: boxes[3], count: 1 }]);
    assert.deepEqual(mergeNearbyBoxes(boxes, -1), [{ box: { x: 0, y: 0, width: 18, height: 10 }, count: 2 }, { box: { x: 40, y: 0, width: 19, height: 10 }, count: 2 }]);
    assert.deepEqual(mergeNearbyBoxes(boxes, -3), boxes.map((box) => ({ box, count: 1 })));
});

test('turned boxes merge into a box turned as the largest one, and a box turned another way is left alone', function () {
    const a = { x: 100, y: 100, width: 100, height: 20, rotation: 30 };
    const angle = (30 * Math.PI) / 180;
    // The second box one box-height further along the turned boxes' own "down".
    const shift = { x: -Math.sin(angle) * 22, y: Math.cos(angle) * 22 };
    const b = { x: a.x + shift.x, y: a.y + shift.y, width: 100, height: 20, rotation: 30 };
    const across = { x: 100, y: 100, width: 100, height: 20, rotation: 120 };

    const merged = mergeNearbyBoxes([a, b, across], 3);

    assert.equal(merged.length, 2);
    assert.equal(merged[0].box.rotation, 30);
    assert.equal(merged[0].count, 2);
    assert.ok(Math.abs(merged[0].box.width - 100) < 1e-6 && Math.abs(merged[0].box.height - 42) < 1e-6);
    assert.deepEqual(merged[1], { box: across, count: 1 });
});

test('the typical thickness is the median short side', function () {
    assert.equal(typicalThickness([{ x: 0, y: 0, width: 50, height: 10 }, { x: 0, y: 0, width: 8, height: 30 }, { x: 0, y: 0, width: 100, height: 14, rotation: 5 }]), 10);
    assert.equal(typicalThickness([]), 0);
});

test('merging gives the same groups as testing every pair exactly, for boxes upright and turned at many distances', function () {
    let seed = 7;
    const random = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
    const boxes = Array.from({ length: 80 }, () => ({ x: random() * 400, y: random() * 300, width: 20 + random() * 80, height: 6 + random() * 14, rotation: random() < 0.2 ? 90 * Math.floor(random() * 3) + random() * 8 : 0 }));
    const exact = (distance: number) => {
        const parent = boxes.map((_, index) => index);
        const rootOf = (index: number): number => (parent[index] === index ? index : (parent[index] = rootOf(parent[index])));
        for (let a = 0; a < boxes.length; a++) {
            for (let b = a + 1; b < boxes.length; b++) {
                const turn = Math.abs(((boxes[a].rotation ?? 0) - (boxes[b].rotation ?? 0)) % 180);
                if (Math.min(turn, 180 - turn) <= 15 && signedDistance(boxes[a], boxes[b]) <= distance) {
                    parent[rootOf(b)] = rootOf(a);
                }
            }
        }
        return new Set(boxes.map((_, index) => rootOf(index))).size;
    };

    for (const distance of [-6, -1, 0, 3, 12, 40]) {
        assert.equal(mergeNearbyBoxes(boxes, distance).length, exact(distance), `distance ${distance}`);
    }
});
