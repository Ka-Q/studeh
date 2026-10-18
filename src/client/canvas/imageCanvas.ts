import { canvasToImage, fitViewport, imageToCanvas, panViewport, zoomAtCanvasPoint, zoomToLevelAtCanvasPoint, type Point, type Size, type Viewport } from './viewport';
import {
    clampMoveToBounds,
    clampRectToBounds,
    handlePoints,
    isRectEmpty,
    moveRect,
    rectFromPoints,
    rectsEqual,
    resizeRect,
    topmostShapeAt,
    type Rect,
    type ResizeHandle
} from '../shapes/rectangle';
import type { RectangleShape } from '../../shared/types';
import type { Mode } from '../document/state';
import { isBlockedByInputOrDialog, isPrimaryModifierKey, isPrimaryModifierPressed, startDragSession } from '../dom';
import { registerShortcut, unregisterShortcut } from '../shortcutDispatch';
import { imageAnalysis } from '../imageAnalysis/analysisClient';
import { shapesInReadingOrder } from '../shapes/rectangle';

// The order shapes are numbered in: by the image analysis or in plain rows.
export type NumberingMode = 'smart' | 'rows';

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
    update(shapes: RectangleShape[], selectedShapeId: string | null, mode: Mode, numbering: NumberingMode, showNumbers: boolean, revealedShapeIds: ReadonlySet<string>): void;
    setFullscreen(isFullscreen: boolean): void;
    destroy(): void;
    isReady(): boolean;
    getZoom(): number;
    setZoom(zoom: number): void;
    fitToView(): void;
    onViewportChange(callback: () => void): () => void;
}

const MIDDLE_MOUSE_BUTTON = 1;
const LEFT_MOUSE_BUTTON = 0;
const ZOOM_STEP_PER_WHEEL_TICK = 1.1;
const CLICK_DRAG_THRESHOLD_PX = 3;
const FIT_VIEW_HORIZONTAL_PADDING_PX = 64;
const HANDLE_HIT_RADIUS_PX = 6;
const HANDLE_SIZE_PX = 8;
const UNSELECTED_STROKE_STYLE = 'rgba(37, 99, 235, 0.9)';
const UNSELECTED_FILL_STYLE = 'rgba(37, 99, 235, 0.15)';
const SELECTED_STROKE_STYLE = 'rgba(220, 38, 38, 0.95)';
const SELECTED_FILL_STYLE = 'rgba(220, 38, 38, 0.2)';
const OCCLUSION_FILL_STYLE = 'rgb(121, 122, 123)';
const OCCLUSION_STROKE_STYLE = 'rgb(213, 35, 35)';
const REVEALED_FILL_STYLE = 'rgba(242, 242, 242, 0.05)';
const REVEALED_STROKE_STYLE = 'rgb(68, 202, 31)';
const FOCUS_OUTLINE_STYLE = 'rgb(37, 99, 235)';
const FOCUS_OUTLINE_PADDING_PX = 4;
const SHAPE_NUMBER_FONT_SIZE_PX = 11;
const SHAPE_NUMBER_SIZE_PX = 16;
const SHAPE_NUMBER_PADDING_PX = 4;
// Zoomed out, the numbers shrink with the shapes, all to one size so they never cover more than this share of a
// typical (median) shape's shorter side.
const SHAPE_NUMBER_MAX_SHAPE_SHARE = 0.8;
const SHAPE_NUMBER_BACKGROUND_STYLE = 'rgba(17, 24, 39, 0.8)';
const SHAPE_NUMBER_TEXT_STYLE = 'rgb(255, 255, 255)';
// Numbers given by the image analysis after the page is shown fade in over this long, rather than popping in.
const SHAPE_NUMBER_FADE_MS = 250;
const EDIT_MODE_HATCH_SPACING_PX = 256;
const EDIT_MODE_HATCH_LINE_WIDTH_PX = 1;
const EDIT_MODE_HATCH_LINE_COLOR = 'rgba(106, 106, 106, 0.2)';
interface RectStyle {
    fill: string | null;
    stroke: string;
    lineWidth: number;
}
const unselectedStyle: RectStyle = { fill: UNSELECTED_FILL_STYLE, stroke: UNSELECTED_STROKE_STYLE, lineWidth: 2 };
const selectedStyle: RectStyle = { fill: SELECTED_FILL_STYLE, stroke: SELECTED_STROKE_STYLE, lineWidth: 2 };
const occlusionStyle: RectStyle = { fill: OCCLUSION_FILL_STYLE, stroke: OCCLUSION_STROKE_STYLE, lineWidth: 2 };
const revealedStyle: RectStyle = { fill: REVEALED_FILL_STYLE, stroke: REVEALED_STROKE_STYLE, lineWidth: 3 };
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
    initialNumbering: NumberingMode,
    initialShowNumbers: boolean,
    initialIsFullscreen: boolean,
    initialRevealedShapeIds: ReadonlySet<string>,
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
    let numbering = initialNumbering;
    let showNumbers = initialShowNumbers;
    let isFullscreen = initialIsFullscreen;
    let revealedShapeIds = initialRevealedShapeIds;
    let focusedShapeId: string | null = null;
    let tabOrderCache: { shapes: RectangleShape[]; numbering: NumberingMode; ordered: RectangleShape[]; isFinal: boolean } | null = null;
    // When the image analysis's order arrived while the page was shown, and the frame drawing its fade, if any.
    let numbersArrivedAt: number | null = null;
    let fadeFrame: number | null = null;
    let stopPanning: (() => void) | null = null;
    let creatingRect: { start: Point; current: Point } | null = null;
    let activeDrag: ActiveDrag | null = null;
    let isPanModifierPressed = false;
    let lastHoverPoint: Point | null = null;
    // The fullscreenchange event can fire before the window has finished resizing, so the fit made on
    // toggle keeps being redone on resize until the user zooms or pans (which replaces the viewport object).
    let fullscreenToggleFit: Viewport | null = null;
    const viewportChangeListeners = new Set<() => void>();

    const resizeObserver = new ResizeObserver(function onResize() {
        resizeCanvasToContainer();
        if (viewport === fullscreenToggleFit) {
            refitViewport();
            fullscreenToggleFit = viewport;
        }
        draw();
    });
    resizeObserver.observe(container);

    const loadedImage = new Image();
    function onImageLoad(): void {
        image = loadedImage;
        tabOrderCache = null;
        // Started in edit mode too, so the order is usually known by the time study mode shows it.
        imageAnalysis.analyse(image);
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
            { width: canvas.clientWidth, height: canvas.clientHeight },
            FIT_VIEW_HORIZONTAL_PADDING_PX
        );
        notifyViewportChange();
    }

    function notifyViewportChange(): void {
        for (const listener of viewportChangeListeners) {
            listener();
        }
    }

    function applyZoom(targetZoom: number): void {
        if (!image) {
            return;
        }
        const center = { x: canvas.clientWidth / 2, y: canvas.clientHeight / 2 };
        viewport = zoomToLevelAtCanvasPoint(viewport, center, targetZoom);
        draw();
        notifyViewportChange();
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
    canvas.addEventListener('contextmenu', onContextMenu);
    canvas.addEventListener('blur', onCanvasBlur);
    window.addEventListener('keydown', onPanModifierKeyDown);
    window.addEventListener('keyup', onPanModifierKeyUp);
    window.addEventListener('blur', onWindowBlur);
    registerShortcut('deleteSelectedShape', deleteSelectedShape, canDeleteSelectedShape);
    registerShortcut('cycleFocusedShapeNext', () => cycleFocusedShape(1), () => canCycleFocusedShape(1));
    registerShortcut('cycleFocusedShapePrev', () => cycleFocusedShape(-1), () => canCycleFocusedShape(-1));
    registerShortcut('toggleFocusedShapeVisibility', toggleFocusedShapeVisibility, canToggleFocusedShapeVisibility);

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
        if (mode === 'edit') {
            drawEditModeHatch();
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
                drawRect(shape, revealedShapeIds.has(shape.id) ? revealedStyle : occlusionStyle, false);
                if (shape.id === focusedShapeId) {
                    drawFocusOutline(shape);
                }
            }
            const ordered = shapesInTabOrder();
            if (showNumbers && tabOrderCache!.isFinal) {
                const size = shapeNumberSize();
                const opacity = shapeNumberOpacity();
                for (const [index, shape] of ordered.entries()) {
                    // A revealed shape's number would cover the answer.
                    if (!revealedShapeIds.has(shape.id)) {
                        drawShapeNumber(shape, index + 1, size, opacity);
                    }
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

    function drawEditModeHatch(): void {
        const topLeft = canvasToImage(viewport, { x: 0, y: 0 });
        const bottomRight = canvasToImage(viewport, { x: canvas.clientWidth, y: canvas.clientHeight });
        const minOffset = Math.floor((topLeft.x + topLeft.y) / EDIT_MODE_HATCH_SPACING_PX) * EDIT_MODE_HATCH_SPACING_PX;
        const maxOffset = Math.ceil((bottomRight.x + bottomRight.y) / EDIT_MODE_HATCH_SPACING_PX) * EDIT_MODE_HATCH_SPACING_PX;

        const diagonalLines = new Path2D();
        for (let offset = minOffset; offset <= maxOffset; offset += EDIT_MODE_HATCH_SPACING_PX) {
            const start = imageToCanvas(viewport, { x: topLeft.x, y: offset - topLeft.x });
            const end = imageToCanvas(viewport, { x: bottomRight.x, y: offset - bottomRight.x });
            diagonalLines.moveTo(start.x, start.y);
            diagonalLines.lineTo(end.x, end.y);
        }

        context.save();
        context.strokeStyle = EDIT_MODE_HATCH_LINE_COLOR;
        context.lineWidth = EDIT_MODE_HATCH_LINE_WIDTH_PX;
        context.stroke(diagonalLines);
        context.restore();
    }

    function drawHandles(rect: Rect): void {
        context.fillStyle = SELECTED_STROKE_STYLE;
        for (const { point } of handlePoints(rect)) {
            const screenPoint = imageToCanvas(viewport, point);
            context.fillRect(
                screenPoint.x - HANDLE_SIZE_PX / 2,
                screenPoint.y - HANDLE_SIZE_PX / 2,
                HANDLE_SIZE_PX,
                HANDLE_SIZE_PX
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
        context.strokeStyle = FOCUS_OUTLINE_STYLE;
        context.lineWidth = 3;
        context.strokeRect(
            topLeft.x - FOCUS_OUTLINE_PADDING_PX,
            topLeft.y - FOCUS_OUTLINE_PADDING_PX,
            width + FOCUS_OUTLINE_PADDING_PX * 2,
            height + FOCUS_OUTLINE_PADDING_PX * 2
        );
        context.restore();
    }

    function shapeNumberSize(): number {
        const shorterSides = shapes.map((shape) => Math.min(shape.width, shape.height)).sort((a, b) => a - b);
        const medianShorterSide = shorterSides[Math.floor(shorterSides.length / 2)] ?? 0;
        return Math.min(SHAPE_NUMBER_SIZE_PX, medianShorterSide * viewport.zoom * SHAPE_NUMBER_MAX_SHAPE_SHARE);
    }

    function drawShapeNumber(rect: Rect, shapeNumber: number, size: number, opacity: number): void {
        const scale = size / SHAPE_NUMBER_SIZE_PX;
        const topLeft = imageToCanvas(viewport, { x: rect.x, y: rect.y });
        const text = String(shapeNumber);
        context.save();
        context.globalAlpha = opacity;
        context.font = `bold ${SHAPE_NUMBER_FONT_SIZE_PX * scale}px system-ui, sans-serif`;
        const width = Math.max(size, context.measureText(text).width + SHAPE_NUMBER_PADDING_PX * scale * 2);
        context.fillStyle = SHAPE_NUMBER_BACKGROUND_STYLE;
        context.fillRect(topLeft.x, topLeft.y, width, size);
        context.fillStyle = SHAPE_NUMBER_TEXT_STYLE;
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.fillText(text, topLeft.x + width / 2, topLeft.y + size / 2);
        context.restore();
    }

    function onWheel(event: WheelEvent): void {
        if (!image) {
            return;
        }
        event.preventDefault();
        const zoomFactor = event.deltaY < 0 ? ZOOM_STEP_PER_WHEEL_TICK : 1 / ZOOM_STEP_PER_WHEEL_TICK;
        viewport = zoomAtCanvasPoint(viewport, toCanvasPoint(event), zoomFactor);
        draw();
        notifyViewportChange();
    }

    function onMouseDown(event: MouseEvent): void {
        if (!image) {
            return;
        }
        if (event.button === MIDDLE_MOUSE_BUTTON || (event.button === LEFT_MOUSE_BUTTON && isPrimaryModifierPressed(event))) {
            startPanning(event);
            return;
        }
        if (event.button !== LEFT_MOUSE_BUTTON) {
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
        lastHoverPoint = toCanvasPoint(event);
        isPanModifierPressed = isPrimaryModifierPressed(event);
        if (isHoverCursorSuppressed()) {
            return;
        }
        updateHoverCursor(lastHoverPoint);
    }

    function isHoverCursorSuppressed(): boolean {
        return !image || Boolean(activeDrag) || Boolean(creatingRect) || Boolean(stopPanning);
    }

    function onContextMenu(event: MouseEvent): void {
        if (isPrimaryModifierPressed(event)) {
            event.preventDefault();
        }
    }

    function onPanModifierKeyDown(event: KeyboardEvent): void {
        if (!isPrimaryModifierKey(event) || isPanModifierPressed || isBlockedByInputOrDialog()) {
            return;
        }
        isPanModifierPressed = true;
        refreshCursorForModifierChange();
    }

    function onPanModifierKeyUp(event: KeyboardEvent): void {
        if (!isPrimaryModifierKey(event)) {
            return;
        }
        isPanModifierPressed = false;
        refreshCursorForModifierChange();
    }

    function onWindowBlur(): void {
        if (!isPanModifierPressed) {
            return;
        }
        isPanModifierPressed = false;
        refreshCursorForModifierChange();
    }

    function refreshCursorForModifierChange(): void {
        if (isHoverCursorSuppressed() || !lastHoverPoint) {
            return;
        }
        updateHoverCursor(lastHoverPoint);
    }

    function updateHoverCursor(canvasPoint: Point): void {
        if (isPanModifierPressed) {
            canvas.style.cursor = 'grab';
            return;
        }
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
            if (Math.hypot(screenPoint.x - canvasPoint.x, screenPoint.y - canvasPoint.y) <= HANDLE_HIT_RADIUS_PX) {
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
        startRectDrag(
            { kind: 'move', shapeId: shape.id, original, startCanvasPoint, current: original },
            function computeNext(delta) {
                return clampMoveToBounds(moveRect(original, delta.x, delta.y), imageBounds());
            }
        );
    }

    function startResizing(shape: RectangleShape, handle: ResizeHandle, startCanvasPoint: Point): void {
        const original: Rect = { x: shape.x, y: shape.y, width: shape.width, height: shape.height };
        startRectDrag(
            { kind: 'resize', shapeId: shape.id, handle, original, startCanvasPoint, current: original },
            function computeNext(delta) {
                return clampRectToBounds(resizeRect(original, handle, delta.x, delta.y), imageBounds());
            }
        );
    }

    function startRectDrag(drag: ActiveDrag, computeNext: (delta: Point) => Rect): void {
        activeDrag = drag;
        draw();

        startDragSession(function onMouseMove(moveEvent) {
            const current = activeDrag;
            if (!current || current.kind !== drag.kind || current.shapeId !== drag.shapeId) {
                return;
            }
            const delta = imagePointDelta(drag.startCanvasPoint, toCanvasPoint(moveEvent));
            activeDrag = { ...drag, current: computeNext(delta) };
            draw();
        }, finishDrag);
    }

    function finishDrag(): void {
        if (!activeDrag) {
            return;
        }
        const { shapeId, original, current } = activeDrag;
        activeDrag = null;
        if (!rectsEqual(original, current)) {
            callbacks.onUpdateShapeRect(shapeId, current);
        }
        draw();
    }

    function startPanning(event: MouseEvent): void {
        event.preventDefault();
        canvas.style.cursor = 'grabbing';
        const isMiddleButtonPan = event.button === MIDDLE_MOUSE_BUTTON;
        const startPoint = toCanvasPoint(event);
        let lastPoint = startPoint;
        let didPan = false;

        stopPanning = startDragSession(function onMouseMove(moveEvent) {
            const point = toCanvasPoint(moveEvent);
            if (!didPan && Math.hypot(point.x - startPoint.x, point.y - startPoint.y) >= CLICK_DRAG_THRESHOLD_PX) {
                didPan = true;
            }
            viewport = panViewport(viewport, point.x - lastPoint.x, point.y - lastPoint.y);
            lastPoint = point;
            draw();
            notifyViewportChange();
        }, function onMouseUp(upEvent) {
            if (didPan && isMiddleButtonPan) {
                upEvent.preventDefault();
                window.addEventListener('auxclick', suppressMiddleClickPaste, { capture: true, once: true });
            }
        }, function finishPanning() {
            stopPanning = null;
            updateHoverCursor(lastPoint);
        });
    }

    function suppressMiddleClickPaste(event: MouseEvent): void {
        event.preventDefault();
    }

    function startCreating(startCanvasPoint: Point): void {
        creatingRect = { start: startCanvasPoint, current: startCanvasPoint };
        draw();

        startDragSession(function onMouseMove(moveEvent) {
            if (!creatingRect) {
                return;
            }
            creatingRect = { start: creatingRect.start, current: toCanvasPoint(moveEvent) };
            draw();
        }, finishCreating);
    }

    function finishCreating(): void {
        const rect = creatingRect;
        creatingRect = null;
        if (!rect || !image) {
            draw();
            return;
        }
        const dragDistance = Math.hypot(rect.current.x - rect.start.x, rect.current.y - rect.start.y);
        if (dragDistance < CLICK_DRAG_THRESHOLD_PX) {
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

    function canDeleteSelectedShape(): boolean {
        return mode === 'edit' && document.activeElement === canvas && selectedShapeId !== null;
    }

    function deleteSelectedShape(): void {
        callbacks.onDeleteSelected();
    }

    // Recomputed only when the shapes or the page's numbering change: the shape array is replaced on every edit, never
    // mutated. Rows numbering is plain reading order. Smart numbering's order comes from the image analysis, which runs
    // in a worker: until it has given the order, no numbers are shown (numbers changing as the order arrives would
    // flicker) and Tab follows plain reading order. The canvas's data-numbering says which ('pending' or 'final').
    function shapesInTabOrder(): RectangleShape[] {
        if (tabOrderCache?.shapes !== shapes || tabOrderCache.numbering !== numbering) {
            const order = image && numbering !== 'rows' ? imageAnalysis.orderOf(image, shapes, () => {
                numbersArrivedAt = performance.now();
                tabOrderCache = null;
                draw();
            }) : null;
            const byId = new Map(shapes.map((shape) => [shape.id, shape]));
            const isFinal = order !== null || !image || numbering === 'rows';
            tabOrderCache = { shapes, numbering, ordered: order ? order.map((id) => byId.get(id)!) : shapesInReadingOrder(shapes), isFinal };
            canvas.dataset.numbering = isFinal ? 'final' : 'pending';
        }
        return tabOrderCache.ordered;
    }

    // The numbers' opacity while they fade in after arriving (eased out), drawing the fade's next frame; 1 otherwise.
    function shapeNumberOpacity(): number {
        const elapsed = numbersArrivedAt === null ? Infinity : performance.now() - numbersArrivedAt;
        if (elapsed >= SHAPE_NUMBER_FADE_MS || matchMedia('(prefers-reduced-motion: reduce)').matches) {
            numbersArrivedAt = null;
            return 1;
        }
        fadeFrame ??= requestAnimationFrame(() => {
            fadeFrame = null;
            draw();
        });
        const progress = elapsed / SHAPE_NUMBER_FADE_MS;
        return 1 - (1 - progress) ** 2;
    }

    function hasShapeKeyboardFocus(): boolean {
        return mode === 'study' && shapes.length > 0 && (isFullscreen || document.activeElement === canvas);
    }

    function focusedShapeIndex(ordered: RectangleShape[]): number {
        return ordered.findIndex(function isFocused(shape) {
            return shape.id === focusedShapeId;
        });
    }

    function canCycleFocusedShape(direction: 1 | -1): boolean {
        if (!hasShapeKeyboardFocus()) {
            return false;
        }
        // Windowed, Tab past the last shape (or Shift+Tab before the first) falls through to the browser
        // and leaves the canvas instead of wrapping, so the canvas never traps keyboard focus.
        const edgeIndex = direction === 1 ? shapes.length - 1 : 0;
        return isFullscreen || focusedShapeIndex(shapesInTabOrder()) !== edgeIndex;
    }

    function cycleFocusedShape(direction: 1 | -1): void {
        const ordered = shapesInTabOrder();
        const currentIndex = focusedShapeIndex(ordered);
        const nextIndex = cycleFocusedShapeIndex(currentIndex === -1 ? null : currentIndex, direction, ordered.length);
        focusedShapeId = ordered[nextIndex].id;
        draw();
    }

    function canToggleFocusedShapeVisibility(): boolean {
        return hasShapeKeyboardFocus() && focusedShapeId !== null;
    }

    function onCanvasBlur(): void {
        if (!isFullscreen && focusedShapeId !== null) {
            focusedShapeId = null;
            draw();
        }
    }

    function toggleFocusedShapeVisibility(): void {
        callbacks.onToggleVisibility(focusedShapeId!);
    }

    function toCanvasPoint(event: MouseEvent): Point {
        const rect = canvas.getBoundingClientRect();
        return { x: event.clientX - rect.left, y: event.clientY - rect.top };
    }

    return {
        update(nextShapes: RectangleShape[], nextSelectedShapeId: string | null, nextMode: Mode, nextNumbering: NumberingMode, nextShowNumbers: boolean, nextRevealedShapeIds: ReadonlySet<string>): void {
            shapes = nextShapes;
            selectedShapeId = nextSelectedShapeId;
            if (mode !== nextMode) {
                canvas.style.cursor = 'default';
                focusedShapeId = null;
            }
            mode = nextMode;
            numbering = nextNumbering;
            showNumbers = nextShowNumbers;
            revealedShapeIds = nextRevealedShapeIds;
            draw();
        },
        setFullscreen(nextIsFullscreen: boolean): void {
            isFullscreen = nextIsFullscreen;
            focusedShapeId = null;
            refitViewport();
            fullscreenToggleFit = viewport;
            draw();
        },
        isReady(): boolean {
            return image !== null;
        },
        getZoom(): number {
            return viewport.zoom;
        },
        setZoom(zoom: number): void {
            applyZoom(zoom);
        },
        fitToView(): void {
            refitViewport();
            draw();
        },
        onViewportChange(callback: () => void): () => void {
            viewportChangeListeners.add(callback);
            return function unsubscribe() {
                viewportChangeListeners.delete(callback);
            };
        },
        destroy(): void {
            if (fadeFrame !== null) {
                cancelAnimationFrame(fadeFrame);
            }
            stopPanning?.();
            resizeObserver.disconnect();
            loadedImage.removeEventListener('load', onImageLoad);
            loadedImage.removeEventListener('error', onImageError);
            canvas.removeEventListener('wheel', onWheel);
            canvas.removeEventListener('mousedown', onMouseDown);
            canvas.removeEventListener('mousemove', onHoverMove);
            canvas.removeEventListener('contextmenu', onContextMenu);
            canvas.removeEventListener('blur', onCanvasBlur);
            window.removeEventListener('keydown', onPanModifierKeyDown);
            window.removeEventListener('keyup', onPanModifierKeyUp);
            window.removeEventListener('blur', onWindowBlur);
            unregisterShortcut('deleteSelectedShape');
            unregisterShortcut('cycleFocusedShapeNext');
            unregisterShortcut('cycleFocusedShapePrev');
            unregisterShortcut('toggleFocusedShapeVisibility');
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

function getContext2d(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
    const context = canvas.getContext('2d');
    if (!context) {
        throw new Error('Canvas 2D context is not available');
    }
    return context;
}
