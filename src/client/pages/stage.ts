import {
    addShape,
    deleteSelectedShape,
    getActivePage,
    getState,
    selectShape,
    setPageImage,
    subscribe,
    toggleShapeVisibility,
    updateShapeRect
} from '../document/state.js';
import { pageImageUrl, uploadPageImage } from '../document/api.js';
import type { Page } from '../document/types.js';
import { requireElement } from '../dom.js';
import { mountImageCanvas, type ImageCanvasHandle } from '../canvas/imageCanvas.js';

interface MountedCanvas {
    pageId: string;
    imageFile: string;
    handle: ImageCanvasHandle;
}

let controlsEl: HTMLDivElement;
let canvasMount: HTMLDivElement;
let mountedCanvas: MountedCanvas | null = null;

export function initStage(): void {
    const container = requireElement('canvas-area');
    container.innerHTML = '';
    controlsEl = document.createElement('div');
    controlsEl.className = 'stage-controls';
    canvasMount = document.createElement('div');
    canvasMount.className = 'canvas-mount';
    container.append(controlsEl, canvasMount);

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
    controlsEl.textContent = message;
    unmountCanvas();
    canvasMount.textContent = '';
}

function renderControls(documentId: string, page: Page): void {
    controlsEl.innerHTML = '';

    const status = document.createElement('span');
    status.textContent = `Active page: ${page.name}`;

    const label = document.createElement('label');
    label.textContent = page.image ? ' Replace image: ' : ' Assign image: ';
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/png,image/jpeg,image/webp,image/gif';
    input.addEventListener('change', function onFileSelected() {
        const file = input.files?.[0];
        if (file) {
            void assignImage(documentId, page.id, file);
        }
    });
    label.appendChild(input);

    controlsEl.append(status, label);
}

function renderCanvas(documentId: string, page: Page): void {
    if (!page.image) {
        unmountCanvas();
        canvasMount.textContent = 'No image assigned to this page yet.';
        return;
    }

    const { selectedShapeId, mode } = getState();

    if (mountedCanvas?.pageId === page.id && mountedCanvas.imageFile === page.image.file) {
        mountedCanvas.handle.update(page.shapes, selectedShapeId, mode);
        return;
    }

    unmountCanvas();
    canvasMount.textContent = '';
    mountedCanvas = {
        pageId: page.id,
        imageFile: page.image.file,
        handle: mountImageCanvas(
            canvasMount,
            pageImageUrl(documentId, page.image),
            page.shapes,
            selectedShapeId,
            mode,
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
    const image = await uploadPageImage(documentId, pageId, file);
    setPageImage(pageId, image);
}
