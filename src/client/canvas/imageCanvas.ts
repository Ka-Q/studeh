import { canvasToImage, fitViewport, imageToCanvas, panViewport, zoomAtCanvasPoint, zoomToLevelAtCanvasPoint, type Point, type Size, type Viewport } from './viewport';
import {
    boundingRect,
    clampMoveToBounds,
    clampRectToBounds,
    handlePoint,
    handlePoints,
    isRectEmpty,
    moveRect,
    offsetCopyRect,
    rectCenter,
    rectCorners,
    rectFromPoints,
    rectsEqual,
    resizeRect,
    rotatedHandleDirection,
    rotationHandlePoint,
    rotationOf,
    rotationTowards,
    topmostShapeAt,
    type Rect,
    type ResizeHandle,
    type RotatedRect
} from '../shapes/rectangle';
import type { RectangleShape } from '../../shared/types';
import type { Mode } from '../document/state';
import { iconSpan, isBlockedByInputOrDialog, startDragSession } from '../dom';
import { registerShortcut, unregisterShortcut } from '../shortcutDispatch';
import { shortcutHint } from '../shortcuts';
import { imageAnalysis, type AnalysedShape } from '../imageAnalysis/analysisClient';
import { shapesInReadingOrder } from '../shapes/rectangle';

// The order shapes are numbered in: by the image analysis or in plain rows.
export type NumberingMode = 'smart' | 'rows';

export interface ImageCanvasCallbacks {
    onCreateShape(rect: Rect): void;
    onSelectShape(shapeId: string | null): void;
    onUpdateShapeRect(shapeId: string, rect: RotatedRect): void;
    onDeleteSelected(): void;
    onCloneSelected(rect: Rect): void;
    onToggleVisibility(shapeId: string): void;
}

type ActiveDrag =
    | { kind: 'move' | 'rotate'; shapeId: string; original: RotatedRect; startCanvasPoint: Point; current: RotatedRect }
    | { kind: 'resize'; shapeId: string; handle: ResizeHandle; original: RotatedRect; startCanvasPoint: Point; current: RotatedRect };

export interface ImageCanvasHandle {
    update(shapes: RectangleShape[], selectedShapeId: string | null, mode: Mode, numbering: NumberingMode, showNumbers: boolean, revealedShapeIds: ReadonlySet<string>): void;
    setFullscreen(isFullscreen: boolean): void;
    destroy(): void;
    isReady(): boolean;
    getZoom(): number;
    setZoom(zoom: number): void;
    // Moves the image by the screen distance, as dragging it would.
    panBy(dx: number, dy: number): void;
    // Moves the view a step towards x/y (-1, 0 or 1 each), as scrolling would.
    panByStep(x: number, y: number): void;
    fitToView(): void;
    onViewportChange(callback: () => void): () => void;
}

const MIDDLE_MOUSE_BUTTON = 1;
const LEFT_MOUSE_BUTTON = 0;
const ZOOM_STEP_PER_WHEEL_TICK = 1.1;
const CLICK_DRAG_THRESHOLD_PX = 3;
// A keyboard pan step, as a share of the canvas along the axis: key-repeat glides, a single press stays fine-grained.
const PAN_STEP_RATIO = 0.1;
const FIT_VIEW_HORIZONTAL_PADDING_PX = 64;
const HANDLE_HIT_RADIUS_PX = 6;
const HANDLE_SIZE_PX = 8;
// From the shape's top edge to the rotation handle's centre.
const ROTATION_HANDLE_OFFSET_PX = 24;
// The radius the rotation handle's icon (mode-toggle at 22px) draws its arrows round.
const ROTATION_HANDLE_ICON_RADIUS_PX = 8;
const ROTATION_SNAP_DEGREES = 45;
// In screen pixels, so a clone sits visibly apart from its original at any zoom.
const CLONE_OFFSET_PX = 12;
const SHAPE_ACTIONS_GAP_PX = 8;
const SHAPE_ACTIONS_EDGE_MARGIN_PX = 4;
const UNSELECTED_STROKE_STYLE = 'rgba(37, 99, 235, 0.9)';
const UNSELECTED_FILL_STYLE = 'rgba(37, 99, 235, 0.15)';
const SELECTED_STROKE_STYLE = 'rgba(220, 38, 38, 0.95)';
const SELECTED_FILL_STYLE = 'rgba(220, 38, 38, 0.2)';
// A dark edge round the selection's outline, handles and icons (the icons' is in the CSS), so they show on dark or busy
// images too.
const SELECTION_CASING_STYLE = 'rgba(0, 0, 0, 0.55)';
const SELECTION_CASING_PX = 1;
const OCCLUSION_FILL_STYLE = 'rgb(121, 122, 123)';
const OCCLUSION_STROKE_STYLE = 'rgb(213, 35, 35)';
const REVEALED_FILL_STYLE = 'rgba(242, 242, 242, 0.05)';
const REVEALED_STROKE_STYLE = 'rgb(68, 202, 31)';
const FOCUS_OUTLINE_STYLE = 'rgb(37, 99, 235)';
const FOCUS_OUTLINE_PADDING_PX = 4;
const SHAPE_NUMBER_FONT = 'bold 11px system-ui, sans-serif';
const SHAPE_NUMBER_SIZE_PX = 16;
const SHAPE_NUMBER_PADDING_PX = 4;
const SHAPE_NUMBER_BACKGROUND_STYLE = 'rgba(17, 24, 39, 0.8)';
const SHAPE_NUMBER_TEXT_STYLE = 'rgb(255, 255, 255)';
// Numbers given by the image analysis after the page is shown fade in over this long, rather than popping in.
const SHAPE_NUMBER_FADE_MS = 250;
// Transparent areas of an image show as white, the usual backdrop for diagrams.
const IMAGE_BACKDROP_STYLE = 'rgb(255, 255, 255)';
// Past this size (device pixels per side) the page isn't kept scaled to the zoom; it is drawn from the image itself.
const MAX_SCALED_IMAGE_SIDE_PX = 4096;
// How long the zoom holds still before the page's copy at it is made.
const ZOOM_SETTLE_MS = 150;
const EDIT_MODE_HATCH_SPACING_PX = 256;
const EDIT_MODE_HATCH_LINE_WIDTH_PX = 1;
const EDIT_MODE_HATCH_LINE_COLOR = 'rgba(106, 106, 106, 0.2)';
interface RectStyle {
    fill: string | null;
    stroke: string;
    lineWidth: number;
    isCased?: boolean;
}
const unselectedStyle: RectStyle = { fill: UNSELECTED_FILL_STYLE, stroke: UNSELECTED_STROKE_STYLE, lineWidth: 2 };
const selectedStyle: RectStyle = { fill: SELECTED_FILL_STYLE, stroke: SELECTED_STROKE_STYLE, lineWidth: 2, isCased: true };
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
    const shapeActions = buildShapeActions();
    const rotationHandle = buildRotationHandle();
    container.append(shapeActions, rotationHandle);

    let image: HTMLImageElement | null = null;
    let scaledImage: HTMLCanvasElement | null = null;
    let lastDrawnZoom: number | null = null;
    let zoomSettleTimer: ReturnType<typeof setTimeout> | undefined;
    const elementSizes = new Map<HTMLElement, Size>();
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
    // When the image analysis's order arrived while the page was shown.
    let numbersArrivedAt: number | null = null;
    let drawFrame: number | null = null;
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
        // Asked for in edit mode too, so the order is usually known by the time study mode shows it. A page whose order
        // is already known isn't analysed again.
        shapesInTabOrder();
        refitViewport();
        draw();
        canvas.dataset.image = 'loaded';
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

    function panBy(dx: number, dy: number): void {
        viewport = panViewport(viewport, dx, dy);
        draw();
        notifyViewportChange();
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
    canvas.addEventListener('blur', onCanvasBlur);
    window.addEventListener('keydown', onPanModifierKeyDown);
    window.addEventListener('keyup', onPanModifierKeyUp);
    window.addEventListener('blur', onWindowBlur);
    registerShortcut('deleteSelectedShape', deleteSelectedShape, canEditSelectedShape);
    registerShortcut('cloneSelectedShape', cloneSelectedShape, canEditSelectedShape);
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
        shapeActions.hidden = true;
        rotationHandle.hidden = true;
        if (!image) {
            return;
        }
        if (mode === 'edit') {
            drawEditModeHatch();
        }
        drawPageImage(image);
        if (mode === 'study') {
            for (const shape of shapes) {
                drawRect(shape, revealedShapeIds.has(shape.id) ? revealedStyle : occlusionStyle, false);
                if (shape.id === focusedShapeId) {
                    drawFocusOutline(shape);
                }
            }
            const ordered = shapesInTabOrder();
            if (showNumbers && tabOrderCache!.isFinal) {
                const opacity = shapeNumberOpacity();
                for (const [index, shape] of ordered.entries()) {
                    // A revealed shape's number would cover the answer.
                    if (!revealedShapeIds.has(shape.id)) {
                        drawShapeNumber(shape, index + 1, opacity);
                    }
                }
            }
            return;
        }
        for (const shape of shapes) {
            const rect = activeDrag?.shapeId === shape.id ? activeDrag.current : shape;
            drawRect(rect, shape.id === selectedShapeId && !creatingRect ? selectedStyle : unselectedStyle, false);
        }
        if (creatingRect) {
            drawRect(rectFromPoints(creatingRect.start, creatingRect.current), unselectedStyle, true);
        }
        const selectedRect = selectedShapeRect();
        if (selectedRect) {
            placeRotationHandle(selectedRect);
            drawHandles(selectedRect);
            placeShapeActions(selectedRect);
        }
    }

    // Drawn from a copy already scaled to the zoom, at a whole device pixel, so a pan frame is a plain pixel copy rather
    // than a resampling of the whole image (slow where the browser draws canvases without the GPU, as Firefox on Linux).
    // The copy is made once the zoom holds still: while it keeps changing, each copy would be used once. It is made then
    // rather than on the next pan, whose first frame would otherwise wait for it.
    function drawPageImage(source: HTMLImageElement): void {
        const devicePixelRatio = window.devicePixelRatio || 1;
        const width = Math.max(1, Math.round(source.naturalWidth * viewport.zoom * devicePixelRatio));
        const height = Math.max(1, Math.round(source.naturalHeight * viewport.zoom * devicePixelRatio));
        const isZoomChanging = viewport.zoom !== lastDrawnZoom;
        lastDrawnZoom = viewport.zoom;
        if (scaledImage?.width !== width || scaledImage.height !== height) {
            const isTooLarge = width > MAX_SCALED_IMAGE_SIDE_PX || height > MAX_SCALED_IMAGE_SIDE_PX;
            if (isZoomChanging || isTooLarge) {
                if (!isTooLarge) {
                    clearTimeout(zoomSettleTimer);
                    zoomSettleTimer = setTimeout(drawNextFrame, ZOOM_SETTLE_MS);
                }
                const imageWidth = source.naturalWidth * viewport.zoom;
                const imageHeight = source.naturalHeight * viewport.zoom;
                context.fillStyle = IMAGE_BACKDROP_STYLE;
                context.fillRect(viewport.panX, viewport.panY, imageWidth, imageHeight);
                context.drawImage(source, viewport.panX, viewport.panY, imageWidth, imageHeight);
                return;
            }
            scaledImage = scaleImage(source, width, height);
        }
        context.save();
        context.setTransform(1, 0, 0, 1, 0, 0);
        context.drawImage(scaledImage, Math.round(viewport.panX * devicePixelRatio), Math.round(viewport.panY * devicePixelRatio));
        context.restore();
    }

    function buildShapeActions(): HTMLDivElement {
        const actions = document.createElement('div');
        actions.className = 'shape-actions';
        actions.style.color = SELECTED_STROKE_STYLE;
        actions.hidden = true;
        actions.append(
            buildShapeActionButton('icon-clone', `Clone (${shortcutHint('cloneSelectedShape')})`, cloneSelectedShape),
            buildShapeActionButton('icon-trash', `Delete (${shortcutHint('deleteSelectedShape')})`, deleteSelectedShape)
        );
        return actions;
    }

    function buildShapeActionButton(icon: string, hint: string, onClick: () => void): HTMLButtonElement {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'icon-button';
        button.append(iconSpan(icon));
        button.title = hint;
        button.setAttribute('aria-label', hint);
        // Keeps keyboard focus on the canvas, so its shortcuts keep working after a click.
        button.addEventListener('mousedown', (event) => event.preventDefault());
        button.addEventListener('click', onClick);
        return button;
    }

    // Dragged to rotate the selected shape; it has no click or keyboard action, so it stays out of the tab order.
    function buildRotationHandle(): HTMLButtonElement {
        const hint = 'Rotate (hold Shift to snap to 45°)';
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'icon-button shape-rotation-handle';
        // Drawn in the selected shape's border colour, as if part of its outline.
        button.style.color = SELECTED_STROKE_STYLE;
        button.hidden = true;
        button.tabIndex = -1;
        button.append(iconSpan('icon-mode-toggle'));
        button.title = hint;
        button.setAttribute('aria-label', hint);
        button.addEventListener('mousedown', (event) => {
            // Keeps keyboard focus on the canvas, so its shortcuts keep working after a rotation.
            event.preventDefault();
            const selectedShape = findShape(selectedShapeId);
            if (event.button === LEFT_MOUSE_BUTTON && selectedShape) {
                startRotating(selectedShape, toCanvasPoint(event));
            }
        });
        return button;
    }

    function placeRotationHandle(rect: RotatedRect): void {
        rotationHandle.hidden = false;
        const center = rotationHandleOnCanvas(rect);
        const { width, height } = sizeOf(rotationHandle);
        rotationHandle.style.left = `${center.x - width / 2}px`;
        rotationHandle.style.top = `${center.y - height / 2}px`;
        rotationHandle.style.transform = `rotate(${rotationOf(rect)}deg)`;
    }

    // Upright, off the middle of the shape's own bottom side as the rotation handle is off its top side, so they turn
    // round the shape with it; past the rotation handle when only there they fit in the canvas. They leave the view
    // with the shape.
    function placeShapeActions(rect: RotatedRect): void {
        shapeActions.hidden = false;
        const { width, height } = sizeOf(shapeActions);
        const radians = rotationOf(rect) * Math.PI / 180;
        const down = { x: -Math.sin(radians), y: Math.cos(radians) };
        // From the buttons' centre to past their far side, along the shape's down direction.
        const reach = Math.abs(down.x) * width / 2 + Math.abs(down.y) * height / 2 + SHAPE_ACTIONS_GAP_PX;
        const bottomMiddle = imageToCanvas(viewport, handlePoint(rect, 's'));
        const rotationHandleCenter = rotationHandleOnCanvas(rect);
        const below = { x: bottomMiddle.x + down.x * reach, y: bottomMiddle.y + down.y * reach };
        const aboveDistance = sizeOf(rotationHandle).height / 2 + reach;
        const above = { x: rotationHandleCenter.x - down.x * aboveDistance, y: rotationHandleCenter.y - down.y * aboveDistance };
        const center = !fitsInCanvasHeight(below, height) && fitsInCanvasHeight(above, height) ? above : below;
        shapeActions.style.left = `${center.x - width / 2}px`;
        shapeActions.style.top = `${center.y - height / 2}px`;
    }

    // Measured once shown: reading an element's size on every frame would lay the page out on every frame.
    function sizeOf(element: HTMLElement): Size {
        let size = elementSizes.get(element);
        if (!size) {
            size = { width: element.offsetWidth, height: element.offsetHeight };
            if (size.width > 0) {
                elementSizes.set(element, size);
            }
        }
        return size;
    }

    function fitsInCanvasHeight(center: Point, height: number): boolean {
        return center.y - height / 2 >= SHAPE_ACTIONS_EDGE_MARGIN_PX &&
            center.y + height / 2 <= canvas.clientHeight - SHAPE_ACTIONS_EDGE_MARGIN_PX;
    }

    function selectedShapeRect(): RotatedRect | null {
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

    function drawHandles(rect: RotatedRect): void {
        const topMiddle = imageToCanvas(viewport, rotationHandlePoint(rect, 0));
        // Ends at the icon's arrows: the handle has no background to hide the line under its icon.
        const lineEnd = imageToCanvas(viewport, rotationHandlePoint(rect, (ROTATION_HANDLE_OFFSET_PX - ROTATION_HANDLE_ICON_RADIUS_PX) / viewport.zoom));
        // The dark casing first, all of it, so it never crosses the red where the line meets a handle.
        const passes: [string, number][] = [[SELECTION_CASING_STYLE, SELECTION_CASING_PX], [SELECTED_STROKE_STYLE, 0]];
        for (const [color, casing] of passes) {
            context.strokeStyle = color;
            context.fillStyle = color;
            context.lineWidth = 2 + casing * 2;
            context.beginPath();
            context.moveTo(topMiddle.x, topMiddle.y);
            context.lineTo(lineEnd.x, lineEnd.y);
            context.stroke();
            const size = HANDLE_SIZE_PX + casing * 2;
            for (const { point } of handlePoints(rect)) {
                const screenPoint = imageToCanvas(viewport, point);
                context.fillRect(screenPoint.x - size / 2, screenPoint.y - size / 2, size, size);
            }
        }
    }

    // A preview rect is in canvas coordinates; any other is in image coordinates.
    function drawRect(rect: RotatedRect, style: RectStyle, isPreview: boolean): void {
        context.save();
        context.strokeStyle = style.stroke;
        context.lineWidth = style.lineWidth;
        if (isPreview) {
            context.setLineDash([4, 4]);
            context.strokeRect(rect.x, rect.y, rect.width, rect.height);
        } else {
            const { width, height } = enterRectFrame(rect);
            if (style.fill) {
                context.fillStyle = style.fill;
                context.fillRect(-width / 2, -height / 2, width, height);
            }
            if (style.isCased) {
                context.save();
                context.strokeStyle = SELECTION_CASING_STYLE;
                context.lineWidth = style.lineWidth + SELECTION_CASING_PX * 2;
                context.strokeRect(-width / 2, -height / 2, width, height);
                context.restore();
            }
            context.strokeRect(-width / 2, -height / 2, width, height);
        }
        context.restore();
    }

    function drawFocusOutline(rect: RotatedRect): void {
        context.save();
        context.setLineDash([6, 4]);
        context.strokeStyle = FOCUS_OUTLINE_STYLE;
        context.lineWidth = 3;
        const { width, height } = enterRectFrame(rect);
        context.strokeRect(
            -width / 2 - FOCUS_OUTLINE_PADDING_PX,
            -height / 2 - FOCUS_OUTLINE_PADDING_PX,
            width + FOCUS_OUTLINE_PADDING_PX * 2,
            height + FOCUS_OUTLINE_PADDING_PX * 2
        );
        context.restore();
    }

    // Moves the context's origin to the rect's centre on screen and turns it with the rect; gives the rect's screen size.
    function enterRectFrame(rect: RotatedRect): Size {
        const center = imageToCanvas(viewport, rectCenter(rect));
        context.translate(center.x, center.y);
        context.rotate(rotationOf(rect) * Math.PI / 180);
        return { width: rect.width * viewport.zoom, height: rect.height * viewport.zoom };
    }

    // Upright, hanging from the shape's corner nearest the top left of the page.
    function drawShapeNumber(rect: RotatedRect, shapeNumber: number, opacity: number): void {
        const topLeft = imageToCanvas(viewport, rectCorners(rect).reduce(function nearerTopLeft(best, corner) {
            return corner.x + corner.y < best.x + best.y ? corner : best;
        }));
        const text = String(shapeNumber);
        context.save();
        context.globalAlpha = opacity;
        context.font = SHAPE_NUMBER_FONT;
        const width = Math.max(SHAPE_NUMBER_SIZE_PX, context.measureText(text).width + SHAPE_NUMBER_PADDING_PX * 2);
        context.fillStyle = SHAPE_NUMBER_BACKGROUND_STYLE;
        context.fillRect(topLeft.x, topLeft.y, width, SHAPE_NUMBER_SIZE_PX);
        context.fillStyle = SHAPE_NUMBER_TEXT_STYLE;
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.fillText(text, topLeft.x + width / 2, topLeft.y + SHAPE_NUMBER_SIZE_PX / 2);
        context.restore();
    }

    function onWheel(event: WheelEvent): void {
        if (!image) {
            return;
        }
        event.preventDefault();
        const zoomFactor = event.deltaY < 0 ? ZOOM_STEP_PER_WHEEL_TICK : 1 / ZOOM_STEP_PER_WHEEL_TICK;
        viewport = zoomAtCanvasPoint(viewport, toCanvasPoint(event), zoomFactor);
        drawNextFrame();
        notifyViewportChange();
    }

    function onMouseDown(event: MouseEvent): void {
        if (!image) {
            return;
        }
        if (event.button === MIDDLE_MOUSE_BUTTON || (event.button === LEFT_MOUSE_BUTTON && event.shiftKey)) {
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

        // The selection is kept until the drag ends, so the shape drawn follows it in the selection history.
        startCreating(canvasPoint);
    }

    function onHoverMove(event: MouseEvent): void {
        lastHoverPoint = toCanvasPoint(event);
        isPanModifierPressed = event.shiftKey;
        if (isHoverCursorSuppressed()) {
            return;
        }
        updateHoverCursor(lastHoverPoint);
    }

    function isHoverCursorSuppressed(): boolean {
        return !image || Boolean(activeDrag) || Boolean(creatingRect) || Boolean(stopPanning);
    }

    function onPanModifierKeyDown(event: KeyboardEvent): void {
        if (event.key !== 'Shift' || isPanModifierPressed || isBlockedByInputOrDialog()) {
            return;
        }
        isPanModifierPressed = true;
        refreshCursorForModifierChange();
    }

    function onPanModifierKeyUp(event: KeyboardEvent): void {
        if (event.key !== 'Shift') {
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
        if (selectedShape && handle) {
            canvas.style.cursor = handleCursors[rotatedHandleDirection(handle, rotationOf(selectedShape))];
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

    function handleAtCanvasPoint(rect: RotatedRect, canvasPoint: Point): ResizeHandle | null {
        for (const { handle, point } of handlePoints(rect)) {
            const screenPoint = imageToCanvas(viewport, point);
            if (Math.hypot(screenPoint.x - canvasPoint.x, screenPoint.y - canvasPoint.y) <= HANDLE_HIT_RADIUS_PX) {
                return handle;
            }
        }
        return null;
    }

    function rotationHandleOnCanvas(rect: RotatedRect): Point {
        return imageToCanvas(viewport, rotationHandlePoint(rect, ROTATION_HANDLE_OFFSET_PX / viewport.zoom));
    }

    function imagePointDelta(a: Point, b: Point): Point {
        const imageA = canvasToImage(viewport, a);
        const imageB = canvasToImage(viewport, b);
        return { x: imageB.x - imageA.x, y: imageB.y - imageA.y };
    }

    function imageBounds(): Size {
        return { width: image!.naturalWidth, height: image!.naturalHeight };
    }

    function rectOf(shape: RectangleShape): RotatedRect {
        return { x: shape.x, y: shape.y, width: shape.width, height: shape.height, rotation: rotationOf(shape) };
    }

    function startMoving(shape: RectangleShape, startCanvasPoint: Point): void {
        const original = rectOf(shape);
        startRectDrag(
            { kind: 'move', shapeId: shape.id, original, startCanvasPoint, current: original },
            function computeNext(delta) {
                return clampMoveToBounds(moveRect(original, delta.x, delta.y), imageBounds());
            }
        );
    }

    // A rotated shape may reach past the image's edges: clamping it would leave its corners at the edge and its sides
    // short of where the pointer is.
    function startResizing(shape: RectangleShape, handle: ResizeHandle, startCanvasPoint: Point): void {
        const original = rectOf(shape);
        startRectDrag(
            { kind: 'resize', shapeId: shape.id, handle, original, startCanvasPoint, current: original },
            function computeNext(delta) {
                const resized = resizeRect(original, handle, delta.x, delta.y);
                return original.rotation ? resized : clampRectToBounds(resized, imageBounds());
            }
        );
    }

    function startRotating(shape: RectangleShape, startCanvasPoint: Point): void {
        const original = rectOf(shape);
        const center = rectCenter(original);
        canvas.style.cursor = 'grabbing';
        startRectDrag(
            { kind: 'rotate', shapeId: shape.id, original, startCanvasPoint, current: original },
            function computeNext(_delta, moveEvent) {
                const pointer = canvasToImage(viewport, toCanvasPoint(moveEvent));
                return { ...original, rotation: rotationTowards(center, pointer, moveEvent.shiftKey ? ROTATION_SNAP_DEGREES : undefined) };
            }
        );
    }

    function startRectDrag(drag: ActiveDrag, computeNext: (delta: Point, moveEvent: MouseEvent) => RotatedRect): void {
        activeDrag = drag;
        draw();

        startDragSession(function onMouseMove(moveEvent) {
            const current = activeDrag;
            if (!current || current.kind !== drag.kind || current.shapeId !== drag.shapeId) {
                return;
            }
            const delta = imagePointDelta(drag.startCanvasPoint, toCanvasPoint(moveEvent));
            activeDrag = { ...drag, current: computeNext(delta, moveEvent) };
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
            callbacks.onSelectShape(null);
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
        if (isRectEmpty(imageRect)) {
            callbacks.onSelectShape(null);
        } else {
            callbacks.onCreateShape(imageRect);
        }
    }

    function canEditSelectedShape(): boolean {
        return mode === 'edit' && document.activeElement === canvas && selectedShapeId !== null;
    }

    function deleteSelectedShape(): void {
        callbacks.onDeleteSelected();
    }

    function cloneSelectedShape(): void {
        const selectedShape = findShape(selectedShapeId);
        if (selectedShape && image) {
            callbacks.onCloneSelected(offsetCopyRect(selectedShape, CLONE_OFFSET_PX / viewport.zoom, imageBounds()));
        }
    }

    // Recomputed only when the shapes or the page's numbering change: the shape array is replaced on every edit, never
    // mutated. Rows numbering is plain reading order. Smart numbering's order comes from the image analysis, which runs
    // in a worker: until it has given the order, no numbers are shown (numbers changing as the order arrives would
    // flicker) and Tab follows plain reading order. The canvas's data-numbering says which ('pending' or 'final').
    function shapesInTabOrder(): RectangleShape[] {
        if (tabOrderCache?.shapes !== shapes || tabOrderCache.numbering !== numbering) {
            const order = image && numbering !== 'rows' ? imageAnalysis.orderOf(image, analysedShapes(), () => {
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

    // A rotated shape is analysed as its bounding box, kept to the image.
    function analysedShapes(): AnalysedShape[] {
        return shapes.map((shape) => ({ id: shape.id, ...clampRectToBounds(boundingRect(shape), imageBounds()) }));
    }

    // The numbers' opacity while they fade in after arriving (eased out), drawing the fade's next frame; 1 otherwise.
    function shapeNumberOpacity(): number {
        const elapsed = numbersArrivedAt === null ? Infinity : performance.now() - numbersArrivedAt;
        if (elapsed >= SHAPE_NUMBER_FADE_MS || matchMedia('(prefers-reduced-motion: reduce)').matches) {
            numbersArrivedAt = null;
            return 1;
        }
        drawNextFrame();
        const progress = elapsed / SHAPE_NUMBER_FADE_MS;
        return 1 - (1 - progress) ** 2;
    }

    // Once however often it is asked for before the frame: wheel events, unlike mouse moves, can come several a frame.
    function drawNextFrame(): void {
        drawFrame ??= requestAnimationFrame(() => {
            drawFrame = null;
            draw();
        });
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
        panBy,
        panByStep(x: number, y: number): void {
            panBy(-x * canvas.clientWidth * PAN_STEP_RATIO, -y * canvas.clientHeight * PAN_STEP_RATIO);
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
            if (drawFrame !== null) {
                cancelAnimationFrame(drawFrame);
            }
            clearTimeout(zoomSettleTimer);
            stopPanning?.();
            resizeObserver.disconnect();
            loadedImage.removeEventListener('load', onImageLoad);
            loadedImage.removeEventListener('error', onImageError);
            canvas.removeEventListener('wheel', onWheel);
            canvas.removeEventListener('mousedown', onMouseDown);
            canvas.removeEventListener('mousemove', onHoverMove);
            canvas.removeEventListener('blur', onCanvasBlur);
            window.removeEventListener('keydown', onPanModifierKeyDown);
            window.removeEventListener('keyup', onPanModifierKeyUp);
            window.removeEventListener('blur', onWindowBlur);
            unregisterShortcut('deleteSelectedShape');
            unregisterShortcut('cloneSelectedShape');
            unregisterShortcut('cycleFocusedShapeNext');
            unregisterShortcut('cycleFocusedShapePrev');
            unregisterShortcut('toggleFocusedShapeVisibility');
            canvas.remove();
            shapeActions.remove();
            rotationHandle.remove();
        }
    };
}

function cycleFocusedShapeIndex(current: number | null, direction: 1 | -1, length: number): number {
    if (current === null) {
        return direction === 1 ? 0 : length - 1;
    }
    return (current + direction + length) % length;
}

// The image at the given size on its backdrop.
function scaleImage(source: HTMLImageElement, width: number, height: number): HTMLCanvasElement {
    const scaled = document.createElement('canvas');
    scaled.width = width;
    scaled.height = height;
    // Opaque, so drawing it is a plain copy rather than a blend.
    const context = getContext2d(scaled, { alpha: false });
    context.fillStyle = IMAGE_BACKDROP_STYLE;
    context.fillRect(0, 0, width, height);
    context.drawImage(source, 0, 0, width, height);
    return scaled;
}

function getContext2d(canvas: HTMLCanvasElement, settings?: CanvasRenderingContext2DSettings): CanvasRenderingContext2D {
    const context = canvas.getContext('2d', settings);
    if (!context) {
        throw new Error('Canvas 2D context is not available');
    }
    return context;
}
