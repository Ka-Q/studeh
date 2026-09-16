import { canvasToImage, fitViewport, imageToCanvas, panViewport, zoomAtCanvasPoint, type Point, type Size, type Viewport } from './viewport.js';
import {
    clampMoveToBounds,
    clampRectToBounds,
    handlePoints,
    isRectEmpty,
    moveRect,
    rectFromPoints,
    resizeRect,
    topmostShapeAt,
    type Rect,
    type ResizeHandle
} from '../shapes/rectangle.js';
import type { RectangleShape } from '../document/types.js';
import type { Mode } from '../document/state.js';

export interface ImageCanvasCallbacks {
    onCreateShape(rect: Rect): void;
    onSelectShape(shapeId: string | null): void;
    onUpdateShapeRect(shapeId: string, rect: Rect): void;
    onDeleteSelected(): void;
    onToggleVisibility(shapeId: string): void;
}

type ActiveDrag =
    | { kind: 'move'; shapeId: string; original: Rect; startCanvasPoint: Point; current: Rect }
    | { kind: 'resize'; shapeId: string; handle: ResizeHandle; original: Rect; startCanvasPoint: Point; current: Rect };

export interface ImageCanvasHandle {
    update(shapes: RectangleShape[], selectedShapeId: string | null, mode: Mode): void;
    setFullscreen(isFullscreen: boolean): void;
    destroy(): void;
}

const middleMouseButton = 1;
const leftMouseButton = 0;
const zoomStepPerWheelTick = 1.1;
const clickDragThresholdPx = 3;
const handleHitRadiusPx = 6;
const handleSizePx = 8;
const unselectedStrokeStyle = 'rgba(37, 99, 235, 0.9)';
const unselectedFillStyle = 'rgba(37, 99, 235, 0.15)';
const selectedStrokeStyle = 'rgba(220, 38, 38, 0.95)';
const selectedFillStyle = 'rgba(220, 38, 38, 0.2)';
const occlusionFillStyle = 'rgb(121, 122, 123)';
const occlusionStrokeStyle = 'rgb(213, 35, 35)';
const revealedFillStyle = 'rgba(242, 242, 242, 0.05)';
const revealedStrokeStyle = 'rgb(68, 202, 31)';
const focusOutlineStyle = 'rgb(37, 99, 235)';
const focusOutlinePaddingPx = 4;
interface RectStyle {
    fill: string | null;
    stroke: string;
    lineWidth: number;
}
const unselectedStyle: RectStyle = { fill: unselectedFillStyle, stroke: unselectedStrokeStyle, lineWidth: 2 };
const selectedStyle: RectStyle = { fill: selectedFillStyle, stroke: selectedStrokeStyle, lineWidth: 3 };
const occlusionStyle: RectStyle = { fill: occlusionFillStyle, stroke: occlusionStrokeStyle, lineWidth: 3 };
const revealedStyle: RectStyle = { fill: revealedFillStyle, stroke: revealedStrokeStyle, lineWidth: 3 };
const handleCursors: Record<ResizeHandle, string> = {
    n: 'ns-resize',
    s: 'ns-resize',
    e: 'ew-resize',
    w: 'ew-resize',
    nw: 'nwse-resize',
    se: 'nwse-resize',
    ne: 'nesw-resize',
    sw: 'nesw-resize'
};

export function mountImageCanvas(
    container: HTMLElement,
    imageUrl: string,
    initialShapes: RectangleShape[],
    initialSelectedShapeId: string | null,
    initialMode: Mode,
    initialIsFullscreen: boolean,
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
    let mode = initialMode;
    let isFullscreen = initialIsFullscreen;
    let focusedShapeId: string | null = null;
    let stopPanning: (() => void) | null = null;
    let creatingRect: { start: Point; current: Point } | null = null;
    let activeDrag: ActiveDrag | null = null;

    const resizeObserver = new ResizeObserver(function onResize() {
        resizeCanvasToContainer();
        draw();
    });
    resizeObserver.observe(container);

    const loadedImage = new Image();
    function onImageLoad(): void {
        image = loadedImage;
        refitViewport();
        draw();
    }

    function refitViewport(): void {
        if (!image) {
            return;
        }
        resizeCanvasToContainer();
        viewport = fitViewport(
            { width: image.naturalWidth, height: image.naturalHeight },
            { width: canvas.clientWidth, height: canvas.clientHeight }
        );
    }
    function onImageError(): void {
        container.textContent = 'Failed to load image.';
    }
    loadedImage.addEventListener('load', onImageLoad);
    loadedImage.addEventListener('error', onImageError);
    loadedImage.src = imageUrl;

    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.addEventListener('mousedown', onMouseDown);
    canvas.addEventListener('mousemove', onHoverMove);
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
        if (mode === 'study') {
            for (const shape of shapes) {
                drawRect(shape, shape.visible ? revealedStyle : occlusionStyle, false);
                if (isFullscreen && shape.id === focusedShapeId) {
                    drawFocusOutline(shape);
                }
            }
            return;
        }
        for (const shape of shapes) {
            const rect = activeDrag?.shapeId === shape.id ? activeDrag.current : shape;
            drawRect(rect, shape.id === selectedShapeId ? selectedStyle : unselectedStyle, false);
        }
        if (creatingRect) {
            drawRect(rectFromPoints(creatingRect.start, creatingRect.current), unselectedStyle, true);
        }
        const selectedRect = selectedShapeRect();
        if (selectedRect) {
            drawHandles(selectedRect);
        }
    }

    function selectedShapeRect(): Rect | null {
        if (!selectedShapeId || creatingRect) {
            return null;
        }
        if (activeDrag?.shapeId === selectedShapeId) {
            return activeDrag.current;
        }
        return shapes.find(function isSelected(shape) {
            return shape.id === selectedShapeId;
        }) ?? null;
    }

    function drawHandles(rect: Rect): void {
        context.fillStyle = selectedStrokeStyle;
        for (const { point } of handlePoints(rect)) {
            const screenPoint = imageToCanvas(viewport, point);
            context.fillRect(
                screenPoint.x - handleSizePx / 2,
                screenPoint.y - handleSizePx / 2,
                handleSizePx,
                handleSizePx
            );
        }
    }

    function drawRect(rect: Rect, style: RectStyle, isPreview: boolean): void {
        const topLeft = isPreview ? rect : imageToCanvas(viewport, { x: rect.x, y: rect.y });
        const width = isPreview ? rect.width : rect.width * viewport.zoom;
        const height = isPreview ? rect.height : rect.height * viewport.zoom;
        context.save();
        if (isPreview) {
            context.setLineDash([4, 4]);
        }
        context.strokeStyle = style.stroke;
        context.lineWidth = style.lineWidth;
        if (!isPreview && style.fill) {
            context.fillStyle = style.fill;
            context.fillRect(topLeft.x, topLeft.y, width, height);
        }
        context.strokeRect(topLeft.x, topLeft.y, width, height);
        context.restore();
    }

    function drawFocusOutline(rect: Rect): void {
        const topLeft = imageToCanvas(viewport, { x: rect.x, y: rect.y });
        const width = rect.width * viewport.zoom;
        const height = rect.height * viewport.zoom;
        context.save();
        context.setLineDash([6, 4]);
        context.strokeStyle = focusOutlineStyle;
        context.lineWidth = 3;
        context.strokeRect(
            topLeft.x - focusOutlinePaddingPx,
            topLeft.y - focusOutlinePaddingPx,
            width + focusOutlinePaddingPx * 2,
            height + focusOutlinePaddingPx * 2
        );
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

        if (mode === 'study') {
            const hitShape = topmostShapeAt(canvasToImage(viewport, canvasPoint), shapes);
            if (hitShape) {
                callbacks.onToggleVisibility(hitShape.id);
            }
            return;
        }

        const selectedShape = findShape(selectedShapeId);
        const handle = selectedShape ? handleAtCanvasPoint(selectedShape, canvasPoint) : null;
        if (selectedShape && handle) {
            startResizing(selectedShape, handle, canvasPoint);
            return;
        }

        const hitShape = topmostShapeAt(canvasToImage(viewport, canvasPoint), shapes);
        if (hitShape) {
            callbacks.onSelectShape(hitShape.id);
            startMoving(hitShape, canvasPoint);
            return;
        }

        callbacks.onSelectShape(null);
        startCreating(canvasPoint);
    }

    function onHoverMove(event: MouseEvent): void {
        if (!image || activeDrag || creatingRect) {
            return;
        }
        const canvasPoint = toCanvasPoint(event);

        if (mode === 'study') {
            const hitShape = topmostShapeAt(canvasToImage(viewport, canvasPoint), shapes);
            canvas.style.cursor = hitShape ? 'pointer' : 'default';
            return;
        }

        const selectedShape = findShape(selectedShapeId);
        const handle = selectedShape ? handleAtCanvasPoint(selectedShape, canvasPoint) : null;
        if (handle) {
            canvas.style.cursor = handleCursors[handle];
            return;
        }
        const hitShape = topmostShapeAt(canvasToImage(viewport, canvasPoint), shapes);
        canvas.style.cursor = hitShape ? 'move' : 'crosshair';
    }

    function findShape(shapeId: string | null): RectangleShape | null {
        return shapes.find(function matchesId(shape) {
            return shape.id === shapeId;
        }) ?? null;
    }

    function handleAtCanvasPoint(rect: Rect, canvasPoint: Point): ResizeHandle | null {
        for (const { handle, point } of handlePoints(rect)) {
            const screenPoint = imageToCanvas(viewport, point);
            if (Math.hypot(screenPoint.x - canvasPoint.x, screenPoint.y - canvasPoint.y) <= handleHitRadiusPx) {
                return handle;
            }
        }
        return null;
    }

    function imagePointDelta(a: Point, b: Point): Point {
        const imageA = canvasToImage(viewport, a);
        const imageB = canvasToImage(viewport, b);
        return { x: imageB.x - imageA.x, y: imageB.y - imageA.y };
    }

    function imageBounds(): Size {
        return { width: image!.naturalWidth, height: image!.naturalHeight };
    }

    function startMoving(shape: RectangleShape, startCanvasPoint: Point): void {
        const original: Rect = { x: shape.x, y: shape.y, width: shape.width, height: shape.height };
        activeDrag = { kind: 'move', shapeId: shape.id, original, startCanvasPoint, current: original };
        draw();

        function onMouseMove(moveEvent: MouseEvent): void {
            const drag = activeDrag;
            if (!drag || drag.kind !== 'move') {
                return;
            }
            const delta = imagePointDelta(startCanvasPoint, toCanvasPoint(moveEvent));
            const current = clampMoveToBounds(moveRect(drag.original, delta.x, delta.y), imageBounds());
            activeDrag = { ...drag, current };
            draw();
        }

        function onMouseUp(): void {
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mouseup', onMouseUp);
            finishDrag();
        }

        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);
    }

    function startResizing(shape: RectangleShape, handle: ResizeHandle, startCanvasPoint: Point): void {
        const original: Rect = { x: shape.x, y: shape.y, width: shape.width, height: shape.height };
        activeDrag = { kind: 'resize', shapeId: shape.id, handle, original, startCanvasPoint, current: original };
        draw();

        function onMouseMove(moveEvent: MouseEvent): void {
            const drag = activeDrag;
            if (!drag || drag.kind !== 'resize') {
                return;
            }
            const delta = imagePointDelta(startCanvasPoint, toCanvasPoint(moveEvent));
            const current = clampRectToBounds(resizeRect(drag.original, drag.handle, delta.x, delta.y), imageBounds());
            activeDrag = { ...drag, current };
            draw();
        }

        function onMouseUp(): void {
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mouseup', onMouseUp);
            finishDrag();
        }

        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);
    }

    function finishDrag(): void {
        if (!activeDrag) {
            return;
        }
        const { shapeId, current } = activeDrag;
        activeDrag = null;
        callbacks.onUpdateShapeRect(shapeId, current);
        draw();
    }

    function startPanning(event: MouseEvent): void {
        event.preventDefault();
        const startPoint = toCanvasPoint(event);
        let lastPoint = startPoint;
        let didPan = false;

        function onMouseMove(moveEvent: MouseEvent): void {
            const point = toCanvasPoint(moveEvent);
            if (!didPan && Math.hypot(point.x - startPoint.x, point.y - startPoint.y) >= clickDragThresholdPx) {
                didPan = true;
            }
            viewport = panViewport(viewport, point.x - lastPoint.x, point.y - lastPoint.y);
            lastPoint = point;
            draw();
        }

        function stop(): void {
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mouseup', onMouseUp);
            stopPanning = null;
        }

        function onMouseUp(upEvent: MouseEvent): void {
            stop();
            if (didPan) {
                upEvent.preventDefault();
                window.addEventListener('auxclick', suppressMiddleClickPaste, { capture: true, once: true });
            }
        }

        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);
        stopPanning = stop;
    }

    function suppressMiddleClickPaste(event: MouseEvent): void {
        event.preventDefault();
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
        if (dragDistance < clickDragThresholdPx) {
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
        if (mode === 'study') {
            onStudyKeyDown(event);
            return;
        }
        if (document.activeElement !== canvas || !selectedShapeId) {
            return;
        }
        if (event.key !== 'Delete' && event.key !== 'Backspace') {
            return;
        }
        event.preventDefault();
        callbacks.onDeleteSelected();
    }

    function onStudyKeyDown(event: KeyboardEvent): void {
        if (!isFullscreen || shapes.length === 0) {
            return;
        }
        if (event.key === 'Tab') {
            event.preventDefault();
            const ordered = shapesInReadingOrder(shapes);
            const currentIndex = ordered.findIndex(function isFocused(shape) {
                return shape.id === focusedShapeId;
            });
            const nextIndex = cycleFocusedShapeIndex(
                currentIndex === -1 ? null : currentIndex,
                event.shiftKey ? -1 : 1,
                ordered.length
            );
            focusedShapeId = ordered[nextIndex].id;
            draw();
            return;
        }
        if ((event.key === ' ' || event.key === 'Enter') && focusedShapeId !== null) {
            event.preventDefault();
            callbacks.onToggleVisibility(focusedShapeId);
        }
    }

    function toCanvasPoint(event: MouseEvent): Point {
        const rect = canvas.getBoundingClientRect();
        return { x: event.clientX - rect.left, y: event.clientY - rect.top };
    }

    return {
        update(nextShapes: RectangleShape[], nextSelectedShapeId: string | null, nextMode: Mode): void {
            shapes = nextShapes;
            selectedShapeId = nextSelectedShapeId;
            if (mode !== nextMode) {
                canvas.style.cursor = 'default';
            }
            mode = nextMode;
            draw();
        },
        setFullscreen(nextIsFullscreen: boolean): void {
            isFullscreen = nextIsFullscreen;
            focusedShapeId = null;
            refitViewport();
            draw();
        },
        destroy(): void {
            stopPanning?.();
            resizeObserver.disconnect();
            loadedImage.removeEventListener('load', onImageLoad);
            loadedImage.removeEventListener('error', onImageError);
            canvas.removeEventListener('wheel', onWheel);
            canvas.removeEventListener('mousedown', onMouseDown);
            canvas.removeEventListener('mousemove', onHoverMove);
            window.removeEventListener('keydown', onKeyDown);
            canvas.remove();
        }
    };
}

function cycleFocusedShapeIndex(current: number | null, direction: 1 | -1, length: number): number {
    if (current === null) {
        return direction === 1 ? 0 : length - 1;
    }
    return (current + direction + length) % length;
}

function shapesInReadingOrder(shapes: RectangleShape[]): RectangleShape[] {
    return [...shapes].sort(function byTopThenLeft(a, b) {
        return a.y - b.y || a.x - b.x;
    });
}

function getContext2d(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
    const context = canvas.getContext('2d');
    if (!context) {
        throw new Error('Canvas 2D context is not available');
    }
    return context;
}
