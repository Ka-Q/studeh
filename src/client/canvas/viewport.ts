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

export const MIN_ZOOM = 0.1;
export const MAX_ZOOM = 8;

export function fitViewport(imageSize: Size, canvasSize: Size, horizontalPadding = 0): Viewport {
    const paddedWidth = canvasSize.width > horizontalPadding * 2 ? canvasSize.width - horizontalPadding * 2 : canvasSize.width;
    const zoom = Math.min(paddedWidth / imageSize.width, canvasSize.height / imageSize.height, MAX_ZOOM);
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
    return zoomToLevelAtCanvasPoint(viewport, canvasPoint, viewport.zoom * zoomFactor);
}

export function panViewport(viewport: Viewport, dx: number, dy: number): Viewport {
    return { ...viewport, panX: viewport.panX + dx, panY: viewport.panY + dy };
}

export function zoomToLevelAtCanvasPoint(viewport: Viewport, canvasPoint: Point, targetZoom: number): Viewport {
    const zoom = clamp(targetZoom, MIN_ZOOM, MAX_ZOOM);
    const imagePoint = canvasToImage(viewport, canvasPoint);
    return {
        zoom,
        panX: canvasPoint.x - imagePoint.x * zoom,
        panY: canvasPoint.y - imagePoint.y * zoom
    };
}

function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
}
