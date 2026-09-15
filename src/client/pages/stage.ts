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
import { confirmDialog } from '../dialogs/confirmDialog.js';
import { isBlockedByInputOrDialog } from '../keyboardNav.js';

interface MountedCanvas {
    pageId: string;
    imageFile: string;
    handle: ImageCanvasHandle;
}

let controlsEl: HTMLDivElement;
let canvasMount: HTMLDivElement;
let canvasBody: HTMLDivElement;
let dragOverlay: HTMLDivElement;
let mountedCanvas: MountedCanvas | null = null;
let isFullscreen = false;
let isHoveringCanvas = false;

export function initStage(): void {
    const container = requireElement('canvas-area');
    container.innerHTML = '';
    controlsEl = document.createElement('div');
    controlsEl.className = 'stage-controls';
    canvasMount = document.createElement('div');
    canvasMount.className = 'canvas-mount';
    canvasBody = document.createElement('div');
    canvasBody.className = 'canvas-body';
    dragOverlay = document.createElement('div');
    dragOverlay.className = 'drag-overlay';
    dragOverlay.append(iconSpan('icon-image-placeholder'));
    canvasMount.append(canvasBody, dragOverlay);
    container.append(controlsEl, canvasMount);

    initFullscreenControl(canvasMount, function onFullscreenChange(nextIsFullscreen) {
        isFullscreen = nextIsFullscreen;
        mountedCanvas?.handle.setFullscreen(isFullscreen);
    });
    initImageDrop();
    initImagePaste();

    subscribe(render);
    render();
}

function initImageDrop(): void {
    canvasMount.addEventListener('dragenter', function onDragEnter(event) {
        if (!isFileDrag(event)) {
            return;
        }
        event.preventDefault();
        canvasMount.classList.add('drag-over');
    });
    canvasMount.addEventListener('dragover', function onDragOver(event) {
        if (!isFileDrag(event)) {
            return;
        }
        event.preventDefault();
    });
    canvasMount.addEventListener('dragleave', function onDragLeave(event) {
        const relatedTarget = event.relatedTarget as Node | null;
        if (!relatedTarget || !canvasMount.contains(relatedTarget)) {
            canvasMount.classList.remove('drag-over');
        }
    });
    canvasMount.addEventListener('drop', function onDrop(event) {
        if (!isFileDrag(event)) {
            return;
        }
        event.preventDefault();
        canvasMount.classList.remove('drag-over');
        const file = event.dataTransfer?.files[0];
        const documentId = getState().document?.id;
        const page = getActivePage();
        if (file && documentId && page) {
            void assignImageWithConfirm(documentId, page, file);
        }
    });
}

function isFileDrag(event: DragEvent): boolean {
    return event.dataTransfer !== null && Array.from(event.dataTransfer.types).includes('Files');
}

function initImagePaste(): void {
    canvasMount.addEventListener('mouseenter', function onMouseEnter() {
        isHoveringCanvas = true;
    });
    canvasMount.addEventListener('mouseleave', function onMouseLeave() {
        isHoveringCanvas = false;
    });
    document.addEventListener('paste', function onPaste(event) {
        if (!isHoveringCanvas || isBlockedByInputOrDialog()) {
            return;
        }
        const file = firstImageFile(event.clipboardData?.items);
        const documentId = getState().document?.id;
        const page = getActivePage();
        if (file && documentId && page) {
            void assignImageWithConfirm(documentId, page, file);
        }
    });
}

function firstImageFile(items: DataTransferItemList | undefined): File | null {
    if (!items) {
        return null;
    }
    for (const item of items) {
        if (item.type.startsWith('image/')) {
            return item.getAsFile();
        }
    }
    return null;
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

    const input = createImageFileInput(documentId, page.id);

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

function buildAssignImagePrompt(documentId: string, pageId: string): HTMLElement {
    const input = createImageFileInput(documentId, pageId);

    const assignButton = document.createElement('button');
    assignButton.type = 'button';
    assignButton.className = 'canvas-empty-state';
    assignButton.append(iconSpan('icon-image-placeholder'), document.createTextNode('Assign image'));
    assignButton.addEventListener('click', function onAssignClick() {
        input.click();
    });

    const hint = document.createElement('span');
    hint.className = 'canvas-empty-state-hint';
    hint.textContent = 'Drag & Drop or Paste supported!';

    const container = document.createElement('div');
    container.className = 'canvas-empty-state-container';
    container.append(assignButton, hint, input);
    return container;
}

function createImageFileInput(documentId: string, pageId: string): HTMLInputElement {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/png,image/jpeg,image/webp,image/gif';
    input.hidden = true;
    input.addEventListener('change', function onFileSelected() {
        const file = input.files?.[0];
        if (file) {
            void assignImage(documentId, pageId, file);
        }
    });
    return input;
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
        canvasBody.textContent = '';
        canvasBody.append(buildAssignImagePrompt(documentId, page.id));
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

async function assignImageWithConfirm(documentId: string, page: Page, file: File): Promise<void> {
    if (page.image) {
        const confirmed = await confirmDialog({
            title: 'Replace image?',
            message: `This page already has an image. Replace it with "${file.name}"?`,
            confirmLabel: 'Replace',
            confirmIcon: 'icon-image-placeholder',
            danger: false
        });
        if (!confirmed) {
            return;
        }
    }
    try {
        const image = await uploadPageImage(documentId, page.id, file);
        setPageImage(page.id, image);
    } catch {
        // ADD-FR-11/12: drag/paste is a less deliberate input path than the button, so failures fail silently.
    }
}
