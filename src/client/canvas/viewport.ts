export interface Viewport {
    zoom: number;
    panX: number;
    panY: number;
}

export interface Point {
    x: number;
    y: number;
}

export interface Size {
    width: number;
    height: number;
}

const minZoom = 0.1;
const maxZoom = 8;

export function fitViewport(imageSize: Size, canvasSize: Size): Viewport {
    const zoom = Math.min(canvasSize.width / imageSize.width, canvasSize.height / imageSize.height, 1);
    return {
        zoom,
        panX: (canvasSize.width - imageSize.width * zoom) / 2,
        panY: (canvasSize.height - imageSize.height * zoom) / 2
    };
}

export function imageToCanvas(viewport: Viewport, point: Point): Point {
    return {
        x: point.x * viewport.zoom + viewport.panX,
        y: point.y * viewport.zoom + viewport.panY
    };
}

export function canvasToImage(viewport: Viewport, point: Point): Point {
    return {
        x: (point.x - viewport.panX) / viewport.zoom,
        y: (point.y - viewport.panY) / viewport.zoom
    };
}

export function zoomAtCanvasPoint(viewport: Viewport, canvasPoint: Point, zoomFactor: number): Viewport {
    const zoom = clamp(viewport.zoom * zoomFactor, minZoom, maxZoom);
    const imagePoint = canvasToImage(viewport, canvasPoint);
    return {
        zoom,
        panX: canvasPoint.x - imagePoint.x * zoom,
        panY: canvasPoint.y - imagePoint.y * zoom
    };
}

export function panViewport(viewport: Viewport, dx: number, dy: number): Viewport {
    return { ...viewport, panX: viewport.panX + dx, panY: viewport.panY + dy };
}

function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
}
