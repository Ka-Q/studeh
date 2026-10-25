import type { RotatedRect } from '@studeh/image-analysis';

interface Point {
    x: number;
    y: number;
}

// Boxes turned this much apart (degrees, as lines: 0 and 180 are the same) are no neighbours: a turned label is not a row of the upright ones.
const MAX_MERGED_ROTATION_DIFFERENCE_DEGREES = 15;

function cornersOf(box: RotatedRect): Point[] {
    const angle = ((box.rotation ?? 0) * Math.PI) / 180;
    const centerX = box.x + box.width / 2;
    const centerY = box.y + box.height / 2;
    return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sy]) => {
        const dx = (sx * box.width) / 2;
        const dy = (sy * box.height) / 2;
        return { x: centerX + dx * Math.cos(angle) - dy * Math.sin(angle), y: centerY + dx * Math.sin(angle) + dy * Math.cos(angle) };
    });
}

function projectionOf(corners: Point[], axis: Point): [number, number] {
    const values = corners.map((corner) => corner.x * axis.x + corner.y * axis.y);
    return [Math.min(...values), Math.max(...values)];
}

function distanceToSegment(point: Point, from: Point, to: Point): number {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const along = Math.max(0, Math.min(1, ((point.x - from.x) * dx + (point.y - from.y) * dy) / (dx * dx + dy * dy)));
    return Math.hypot(point.x - (from.x + along * dx), point.y - (from.y + along * dy));
}

function distanceBetween(a: Point[], b: Point[]): number {
    let nearest = Infinity;
    for (const [first, second] of [[a, b], [b, a]]) {
        for (const point of first) {
            for (let side = 0; side < 4; side++) {
                nearest = Math.min(nearest, distanceToSegment(point, second[side], second[(side + 1) % 4]));
            }
        }
    }
    return nearest;
}

// How far apart two boxes are, edge to edge, turned or not: the gap between them when they are apart (0 when they touch), and when
// they overlap, minus the least they would have to move to part (so overlapping by 2 is -2).
export function signedDistance(a: RotatedRect, b: RotatedRect): number {
    const cornersA = cornersOf(a);
    const cornersB = cornersOf(b);
    let leastOverlap = Infinity;
    for (const corners of [cornersA, cornersB]) {
        for (let side = 0; side < 2; side++) {
            const edge = { x: corners[side + 1].x - corners[side].x, y: corners[side + 1].y - corners[side].y };
            const length = Math.hypot(edge.x, edge.y);
            const axis = { x: -edge.y / length, y: edge.x / length };
            const [minA, maxA] = projectionOf(cornersA, axis);
            const [minB, maxB] = projectionOf(cornersB, axis);
            const overlap = Math.min(maxA, maxB) - Math.max(minA, minB);
            if (overlap <= 0) {
                return distanceBetween(cornersA, cornersB);
            }
            leastOverlap = Math.min(leastOverlap, overlap);
        }
    }
    return -leastOverlap;
}

// Which neighbours merge: any near ones, only those side by side (along a line), or only those one above the other.
export type MergeDirection = 'all' | 'horizontal' | 'vertical';

// Two boxes side by side or one above the other must share at least this much of the smaller one's extent across, or they are not in a
// line or a column at all (a long label and a short one just off its end).
const MIN_SHARED_EXTENT_RATIO = 0.5;

interface Extent {
    min: number;
    max: number;
}

// A box's extent along each of two perpendicular axes, the first turned by a degrees.
function extentsOf(box: RotatedRect, angle: number): { along: Extent; across: Extent } {
    const corners = cornersOf(box);
    const [minAlong, maxAlong] = projectionOf(corners, { x: Math.cos(angle), y: Math.sin(angle) });
    const [minAcross, maxAcross] = projectionOf(corners, { x: -Math.sin(angle), y: Math.cos(angle) });
    return { along: { min: minAlong, max: maxAlong }, across: { min: minAcross, max: maxAcross } };
}

function overlapOf(a: Extent, b: Extent): number {
    return Math.min(a.max, b.max) - Math.max(a.min, b.min);
}

// The distance between two boxes along one direction, in the frame of the first box (turned as it is): the gap between their extents along
// it, or minus their overlap there, when they share enough of their extent across it; otherwise Infinity.
export function directedDistance(a: RotatedRect, b: RotatedRect, direction: 'horizontal' | 'vertical'): number {
    const angle = ((a.rotation ?? 0) * Math.PI) / 180;
    const extentsA = extentsOf(a, angle);
    const extentsB = extentsOf(b, angle);
    const [alongA, alongB, acrossA, acrossB] = direction === 'horizontal'
        ? [extentsA.along, extentsB.along, extentsA.across, extentsB.across]
        : [extentsA.across, extentsB.across, extentsA.along, extentsB.along];
    const shared = overlapOf(acrossA, acrossB);
    if (shared < MIN_SHARED_EXTENT_RATIO * Math.min(acrossA.max - acrossA.min, acrossB.max - acrossB.min)) {
        return Infinity;
    }
    return -overlapOf(alongA, alongB);
}

function isParallel(a: RotatedRect, b: RotatedRect): boolean {
    const difference = Math.abs(((a.rotation ?? 0) - (b.rotation ?? 0)) % 180);
    return Math.min(difference, 180 - difference) <= MAX_MERGED_ROTATION_DIFFERENCE_DEGREES;
}

// The smallest box, turned as the group's largest box is, that holds every box of the group.
function boundingBoxOf(group: RotatedRect[]): RotatedRect {
    const largest = group.reduce((best, box) => (box.width * box.height > best.width * best.height ? box : best));
    const rotation = largest.rotation ?? 0;
    const angle = (rotation * Math.PI) / 180;
    const along = { x: Math.cos(angle), y: Math.sin(angle) };
    const across = { x: -Math.sin(angle), y: Math.cos(angle) };
    const corners = group.flatMap(cornersOf);
    const [minAlong, maxAlong] = projectionOf(corners, along);
    const [minAcross, maxAcross] = projectionOf(corners, across);
    const centerAlong = (minAlong + maxAlong) / 2;
    const centerAcross = (minAcross + maxAcross) / 2;
    const width = maxAlong - minAlong;
    const height = maxAcross - minAcross;
    const centerX = centerAlong * along.x + centerAcross * across.x;
    const centerY = centerAlong * along.y + centerAcross * across.y;
    const box = { x: centerX - width / 2, y: centerY - height / 2, width, height };
    return rotation === 0 ? box : { ...box, rotation };
}

// A box and how many of the boxes given it is made of (1 for one left as it was).
export interface MergedBox {
    box: RotatedRect;
    count: number;
}

// Boxes no further apart than the distance (see signedDistance, so a negative one only joins boxes overlapping by that much) become
// one, chains of them too, as long as they are turned alike; in one direction only, only boxes side by side or one above the other (in
// the first one's own frame). A box left alone is returned as it is.
export function mergeNearbyBoxes(boxes: readonly RotatedRect[], distance: number, direction: MergeDirection = 'all'): MergedBox[] {
    const parent = boxes.map((_, index) => index);
    function rootOf(index: number): number {
        while (parent[index] !== index) {
            parent[index] = parent[parent[index]];
            index = parent[index];
        }
        return index;
    }
    // Each box's enclosing circle: boxes whose circles are further apart than the distance (and apart at all) are too far for the exact,
    // dearer test, which makes a page with hundreds of boxes quick to merge.
    const circles = boxes.map((box) => ({ x: box.x + box.width / 2, y: box.y + box.height / 2, radius: Math.hypot(box.width, box.height) / 2 }));
    const distanceBetweenBoxes = (a: RotatedRect, b: RotatedRect) => (direction === 'all' ? signedDistance(a, b) : directedDistance(a, b, direction));
    function isNear(a: number, b: number): boolean {
        const gap = Math.hypot(circles[a].x - circles[b].x, circles[a].y - circles[b].y) - circles[a].radius - circles[b].radius;
        return gap <= Math.max(distance, 0);
    }
    for (let a = 0; a < boxes.length; a++) {
        for (let b = a + 1; b < boxes.length; b++) {
            if (rootOf(a) !== rootOf(b) && isNear(a, b) && isParallel(boxes[a], boxes[b]) && distanceBetweenBoxes(boxes[a], boxes[b]) <= distance) {
                parent[rootOf(b)] = rootOf(a);
            }
        }
    }
    const groups = new Map<number, RotatedRect[]>();
    boxes.forEach((box, index) => {
        const root = rootOf(index);
        groups.set(root, [...(groups.get(root) ?? []), box]);
    });
    return [...groups.values()].map((group) => ({ box: group.length === 1 ? group[0] : boundingBoxOf(group), count: group.length }));
}

// How thick the boxes usually are (the median of their short sides): the unit a merge distance is measured in, so the same setting
// means the same on a small image and a large one.
export function typicalThickness(boxes: readonly RotatedRect[]): number {
    const thicknesses = boxes.map((box) => Math.min(box.width, box.height)).sort((a, b) => a - b);
    return thicknesses[thicknesses.length >> 1] ?? 0;
}
