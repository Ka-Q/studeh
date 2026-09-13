import type { Point, Size } from '../canvas/viewport.js';
import type { RectangleShape } from '../document/types.js';

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
