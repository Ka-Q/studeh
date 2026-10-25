import { canvasToImage, fitViewport, imageToCanvas, panViewport, zoomAtCanvasPoint, zoomToLevelAtCanvasPoint, type Point, type Size, type Viewport } from './viewport';
import {
    boundingRect,
    boundingRectOfAll,
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
    rectsIntersect,
    resizeRect,
    rotatedHandleDirection,
    rotationHandlePoint,
    rotationOf,
    rotationTowards,
    topmostShapeAt,
    turnRect,
    type Rect,
    type ResizeHandle,
    type RotatedRect
} from '../shapes/rectangle';
import { colorWithAlpha, hiddenFillOf, isLightColor } from '../shapes/shapeColor';
import type { RectangleShape } from '../../shared/types';
import type { Mode } from '../document/state';
import { buildColorPicker, type ColorPicker } from './colorPicker';
import { iconSpan, isBlockedByInputOrDialog, isPrimaryModifierPressed, startDragSession } from '../dom';
import { registerShortcut, unregisterShortcut } from '../shortcutDispatch';
import { shortcutHint } from '../shortcuts';
import { imageAnalysis, type AnalysedShape } from '@studeh/image-analysis';
import { shapesInReadingOrder } from '../shapes/rectangle';

// The order shapes are numbered in: by the image analysis or in plain rows.
export type NumberingMode = 'smart' | 'rows';

export interface ImageCanvasCallbacks {
    onCreateShape(rect: Rect): void;
    onSelectShapes(shapeIds: readonly string[]): void;
    onUpdateShapeRects(rects: ReadonlyMap<string, RotatedRect>): void;
    onDeleteSelected(): void;
    // The copies go this far from the selected shapes.
    onCloneSelected(dx: number, dy: number): void;
    onToggleVisibility(shapeId: string): void;
    // A null colour means the default look.
    onColorSelected(color: string | null): void;
}

interface ActiveDrag {
    kind: 'move' | 'rotate' | 'resize';
    // The shape dragged, or whose handle is.
    shapeId: string;
    originals: ReadonlyMap<string, RotatedRect>;
    startCanvasPoint: Point;
    current: ReadonlyMap<string, RotatedRect>;
}

// An area dragged out on the canvas, in canvas coordinates.
interface DraggedArea {
    start: Point;
    current: Point;
}

export interface ImageCanvasHandle {
    update(shapes: RectangleShape[], selectedShapeIds: readonly string[], mode: Mode, numbering: NumberingMode, showNumbers: boolean, revealedShapeIds: ReadonlySet<string>): void;
    setFullscreen(isFullscreen: boolean): void;
    // Boxes shown over the page as a preview (edit mode only), instead of the page's own shapes; null ends the preview.
    setPreviewBoxes(boxes: readonly RotatedRect[] | null): void;
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
const HANDLE_HIT_RADIUS_PX = 8;
const HANDLE_RADIUS_PX = 5;
const HANDLE_RING_PX = 1.5;
// From the shape's top edge to the rotation handle's centre.
const ROTATION_HANDLE_OFFSET_PX = 30;
// The radius of the rotation handle's round button (the CSS's, 22px across).
const ROTATION_HANDLE_RADIUS_PX = 11;
const ROTATION_SNAP_DEGREES = 45;
// In screen pixels, so a clone sits visibly apart from its original at any zoom.
const CLONE_OFFSET_PX = 12;
const SHAPE_ACTIONS_GAP_PX = 8;
const SHAPE_ACTIONS_EDGE_MARGIN_PX = 4;
const PREVIEW_BOX_STROKE_STYLE = 'rgba(217, 119, 6, 0.95)';
const PREVIEW_BOX_FILL_STYLE = 'rgba(245, 158, 11, 0.22)';
const UNSELECTED_STROKE_STYLE = 'rgba(37, 99, 235, 0.62)';
const UNSELECTED_FILL_STYLE = 'rgba(37, 99, 235, 0.1)';
const SELECTED_STROKE_STYLE = 'rgba(37, 99, 235, 0.95)';
const SELECTED_FILL_STYLE = 'rgba(37, 99, 235, 0.38)';
// An edge round the selection's outline, so it shows on dark or busy images too: white, or dark for a light custom colour.
const SELECTION_CASING_STYLE = 'rgba(255, 255, 255, 0.9)';
const DARK_SELECTION_CASING_STYLE = 'rgba(15, 35, 80, 0.85)';
const SELECTION_CASING_PX = 1;
const SELECTED_LINE_WIDTH_PX = 3;
const OCCLUSION_LINE_WIDTH_PX = 3;
const HANDLE_SHADOW_STYLE = 'rgba(15, 35, 80, 0.4)';
const HANDLE_FILL_STYLE = 'rgb(255, 255, 255)';
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
    // Drawn inside the shape's edge instead of centred on it, so a thick line doesn't grow outwards over the page.
    isInset?: boolean;
    casing?: string;
    dash?: number[];
}
const unselectedStyle: RectStyle = { fill: UNSELECTED_FILL_STYLE, stroke: UNSELECTED_STROKE_STYLE, lineWidth: 2 };
const selectedStyle: RectStyle = { fill: SELECTED_FILL_STYLE, stroke: SELECTED_STROKE_STYLE, lineWidth: SELECTED_LINE_WIDTH_PX, isCased: true };
const occlusionStyle: RectStyle = { fill: OCCLUSION_FILL_STYLE, stroke: OCCLUSION_STROKE_STYLE, lineWidth: OCCLUSION_LINE_WIDTH_PX, isInset: true };
const revealedStyle: RectStyle = { fill: REVEALED_FILL_STYLE, stroke: REVEALED_STROKE_STYLE, lineWidth: 3 };
const CUSTOM_UNSELECTED_FILL_ALPHA = 0.15;
const CUSTOM_SELECTED_FILL_ALPHA = 0.5;
// Auto-occlusion's boxes before they are applied: dashed and tinted, nothing yet a shape of the page.
const previewBoxStyle: RectStyle = { fill: PREVIEW_BOX_FILL_STYLE, stroke: PREVIEW_BOX_STROKE_STYLE, lineWidth: 2, dash: [6, 4] };
const marqueeStyle: RectStyle = { fill: null, stroke: SELECTED_STROKE_STYLE, lineWidth: 1 };
function editStyleOf(shape: RectangleShape, isSelected: boolean): RectStyle {
    const { color } = shape;
    if (!color) {
        return isSelected ? selectedStyle : unselectedStyle;
    }
    return {
        fill: colorWithAlpha(color, isSelected ? CUSTOM_SELECTED_FILL_ALPHA : CUSTOM_UNSELECTED_FILL_ALPHA),
        stroke: color,
        lineWidth: isSelected ? SELECTED_LINE_WIDTH_PX : 2,
        isCased: isSelected,
        casing: isLightColor(color) ? DARK_SELECTION_CASING_STYLE : undefined
    };
}

function studyStyleOf(shape: RectangleShape, isRevealed: boolean): RectStyle {
    const { color } = shape;
    if (!color) {
        return isRevealed ? revealedStyle : occlusionStyle;
    }
    return isRevealed
        ? { fill: null, stroke: color, lineWidth: revealedStyle.lineWidth }
        : { fill: hiddenFillOf(color), stroke: color, lineWidth: occlusionStyle.lineWidth, isInset: true };
}

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
    initialSelectedShapeIds: readonly string[],
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
    let colorPicker!: ColorPicker;
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
    let previewBoxes: readonly RotatedRect[] | null = null;
    let selectedShapeIds = initialSelectedShapeIds;
    let mode = initialMode;
    let numbering = initialNumbering;
    let showNumbers = initialShowNumbers;
    let isFullscreen = initialIsFullscreen;
    let revealedShapeIds = initialRevealedShapeIds;
    // Where Tab carries on from. Only a keyboard move to it draws the focus ring, not a click.
    let focusedShapeId: string | null = null;
    let isFocusRingShown = false;
    let tabOrderCache: { shapes: RectangleShape[]; numbering: NumberingMode; ordered: RectangleShape[]; isFinal: boolean } | null = null;
    // When the image analysis's order arrived while the page was shown.
    let numbersArrivedAt: number | null = null;
    let drawFrame: number | null = null;
    let stopPanning: (() => void) | null = null;
    let creatingRect: DraggedArea | null = null;
    let selectingArea: DraggedArea | null = null;
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
    registerShortcut('deleteSelectedShape', deleteSelectedShapes, canEditSelectedShapes);
    registerShortcut('cloneSelectedShape', cloneSelectedShapes, canEditSelectedShapes);
    registerShortcut('clearShapeSelection', () => callbacks.onSelectShapes([]), canEditSelectedShapes);
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
        if (colorPicker.isOpen() && (mode !== 'edit' || !selectedShapeRect())) {
            closeColorPicker();
        }
        if (!image) {
            return;
        }
        if (mode === 'edit') {
            drawEditModeHatch();
        }
        drawPageImage(image);
        if (mode === 'study') {
            for (const shape of shapes) {
                drawRect(shape, studyStyleOf(shape, revealedShapeIds.has(shape.id)), false);
                if (isFocusRingShown && shape.id === focusedShapeId) {
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
        const highlightedIds = new Set(creatingRect ? [] : [...selectedShapeIds, ...shapeIdsTouchedBy(selectingArea)]);
        if (previewBoxes) {
            for (const box of previewBoxes) {
                drawRect(box, previewBoxStyle, false);
            }
            return;
        }
        for (const shape of shapes) {
            drawRect(activeDrag?.current.get(shape.id) ?? shape, editStyleOf(shape, highlightedIds.has(shape.id)), false);
        }
        if (creatingRect) {
            drawRect(rectFromPoints(creatingRect.start, creatingRect.current), unselectedStyle, true);
        }
        if (selectingArea) {
            drawRect(rectFromPoints(selectingArea.start, selectingArea.current), marqueeStyle, true);
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
        actions.hidden = true;
        colorPicker = buildColorPicker((color) => callbacks.onColorSelected(color));
        colorPicker.element.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') {
                event.stopPropagation();
                closeColorPicker();
            }
        });
        const colorButton = buildShapeActionButton('icon-palette', 'Colour', toggleColorPicker);
        colorButton.setAttribute('aria-haspopup', 'dialog');
        actions.append(
            buildShapeActionButton('icon-clone', `Clone (${shortcutHint('cloneSelectedShape')})`, cloneSelectedShapes),
            colorButton,
            buildShapeActionButton('icon-trash', `Delete (${shortcutHint('deleteSelectedShape')})`, deleteSelectedShapes),
            colorPicker.element
        );
        return actions;
    }

    function toggleColorPicker(): void {
        if (colorPicker.isOpen()) {
            closeColorPicker();
            return;
        }
        const actionsBox = shapeActions.getBoundingClientRect();
        const canvasBox = canvas.getBoundingClientRect();
        const opensUpward = actionsBox.top - canvasBox.top > canvasBox.bottom - actionsBox.bottom;
        colorPicker.open(lastSelectedShape()?.color, opensUpward);
        window.addEventListener('mousedown', closeColorPickerOnOutsideClick);
    }

    function closeColorPicker(): void {
        colorPicker.close();
        window.removeEventListener('mousedown', closeColorPickerOnOutsideClick);
        canvas.focus();
    }

    function closeColorPickerOnOutsideClick(event: MouseEvent): void {
        if (!shapeActions.contains(event.target as Node)) {
            closeColorPicker();
        }
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
        button.hidden = true;
        button.tabIndex = -1;
        button.append(iconSpan('icon-mode-toggle'));
        button.title = hint;
        button.setAttribute('aria-label', hint);
        button.addEventListener('mousedown', (event) => {
            // Keeps keyboard focus on the canvas, so its shortcuts keep working after a rotation.
            event.preventDefault();
            const selectedShape = lastSelectedShape();
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

    // The shape selected last: it alone has the handles and buttons.
    function lastSelectedShape(): RectangleShape | null {
        return findShape(selectedShapeIds[selectedShapeIds.length - 1] ?? null);
    }

    function selectedShapeRect(): RotatedRect | null {
        const shape = lastSelectedShape();
        if (!shape || creatingRect) {
            return null;
        }
        return activeDrag?.current.get(shape.id) ?? shape;
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

    // The rotation handle's stem and the resize handles: white circles ringed in the selection colour.
    function drawHandles(rect: RotatedRect): void {
        const topMiddle = imageToCanvas(viewport, rotationHandlePoint(rect, 0));
        const stemEnd = imageToCanvas(viewport, rotationHandlePoint(rect, (ROTATION_HANDLE_OFFSET_PX - ROTATION_HANDLE_RADIUS_PX) / viewport.zoom));
        context.save();
        // The casing first, so it never crosses the colour where the stem meets the outline.
        for (const [color, extra] of [[SELECTION_CASING_STYLE, SELECTION_CASING_PX * 2], [SELECTED_STROKE_STYLE, 0]] as const) {
            context.strokeStyle = color;
            context.lineWidth = 2 + extra;
            context.beginPath();
            context.moveTo(topMiddle.x, topMiddle.y);
            context.lineTo(stemEnd.x, stemEnd.y);
            context.stroke();
        }
        for (const { point } of handlePoints(rect)) {
            const screenPoint = imageToCanvas(viewport, point);
            context.beginPath();
            context.arc(screenPoint.x, screenPoint.y, HANDLE_RADIUS_PX + HANDLE_RING_PX / 2, 0, Math.PI * 2);
            context.fillStyle = HANDLE_FILL_STYLE;
            context.fill();
            context.strokeStyle = HANDLE_SHADOW_STYLE;
            context.lineWidth = HANDLE_RING_PX + 2;
            context.stroke();
            context.strokeStyle = SELECTED_STROKE_STYLE;
            context.lineWidth = HANDLE_RING_PX;
            context.stroke();
        }
        context.restore();
    }

    // A preview rect is in canvas coordinates; any other is in image coordinates.
    function drawRect(rect: RotatedRect, style: RectStyle, isPreview: boolean): void {
        context.save();
        context.strokeStyle = style.stroke;
        context.lineWidth = style.lineWidth;
        context.setLineDash(style.dash ?? []);
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
                context.strokeStyle = style.casing ?? SELECTION_CASING_STYLE;
                context.lineWidth = style.lineWidth + SELECTION_CASING_PX * 2;
                context.strokeRect(-width / 2, -height / 2, width, height);
                context.restore();
            }
            const inset = style.isInset ? style.lineWidth / 2 : 0;
            context.strokeRect(-width / 2 + inset, -height / 2 + inset, width - inset * 2, height - inset * 2);
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
                focusedShapeId = hitShape.id;
                isFocusRingShown = false;
                callbacks.onToggleVisibility(hitShape.id);
            }
            return;
        }

        if (isPrimaryModifierPressed(event)) {
            startSelecting(canvasPoint);
            return;
        }

        const selectedShape = lastSelectedShape();
        const handle = selectedShape ? handleAtCanvasPoint(selectedShape, canvasPoint) : null;
        if (selectedShape && handle) {
            startResizing(selectedShape, handle, canvasPoint);
            return;
        }

        const hitShape = topmostShapeAt(canvasToImage(viewport, canvasPoint), shapes);
        if (hitShape) {
            // Dragging one of the selected shapes moves them all.
            const isSelected = selectedShapeIds.includes(hitShape.id);
            if (!isSelected) {
                callbacks.onSelectShapes([hitShape.id]);
            }
            startMoving(hitShape.id, isSelected ? selectedShapeIds : [hitShape.id], canvasPoint);
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
        return !image || Boolean(activeDrag) || Boolean(creatingRect) || Boolean(selectingArea) || Boolean(stopPanning);
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

        const selectedShape = lastSelectedShape();
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

    function rectsOf(shapeIds: readonly string[]): Map<string, RotatedRect> {
        return new Map(shapes.filter((shape) => shapeIds.includes(shape.id)).map((shape) => [shape.id, rectOf(shape)]));
    }

    function mapRects(rects: ReadonlyMap<string, RotatedRect>, transform: (rect: RotatedRect) => RotatedRect): Map<string, RotatedRect> {
        return new Map([...rects].map(([shapeId, rect]) => [shapeId, transform(rect)]));
    }

    // The shapes move as one, kept to the image together.
    function startMoving(shapeId: string, shapeIds: readonly string[], startCanvasPoint: Point): void {
        const originals = rectsOf(shapeIds);
        const box = boundingRectOfAll([...originals.values()]);
        startRectDrag(
            { kind: 'move', shapeId, originals, startCanvasPoint, current: originals },
            function computeNext(delta) {
                const moved = clampMoveToBounds(moveRect(box, delta.x, delta.y), imageBounds());
                return mapRects(originals, (rect) => moveRect(rect, moved.x - box.x, moved.y - box.y));
            }
        );
    }

    // A rotated shape may reach past the image's edges: clamping it would leave its corners at the edge and its sides
    // short of where the pointer is.
    function startResizing(shape: RectangleShape, handle: ResizeHandle, startCanvasPoint: Point): void {
        const original = rectOf(shape);
        startRectDrag(
            { kind: 'resize', shapeId: shape.id, originals: new Map([[shape.id, original]]), startCanvasPoint, current: new Map([[shape.id, original]]) },
            function computeNext(delta) {
                const resized = resizeRect(original, handle, delta.x, delta.y);
                return new Map([[shape.id, original.rotation ? resized : clampRectToBounds(resized, imageBounds())]]);
            }
        );
    }

    // The other selected shapes turn as much as this one, each about its own centre.
    function startRotating(shape: RectangleShape, startCanvasPoint: Point): void {
        const original = rectOf(shape);
        const center = rectCenter(original);
        const originals = rectsOf(selectedShapeIds);
        canvas.style.cursor = 'grabbing';
        startRectDrag(
            { kind: 'rotate', shapeId: shape.id, originals, startCanvasPoint, current: originals },
            function computeNext(_delta, moveEvent) {
                const pointer = canvasToImage(viewport, toCanvasPoint(moveEvent));
                const rotation = rotationTowards(center, pointer, moveEvent.shiftKey ? ROTATION_SNAP_DEGREES : undefined);
                const turned = mapRects(originals, (rect) => turnRect(rect, rotation - rotationOf(original)));
                // Exactly, so a turn back to upright leaves no rounding error behind.
                return turned.set(shape.id, { ...original, rotation });
            }
        );
    }

    function startRectDrag(drag: ActiveDrag, computeNext: (delta: Point, moveEvent: MouseEvent) => ReadonlyMap<string, RotatedRect>): void {
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
        const { kind, shapeId, originals, current } = activeDrag;
        activeDrag = null;
        const changed = new Map([...current].filter(([id, rect]) => !rectsEqual(originals.get(id)!, rect)));
        if (changed.size > 0) {
            callbacks.onUpdateShapeRects(changed);
        } else if (kind === 'move' && originals.size > 1) {
            // A click on one of several selected shapes selects it alone.
            callbacks.onSelectShapes([shapeId]);
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
            callbacks.onSelectShapes([]);
            return;
        }
        if (!isDrag(rect)) {
            callbacks.onSelectShapes([]);
            draw();
            return;
        }
        const imageRect = clampRectToBounds(
            rectFromPoints(canvasToImage(viewport, rect.start), canvasToImage(viewport, rect.current)),
            { width: image.naturalWidth, height: image.naturalHeight }
        );
        draw();
        if (isRectEmpty(imageRect)) {
            callbacks.onSelectShapes([]);
        } else {
            callbacks.onCreateShape(imageRect);
        }
    }

    function isDrag(area: DraggedArea): boolean {
        return Math.hypot(area.current.x - area.start.x, area.current.y - area.start.y) >= CLICK_DRAG_THRESHOLD_PX;
    }

    function startSelecting(startCanvasPoint: Point): void {
        selectingArea = { start: startCanvasPoint, current: startCanvasPoint };
        draw();

        startDragSession(function onMouseMove(moveEvent) {
            if (!selectingArea) {
                return;
            }
            selectingArea = { start: selectingArea.start, current: toCanvasPoint(moveEvent) };
            draw();
        }, finishSelecting);
    }

    // A click adds the shape under it to the selection, or takes it out; a drag adds the shapes it touches.
    function finishSelecting(): void {
        const area = selectingArea;
        selectingArea = null;
        draw();
        if (!area) {
            return;
        }
        if (isDrag(area)) {
            const added = shapeIdsTouchedBy(area).filter((id) => !selectedShapeIds.includes(id));
            if (added.length > 0) {
                callbacks.onSelectShapes([...selectedShapeIds, ...added]);
            }
            return;
        }
        const hitShape = topmostShapeAt(canvasToImage(viewport, area.start), shapes);
        if (hitShape) {
            callbacks.onSelectShapes(selectedShapeIds.includes(hitShape.id)
                ? selectedShapeIds.filter((id) => id !== hitShape.id)
                : [...selectedShapeIds, hitShape.id]);
        }
    }

    function shapeIdsTouchedBy(area: DraggedArea | null): string[] {
        if (!area || !isDrag(area)) {
            return [];
        }
        const marquee = rectFromPoints(canvasToImage(viewport, area.start), canvasToImage(viewport, area.current));
        return shapes.filter((shape) => rectsIntersect(marquee, shape)).map((shape) => shape.id);
    }

    function canEditSelectedShapes(): boolean {
        return mode === 'edit' && document.activeElement === canvas && selectedShapeIds.length > 0;
    }

    function deleteSelectedShapes(): void {
        callbacks.onDeleteSelected();
    }

    // The copies keep their places to each other, offset together.
    function cloneSelectedShapes(): void {
        const selected = [...rectsOf(selectedShapeIds).values()];
        if (selected.length > 0 && image) {
            const box = boundingRectOfAll(selected);
            const copyBox = offsetCopyRect(box, CLONE_OFFSET_PX / viewport.zoom, imageBounds());
            callbacks.onCloneSelected(copyBox.x - box.x, copyBox.y - box.y);
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
        isFocusRingShown = true;
        draw();
    }

    function canToggleFocusedShapeVisibility(): boolean {
        return hasShapeKeyboardFocus() && focusedShapeId !== null && isFocusRingShown;
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
        update(nextShapes: RectangleShape[], nextSelectedShapeIds: readonly string[], nextMode: Mode, nextNumbering: NumberingMode, nextShowNumbers: boolean, nextRevealedShapeIds: ReadonlySet<string>): void {
            shapes = nextShapes;
            selectedShapeIds = nextSelectedShapeIds;
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
        setPreviewBoxes(boxes: readonly RotatedRect[] | null): void {
            previewBoxes = boxes;
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
            colorPicker.close();
            window.removeEventListener('mousedown', closeColorPickerOnOutsideClick);
            window.removeEventListener('keydown', onPanModifierKeyDown);
            window.removeEventListener('keyup', onPanModifierKeyUp);
            window.removeEventListener('blur', onWindowBlur);
            unregisterShortcut('deleteSelectedShape');
            unregisterShortcut('cloneSelectedShape');
            unregisterShortcut('clearShapeSelection');
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
