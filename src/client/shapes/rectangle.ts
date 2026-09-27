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

export function rectsEqual(a: Rect, b: Rect): boolean {
    return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
}

export function moveRect(rect: Rect, dx: number, dy: number): Rect {
    return { ...rect, x: rect.x + dx, y: rect.y + dy };
}

export function clampMoveToBounds(rect: Rect, bounds: Size): Rect {
    const maxX = Math.max(0, bounds.width - rect.width);
    const maxY = Math.max(0, bounds.height - rect.height);
    return { ...rect, x: clamp(rect.x, 0, maxX), y: clamp(rect.y, 0, maxY) };
}

export type ResizeHandle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';

export function handlePoints(rect: Rect): { handle: ResizeHandle; point: Point }[] {
    const midX = rect.x + rect.width / 2;
    const midY = rect.y + rect.height / 2;
    const right = rect.x + rect.width;
    const bottom = rect.y + rect.height;
    return [
        { handle: 'nw', point: { x: rect.x, y: rect.y } },
        { handle: 'n', point: { x: midX, y: rect.y } },
        { handle: 'ne', point: { x: right, y: rect.y } },
        { handle: 'e', point: { x: right, y: midY } },
        { handle: 'se', point: { x: right, y: bottom } },
        { handle: 's', point: { x: midX, y: bottom } },
        { handle: 'sw', point: { x: rect.x, y: bottom } },
        { handle: 'w', point: { x: rect.x, y: midY } }
    ];
}

export function resizeRect(rect: Rect, handle: ResizeHandle, dx: number, dy: number): Rect {
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

export function hitTestRectangle(point: Point, shape: RectangleShape): boolean {
    return point.x >= shape.x && point.x <= shape.x + shape.width &&
        point.y >= shape.y && point.y <= shape.y + shape.height;
}

export function topmostShapeAt(point: Point, shapes: RectangleShape[]): RectangleShape | null {
    for (let i = shapes.length - 1; i >= 0; i--) {
        if (hitTestRectangle(point, shapes[i])) {
            return shapes[i];
        }
    }
    return null;
}

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
