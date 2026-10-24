import type { Point, Size } from '../canvas/viewport';
import type { RectangleShape } from '../../shared/types';

// Two shapes read as one row when their vertical overlap covers at least this share of the shorter one's height.
const MIN_BAND_OVERLAP_RATIO = 0.5;

export interface Rect {
    x: number;
    y: number;
    width: number;
    height: number;
}

// Degrees clockwise about the rect's centre; absent means 0.
export type RotatedRect = Rect & { rotation?: number };

const FULL_TURN_DEGREES = 360;

export function rectFromPoints(a: Point, b: Point): Rect {
    return {
        x: Math.min(a.x, b.x),
        y: Math.min(a.y, b.y),
        width: Math.abs(a.x - b.x),
        height: Math.abs(a.y - b.y)
    };
}

export function clampRectToBounds(rect: Rect, bounds: Size): Rect {
    const left = clamp(rect.x, 0, bounds.width);
    const top = clamp(rect.y, 0, bounds.height);
    const right = clamp(rect.x + rect.width, 0, bounds.width);
    const bottom = clamp(rect.y + rect.height, 0, bounds.height);
    return { x: left, y: top, width: right - left, height: bottom - top };
}

export function isRectEmpty(rect: Rect): boolean {
    return rect.width <= 0 || rect.height <= 0;
}

export function rectsEqual(a: RotatedRect, b: RotatedRect): boolean {
    return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height && rotationOf(a) === rotationOf(b);
}

export function rotationOf(rect: RotatedRect): number {
    return rect.rotation ?? 0;
}

export function rectCenter(rect: Rect): Point {
    return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
}

export function rotatePoint(point: Point, center: Point, degrees: number): Point {
    if (!degrees) {
        return point;
    }
    const radians = degrees * Math.PI / 180;
    const cos = Math.cos(radians);
    const sin = Math.sin(radians);
    const dx = point.x - center.x;
    const dy = point.y - center.y;
    return { x: center.x + dx * cos - dy * sin, y: center.y + dx * sin + dy * cos };
}

// A point given in the rect's own (unrotated) frame, where it lies on the page.
function placeInRect(rect: RotatedRect, point: Point): Point {
    return rotatePoint(point, rectCenter(rect), rotationOf(rect));
}

// Clockwise from the top-left corner of the rect's own frame.
export function rectCorners(rect: RotatedRect): Point[] {
    const right = rect.x + rect.width;
    const bottom = rect.y + rect.height;
    return [{ x: rect.x, y: rect.y }, { x: right, y: rect.y }, { x: right, y: bottom }, { x: rect.x, y: bottom }]
        .map((corner) => placeInRect(rect, corner));
}

export function boundingRect(rect: RotatedRect): Rect {
    if (!rotationOf(rect)) {
        return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    }
    return boundingRectOfPoints(rectCorners(rect));
}

export function boundingRectOfAll(rects: RotatedRect[]): Rect {
    return boundingRectOfPoints(rects.flatMap((rect) => rectCorners(rect)));
}

function boundingRectOfPoints(points: Point[]): Rect {
    const xs = points.map((point) => point.x);
    const ys = points.map((point) => point.y);
    const left = Math.min(...xs);
    const top = Math.min(...ys);
    return { x: left, y: top, width: Math.max(...xs) - left, height: Math.max(...ys) - top };
}

export function moveRect<T extends Rect>(rect: T, dx: number, dy: number): T {
    return { ...rect, x: rect.x + dx, y: rect.y + dy };
}

// Keeps the rect's bounding box inside the bounds, or, when the box is larger than the bounds, covering them.
export function clampMoveToBounds<T extends RotatedRect>(rect: T, bounds: Size): T {
    const box = boundingRect(rect);
    return moveRect(rect, clampShift(box.x, box.width, bounds.width), clampShift(box.y, box.height, bounds.height));
}

function clampShift(start: number, size: number, limit: number): number {
    const lastStart = limit - size;
    return clamp(start, Math.min(0, lastStart), Math.max(0, lastStart)) - start;
}

// A copy of the rect shifted down and to the right by the offset, or up/left on an axis where that would leave the
// bounds, so the copy never lands exactly on the original near the image's bottom or right edge.
export function offsetCopyRect<T extends RotatedRect>(rect: T, offset: number, bounds: Size): T {
    const box = boundingRect(rect);
    return clampMoveToBounds(moveRect(
        rect,
        stepWithinLimit(box.x, box.width, offset, bounds.width),
        stepWithinLimit(box.y, box.height, offset, bounds.height)
    ), bounds);
}

function stepWithinLimit(start: number, size: number, step: number, limit: number): number {
    return start + step + size <= limit ? step : -step;
}

export type ResizeHandle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';

// Clockwise from the top-left, a 45° turn apart around the rect.
const RESIZE_HANDLES: ResizeHandle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

export function handlePoints(rect: RotatedRect): { handle: ResizeHandle; point: Point }[] {
    return RESIZE_HANDLES.map((handle) => ({ handle, point: handlePoint(rect, handle) }));
}

export function handlePoint(rect: RotatedRect, handle: ResizeHandle): Point {
    return placeInRect(rect, unrotatedHandlePoint(rect, handle));
}

// Above the middle of the rect's top edge, the offset away from it, turning with the rect.
export function rotationHandlePoint(rect: RotatedRect, offset: number): Point {
    return placeInRect(rect, { x: rect.x + rect.width / 2, y: rect.y - offset });
}

function unrotatedHandlePoint(rect: Rect, handle: ResizeHandle): Point {
    const x = handle.includes('w') ? rect.x : handle.includes('e') ? rect.x + rect.width : rect.x + rect.width / 2;
    const y = handle.includes('n') ? rect.y : handle.includes('s') ? rect.y + rect.height : rect.y + rect.height / 2;
    return { x, y };
}

// The handle in that direction once the rect's rotation is applied, e.g. 'n' turned 90° points east: 'e'.
export function rotatedHandleDirection(handle: ResizeHandle, rotation: number): ResizeHandle {
    const steps = Math.round(rotation / 45);
    const count = RESIZE_HANDLES.length;
    return RESIZE_HANDLES[((RESIZE_HANDLES.indexOf(handle) + steps) % count + count) % count];
}

const OPPOSITE_HANDLES: Record<ResizeHandle, ResizeHandle> = { nw: 'se', n: 's', ne: 'sw', e: 'w', se: 'nw', s: 'n', sw: 'ne', w: 'e' };

// The drag delta is in page coordinates; the rect resizes in its own frame, the handle opposite the dragged one staying
// where it is on the page.
export function resizeRect<T extends RotatedRect>(rect: T, handle: ResizeHandle, dx: number, dy: number): T {
    const rotation = rotationOf(rect);
    const delta = rotatePoint({ x: dx, y: dy }, { x: 0, y: 0 }, -rotation);
    const resized = { ...rect, ...resizeUnrotated(rect, handle, delta.x, delta.y) };
    if (!rotation) {
        return resized;
    }
    const anchor = unrotatedHandlePoint(rect, OPPOSITE_HANDLES[handle]);
    const anchorBefore = rotatePoint(anchor, rectCenter(rect), rotation);
    const anchorAfter = rotatePoint(anchor, rectCenter(resized), rotation);
    return moveRect(resized, anchorBefore.x - anchorAfter.x, anchorBefore.y - anchorAfter.y);
}

function resizeUnrotated(rect: Rect, handle: ResizeHandle, dx: number, dy: number): Rect {
    let { x, y, width, height } = rect;
    if (handle.includes('w')) {
        x += dx;
        width -= dx;
    } else if (handle.includes('e')) {
        width += dx;
    }
    if (handle.includes('n')) {
        y += dy;
        height -= dy;
    } else if (handle.includes('s')) {
        height += dy;
    }
    return normalizeRect({ x, y, width, height });
}

function normalizeRect(rect: Rect): Rect {
    const x = rect.width < 0 ? rect.x + rect.width : rect.x;
    const y = rect.height < 0 ? rect.y + rect.height : rect.y;
    return { x, y, width: Math.abs(rect.width), height: Math.abs(rect.height) };
}

// The rotation that turns the rect's top towards the point, in [0, 360), rounded to the nearest snap step if given.
export function rotationTowards(center: Point, point: Point, snapStep?: number): number {
    const degrees = Math.atan2(point.x - center.x, center.y - point.y) * 180 / Math.PI;
    const snapped = snapStep ? Math.round(degrees / snapStep) * snapStep : degrees;
    return normalizedDegrees(snapped);
}

// The rect turned about its centre by the degrees, clockwise.
export function turnRect<T extends RotatedRect>(rect: T, degrees: number): T {
    return { ...rect, rotation: normalizedDegrees(rotationOf(rect) + degrees) };
}

function normalizedDegrees(degrees: number): number {
    return (degrees % FULL_TURN_DEGREES + FULL_TURN_DEGREES) % FULL_TURN_DEGREES;
}

export function hitTestRectangle(point: Point, shape: RotatedRect): boolean {
    const local = rotatePoint(point, rectCenter(shape), -rotationOf(shape));
    return local.x >= shape.x && local.x <= shape.x + shape.width &&
        local.y >= shape.y && local.y <= shape.y + shape.height;
}

// Touching counts: the rects overlap unless an axis along one of their sides separates them.
export function rectsIntersect(a: RotatedRect, b: RotatedRect): boolean {
    const cornersA = rectCorners(a);
    const cornersB = rectCorners(b);
    return [rotationOf(a), rotationOf(b)].every(function overlapsAlongSides(rotation) {
        const radians = rotation * Math.PI / 180;
        const sideAxes = [{ x: Math.cos(radians), y: Math.sin(radians) }, { x: -Math.sin(radians), y: Math.cos(radians) }];
        return sideAxes.every((axis) => projectionsOverlap(cornersA, cornersB, axis));
    });
}

function projectionsOverlap(a: Point[], b: Point[], axis: Point): boolean {
    const projectedA = a.map((point) => point.x * axis.x + point.y * axis.y);
    const projectedB = b.map((point) => point.x * axis.x + point.y * axis.y);
    return Math.min(...projectedA) <= Math.max(...projectedB) && Math.min(...projectedB) <= Math.max(...projectedA);
}

export function topmostShapeAt(point: Point, shapes: RectangleShape[]): RectangleShape | null {
    for (let i = shapes.length - 1; i >= 0; i--) {
        if (hitTestRectangle(point, shapes[i])) {
            return shapes[i];
        }
    }
    return null;
}

// The rows numbering's order. The image analysis keeps its own copy (imageAnalysis/geometry), as it changes with the
// numbering rules and this must not.
// Groups shapes into rows before ordering left to right, so a shape a few pixels higher than its
// neighbour doesn't jump ahead of it. Each shape is compared against the row's average vertical band, which
// follows a gently slanted row but not a staircase whose steps exceed half a shape's height.
export function shapesInReadingOrder<T extends Rect>(shapes: T[]): T[] {
    return groupAlong('y', [...shapes].sort(byTopThenLeft)).flatMap(function rowLeftToRight(row) {
        return columnsTopToBottom(row);
    });
}

// A tall shape draws the shapes stacked beside it into its row. Stacked shapes read top to bottom, as a column,
// rather than by whichever happens to start a little further left.
function columnsTopToBottom<T extends Rect>(row: T[]): T[] {
    return groupAlong('x', [...row].sort(byLeftThenTop)).flatMap(function columnTopToBottom(column) {
        return column.sort(byTopThenLeft);
    });
}

// Splits shapes, sorted along the axis, into groups whose extents on that axis overlap the group's average band
// by at least half the shorter extent: rows for 'y', columns for 'x'.
function groupAlong<T extends Rect>(axis: 'x' | 'y', sortedShapes: T[]): T[][] {
    const groups: { shapes: T[]; band: Band }[] = [];
    for (const shape of sortedShapes) {
        const currentGroup = groups[groups.length - 1];
        const extent = bandOf(shape, axis);
        if (currentGroup && overlapsHalf(currentGroup.band, extent)) {
            currentGroup.shapes.push(shape);
            currentGroup.band = averageBand(currentGroup.shapes, axis);
        } else {
            groups.push({ shapes: [shape], band: extent });
        }
    }
    return groups.map((group) => group.shapes);
}

interface Band {
    start: number;
    end: number;
}

function bandOf(shape: Rect, axis: 'x' | 'y'): Band {
    return axis === 'y' ? { start: shape.y, end: shape.y + shape.height } : { start: shape.x, end: shape.x + shape.width };
}

function averageBand(shapes: Rect[], axis: 'x' | 'y'): Band {
    let start = 0;
    let end = 0;
    for (const shape of shapes) {
        const band = bandOf(shape, axis);
        start += band.start;
        end += band.end;
    }
    return { start: start / shapes.length, end: end / shapes.length };
}

function overlapsHalf(a: Band, b: Band): boolean {
    const overlap = Math.min(a.end, b.end) - Math.max(a.start, b.start);
    return overlap >= Math.min(a.end - a.start, b.end - b.start) * MIN_BAND_OVERLAP_RATIO;
}

function byTopThenLeft(a: Rect, b: Rect): number {
    return a.y - b.y || a.x - b.x;
}

function byLeftThenTop(a: Rect, b: Rect): number {
    return a.x - b.x || a.y - b.y;
}

function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
}
