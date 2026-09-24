import type { Point, Size } from '../canvas/viewport';
import type { RectangleShape } from '../../shared/types';

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

function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
}
