import {
    addShape,
    deleteSelectedShape,
    getActivePage,
    getState,
    selectShape,
    setPageImage,
    setPageShapesVisibility,
    subscribe,
    toggleShapeVisibility,
    updateShapeRect
} from '../document/state.js';
import { pageImageUrl, uploadPageImage } from '../document/api.js';
import type { Page } from '../document/types.js';
import { requireElement } from '../dom.js';
import { reportError } from '../errors.js';
import { mountImageCanvas, type ImageCanvasHandle } from '../canvas/imageCanvas.js';
import { initFullscreenControl, requestFullscreen } from '../canvas/fullscreen.js';

interface MountedCanvas {
    pageId: string;
    imageFile: string;
    handle: ImageCanvasHandle;
}

let controlsEl: HTMLDivElement;
let canvasMount: HTMLDivElement;
let canvasBody: HTMLDivElement;
let mountedCanvas: MountedCanvas | null = null;
let isFullscreen = false;

export function initStage(): void {
    const container = requireElement('canvas-area');
    container.innerHTML = '';
    controlsEl = document.createElement('div');
    controlsEl.className = 'stage-controls';
    canvasMount = document.createElement('div');
    canvasMount.className = 'canvas-mount';
    canvasBody = document.createElement('div');
    canvasBody.className = 'canvas-body';
    canvasMount.append(canvasBody);
    container.append(controlsEl, canvasMount);

    initFullscreenControl(canvasMount, function onFullscreenChange(nextIsFullscreen) {
        isFullscreen = nextIsFullscreen;
        mountedCanvas?.handle.setFullscreen(isFullscreen);
    });

    subscribe(render);
    render();
}

function render(): void {
    const { document: doc } = getState();
    if (!doc) {
        showMessage('No document open. Use New or Open to get started.');
        return;
    }

    const page = getActivePage();
    if (!page) {
        showMessage('This document has no pages yet. Add one from the sidebar.');
        return;
    }

    renderControls(doc.id, page);
    renderCanvas(doc.id, page);
}

function showMessage(message: string): void {
    controlsEl.innerHTML = '';
    const text = document.createElement('span');
    text.className = 'stage-page-title';
    text.textContent = message;
    controlsEl.append(text);
    unmountCanvas();
    canvasBody.textContent = '';
}

function renderControls(documentId: string, page: Page): void {
    controlsEl.innerHTML = '';

    const leftGroup = document.createElement('div');
    leftGroup.className = 'flex-row stage-controls-left';

    const title = document.createElement('span');
    title.className = 'stage-page-title';
    title.textContent = page.name;
    title.title = page.name;

    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/png,image/jpeg,image/webp,image/gif';
    input.hidden = true;
    input.addEventListener('change', function onFileSelected() {
        const file = input.files?.[0];
        if (file) {
            void assignImage(documentId, page.id, file);
        }
    });

    const replaceButton = document.createElement('button');
    replaceButton.type = 'button';
    replaceButton.className = 'stage-controls-fixed';
    replaceButton.append(
        iconSpan('icon-image-placeholder'),
        document.createTextNode(page.image ? 'Replace image' : 'Assign image')
    );
    replaceButton.addEventListener('click', function onReplaceClick() {
        input.click();
    });

    leftGroup.append(title, replaceButton, input);
    controlsEl.append(leftGroup);

    if (getState().mode === 'study') {
        controlsEl.append(buildStudyControls(page));
    }
}

function buildStudyControls(page: Page): HTMLElement {
    const rightGroup = document.createElement('div');
    rightGroup.className = 'flex-row stage-controls-fixed';

    const hideAllButton = document.createElement('button');
    hideAllButton.textContent = 'Hide all';
    hideAllButton.addEventListener('click', function onHideAll() {
        setPageShapesVisibility(page.id, false);
    });

    const revealAllButton = document.createElement('button');
    revealAllButton.textContent = 'Reveal all';
    revealAllButton.addEventListener('click', function onRevealAll() {
        setPageShapesVisibility(page.id, true);
    });

    const fullscreenButton = document.createElement('button');
    fullscreenButton.append(iconSpan('icon-fullscreen'), document.createTextNode('Fullscreen'));
    fullscreenButton.addEventListener('click', function onFullscreen() {
        requestFullscreen(canvasMount);
    });

    rightGroup.append(hideAllButton, revealAllButton, fullscreenButton);
    return rightGroup;
}

function iconSpan(className: string): HTMLSpanElement {
    const icon = document.createElement('span');
    icon.className = `icon ${className}`;
    icon.setAttribute('aria-hidden', 'true');
    return icon;
}

function renderCanvas(documentId: string, page: Page): void {
    if (!page.image) {
        unmountCanvas();
        canvasBody.textContent = 'No image assigned to this page yet.';
        return;
    }

    const { selectedShapeId, mode } = getState();

    if (mountedCanvas?.pageId === page.id && mountedCanvas.imageFile === page.image.file) {
        mountedCanvas.handle.update(page.shapes, selectedShapeId, mode);
        return;
    }

    unmountCanvas();
    canvasBody.textContent = '';
    mountedCanvas = {
        pageId: page.id,
        imageFile: page.image.file,
        handle: mountImageCanvas(
            canvasBody,
            pageImageUrl(documentId, page.image),
            page.shapes,
            selectedShapeId,
            mode,
            isFullscreen,
            {
                onCreateShape(rect) {
                    addShape(page.id, rect);
                },
                onSelectShape(shapeId) {
                    selectShape(shapeId);
                },
                onUpdateShapeRect(shapeId, rect) {
                    updateShapeRect(page.id, shapeId, rect);
                },
                onDeleteSelected() {
                    deleteSelectedShape();
                },
                onToggleVisibility(shapeId) {
                    toggleShapeVisibility(page.id, shapeId);
                }
            }
        )
    };
}

function unmountCanvas(): void {
    mountedCanvas?.handle.destroy();
    mountedCanvas = null;
}

async function assignImage(documentId: string, pageId: string, file: File): Promise<void> {
    try {
        const image = await uploadPageImage(documentId, pageId, file);
        setPageImage(pageId, image);
    } catch (error) {
        reportError('upload image', error);
    }
}
