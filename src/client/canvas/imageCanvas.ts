import { canvasToImage, fitViewport, imageToCanvas, panViewport, zoomAtCanvasPoint, type Point, type Viewport } from './viewport.js';
import { clampRectToBounds, isRectEmpty, rectFromPoints, topmostShapeAt, type Rect } from '../shapes/rectangle.js';
import type { RectangleShape } from '../document/types.js';

export interface ImageCanvasCallbacks {
    onCreateShape(rect: Rect): void;
    onSelectShape(shapeId: string | null): void;
    onDeleteSelected(): void;
}

export interface ImageCanvasHandle {
    update(shapes: RectangleShape[], selectedShapeId: string | null): void;
    destroy(): void;
}

const middleMouseButton = 1;
const leftMouseButton = 0;
const zoomStepPerWheelTick = 1.1;
const dragCreateThresholdPx = 3;
const unselectedStrokeStyle = 'rgba(37, 99, 235, 0.9)';
const unselectedFillStyle = 'rgba(37, 99, 235, 0.15)';
const selectedStrokeStyle = 'rgba(220, 38, 38, 0.95)';
const selectedFillStyle = 'rgba(220, 38, 38, 0.2)';

export function mountImageCanvas(
    container: HTMLElement,
    imageUrl: string,
    initialShapes: RectangleShape[],
    initialSelectedShapeId: string | null,
    callbacks: ImageCanvasCallbacks
): ImageCanvasHandle {
    const canvas = document.createElement('canvas');
    canvas.tabIndex = 0;
    const context = getContext2d(canvas);
    container.appendChild(canvas);

    let image: HTMLImageElement | null = null;
    let viewport: Viewport = { zoom: 1, panX: 0, panY: 0 };
    let shapes = initialShapes;
    let selectedShapeId = initialSelectedShapeId;
    let stopPanning: (() => void) | null = null;
    let creatingRect: { start: Point; current: Point } | null = null;

    const resizeObserver = new ResizeObserver(function onResize() {
        resizeCanvasToContainer();
        draw();
    });
    resizeObserver.observe(container);

    const loadedImage = new Image();
    loadedImage.addEventListener('load', function onImageLoad() {
        image = loadedImage;
        resizeCanvasToContainer();
        viewport = fitViewport(
            { width: loadedImage.naturalWidth, height: loadedImage.naturalHeight },
            { width: canvas.clientWidth, height: canvas.clientHeight }
        );
        draw();
    });
    loadedImage.addEventListener('error', function onImageError() {
        container.textContent = 'Failed to load image.';
    });
    loadedImage.src = imageUrl;

    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.addEventListener('mousedown', onMouseDown);
    window.addEventListener('keydown', onKeyDown);

    function resizeCanvasToContainer(): void {
        const devicePixelRatio = window.devicePixelRatio || 1;
        canvas.width = canvas.clientWidth * devicePixelRatio;
        canvas.height = canvas.clientHeight * devicePixelRatio;
        context.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
    }

    function draw(): void {
        context.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);
        if (!image) {
            return;
        }
        context.drawImage(
            image,
            viewport.panX,
            viewport.panY,
            image.naturalWidth * viewport.zoom,
            image.naturalHeight * viewport.zoom
        );
        for (const shape of shapes) {
            drawRect(shape, shape.id === selectedShapeId, false);
        }
        if (creatingRect) {
            drawRect(rectFromPoints(creatingRect.start, creatingRect.current), false, true);
        }
    }

    function drawRect(rect: Rect, isSelected: boolean, isPreview: boolean): void {
        const topLeft = isPreview ? rect : imageToCanvas(viewport, { x: rect.x, y: rect.y });
        const width = isPreview ? rect.width : rect.width * viewport.zoom;
        const height = isPreview ? rect.height : rect.height * viewport.zoom;
        context.save();
        if (isPreview) {
            context.setLineDash([4, 4]);
        }
        context.fillStyle = isSelected ? selectedFillStyle : unselectedFillStyle;
        context.strokeStyle = isSelected ? selectedStrokeStyle : unselectedStrokeStyle;
        context.lineWidth = isSelected ? 2 : 1;
        if (!isPreview) {
            context.fillRect(topLeft.x, topLeft.y, width, height);
        }
        context.strokeRect(topLeft.x, topLeft.y, width, height);
        context.restore();
    }

    function onWheel(event: WheelEvent): void {
        if (!image) {
            return;
        }
        event.preventDefault();
        const zoomFactor = event.deltaY < 0 ? zoomStepPerWheelTick : 1 / zoomStepPerWheelTick;
        viewport = zoomAtCanvasPoint(viewport, toCanvasPoint(event), zoomFactor);
        draw();
    }

    function onMouseDown(event: MouseEvent): void {
        if (!image) {
            return;
        }
        if (event.button === middleMouseButton) {
            startPanning(event);
            return;
        }
        if (event.button !== leftMouseButton) {
            return;
        }
        canvas.focus();
        const canvasPoint = toCanvasPoint(event);
        const imagePoint = canvasToImage(viewport, canvasPoint);
        const hitShape = topmostShapeAt(imagePoint, shapes);
        if (hitShape) {
            callbacks.onSelectShape(hitShape.id);
            return;
        }
        startCreating(canvasPoint);
    }

    function startPanning(event: MouseEvent): void {
        event.preventDefault();
        let lastPoint = toCanvasPoint(event);

        function onMouseMove(moveEvent: MouseEvent): void {
            const point = toCanvasPoint(moveEvent);
            viewport = panViewport(viewport, point.x - lastPoint.x, point.y - lastPoint.y);
            lastPoint = point;
            draw();
        }

        function onMouseUp(): void {
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mouseup', onMouseUp);
            stopPanning = null;
        }

        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);
        stopPanning = onMouseUp;
    }

    function startCreating(startCanvasPoint: Point): void {
        creatingRect = { start: startCanvasPoint, current: startCanvasPoint };
        draw();

        function onMouseMove(moveEvent: MouseEvent): void {
            if (!creatingRect) {
                return;
            }
            creatingRect = { start: creatingRect.start, current: toCanvasPoint(moveEvent) };
            draw();
        }

        function onMouseUp(): void {
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mouseup', onMouseUp);
            finishCreating();
        }

        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);
    }

    function finishCreating(): void {
        const rect = creatingRect;
        creatingRect = null;
        if (!rect || !image) {
            draw();
            return;
        }
        const dragDistance = Math.hypot(rect.current.x - rect.start.x, rect.current.y - rect.start.y);
        if (dragDistance < dragCreateThresholdPx) {
            callbacks.onSelectShape(null);
            draw();
            return;
        }
        const imageRect = clampRectToBounds(
            rectFromPoints(canvasToImage(viewport, rect.start), canvasToImage(viewport, rect.current)),
            { width: image.naturalWidth, height: image.naturalHeight }
        );
        draw();
        if (!isRectEmpty(imageRect)) {
            callbacks.onCreateShape(imageRect);
        }
    }

    function onKeyDown(event: KeyboardEvent): void {
        if (document.activeElement !== canvas || !selectedShapeId) {
            return;
        }
        if (event.key !== 'Delete' && event.key !== 'Backspace') {
            return;
        }
        event.preventDefault();
        callbacks.onDeleteSelected();
    }

    function toCanvasPoint(event: MouseEvent): Point {
        const rect = canvas.getBoundingClientRect();
        return { x: event.clientX - rect.left, y: event.clientY - rect.top };
    }

    return {
        update(nextShapes: RectangleShape[], nextSelectedShapeId: string | null): void {
            shapes = nextShapes;
            selectedShapeId = nextSelectedShapeId;
            draw();
        },
        destroy(): void {
            stopPanning?.();
            resizeObserver.disconnect();
            canvas.removeEventListener('wheel', onWheel);
            canvas.removeEventListener('mousedown', onMouseDown);
            window.removeEventListener('keydown', onKeyDown);
            canvas.remove();
        }
    };
}

function getContext2d(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
    const context = canvas.getContext('2d');
    if (!context) {
        throw new Error('Canvas 2D context is not available');
    }
    return context;
}
