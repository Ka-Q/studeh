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
} from '../document/state';
import { pageImageUrl, uploadPageImage } from '../document/api';
import type { Page } from '../../shared/types';
import { getDroppedImageFiles, iconSpan, initHoverScopedPaste, isFileDrag, requireElement } from '../dom';
import { reportError } from '../errors';
import { mountImageCanvas, type ImageCanvasHandle } from '../canvas/imageCanvas';
import { initFullscreenControl, requestFullscreen } from '../canvas/fullscreen';
import { initCanvasHints, type CanvasHintsHandle } from '../canvas/canvasHints';
import { initCanvasZoom, type CanvasZoomHandle } from '../canvas/canvasZoom';
import { initPageNavigator, type PageNavigatorHandle } from '../canvas/pageNavigator';
import { confirmDialog } from '../dialogs/confirmDialog';
import { createModeToggle, type ModeToggleHandle } from '../modes/modeToggle';
import { browseDialog } from '../document/browseDialog';
import { onNew } from '../document/toolbar';
import { shortcutHint } from '../shortcuts';
import { registerShortcut } from '../shortcutDispatch';

interface MountedCanvas {
    pageId: string;
    imageFile: string;
    handle: ImageCanvasHandle;
}

let controlsEl: HTMLDivElement;
let canvasMount: HTMLDivElement;
let canvasBody: HTMLDivElement;
let dragOverlay: HTMLDivElement;
let modeToggleHandle: ModeToggleHandle;
let canvasHintsHandle: CanvasHintsHandle;
let canvasZoomHandle: CanvasZoomHandle;
let pageNavigatorHandle: PageNavigatorHandle;
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
    dragOverlay = document.createElement('div');
    dragOverlay.className = 'drag-overlay';
    dragOverlay.append(iconSpan('icon-image-placeholder'));
    modeToggleHandle = createModeToggle();
    const overlayStack = document.createElement('div');
    overlayStack.className = 'canvas-overlay-stack';
    canvasMount.append(canvasBody, dragOverlay, modeToggleHandle.button, overlayStack);
    container.append(controlsEl, canvasMount);
    canvasHintsHandle = initCanvasHints(overlayStack, getState().mode);
    canvasZoomHandle = initCanvasZoom(canvasMount);
    pageNavigatorHandle = initPageNavigator(canvasMount);

    initFullscreenControl(canvasMount, function onFullscreenChange(nextIsFullscreen) {
        isFullscreen = nextIsFullscreen;
        modeToggleHandle.setFullscreen(isFullscreen);
        mountedCanvas?.handle.setFullscreen(isFullscreen);
        pageNavigatorHandle.setFullscreen(isFullscreen);
    });
    initImageDrop();
    initImagePaste();
    registerShortcut('toggleFullscreen', toggleFullscreen, isStudyModeWithImage);
    registerShortcut('hideAll', () => {
        const page = getActivePage();
        if (page) {
            setPageShapesVisibility(page.id, false);
        }
    }, isStudyModeWithImage);
    registerShortcut('revealAll', () => {
        const page = getActivePage();
        if (page) {
            setPageShapesVisibility(page.id, true);
        }
    }, isStudyModeWithImage);
    registerShortcut('zoomIn', () => canvasZoomHandle.zoomIn(), hasReadyCanvas);
    registerShortcut('zoomOut', () => canvasZoomHandle.zoomOut(), hasReadyCanvas);
    registerShortcut('resetZoom', () => canvasZoomHandle.resetZoom(), hasReadyCanvas);
    registerShortcut('fitToView', () => canvasZoomHandle.fitToView(), hasReadyCanvas);

    subscribe(render);
    render();
}

function isStudyModeWithImage(): boolean {
    return getState().mode === 'study' && !!getActivePage()?.image;
}

function hasReadyCanvas(): boolean {
    return mountedCanvas?.handle.isReady() ?? false;
}

function isEditMode(): boolean {
    return getState().mode === 'edit';
}

function initImageDrop(): void {
    canvasMount.addEventListener('dragenter', (event) => {
        if (!isEditMode() || !isFileDrag(event)) {
            return;
        }
        event.preventDefault();
        canvasMount.classList.add('drag-over');
    });
    canvasMount.addEventListener('dragover', (event) => {
        if (!isEditMode() || !isFileDrag(event)) {
            return;
        }
        event.preventDefault();
    });
    canvasMount.addEventListener('dragleave', (event) => {
        const relatedTarget = event.relatedTarget as Node | null;
        if (!relatedTarget || !canvasMount.contains(relatedTarget)) {
            canvasMount.classList.remove('drag-over');
        }
    });
    canvasMount.addEventListener('drop', (event) => {
        if (!isEditMode() || !isFileDrag(event)) {
            return;
        }
        event.preventDefault();
        canvasMount.classList.remove('drag-over');
        const file = getDroppedImageFiles(event)[0];
        const documentId = getState().document?.id;
        const page = getActivePage();
        if (file && documentId && page) {
            void assignImageWithConfirm(documentId, page, file);
        }
    });
}

function initImagePaste(): void {
    initHoverScopedPaste(canvasMount, function onFile(file) {
        const documentId = getState().document?.id;
        const page = getActivePage();
        if (documentId && page) {
            void assignImageWithConfirm(documentId, page, file);
        }
    }, isEditMode);
}

function render(): void {
    const { document: doc } = getState();
    if (!doc) {
        renderNoDocumentState();
        return;
    }

    const page = getActivePage();
    if (!page) {
        renderNoPagesState();
        return;
    }

    renderControls(doc.id, page);
    renderCanvas(doc.id, page);
}

function renderNoPagesState(): void {
    controlsEl.innerHTML = '';
    unmountCanvas();
    canvasBody.textContent = '';
    canvasBody.append(buildNoPagesPrompt());
}

function renderNoDocumentState(): void {
    controlsEl.innerHTML = '';
    unmountCanvas();
    canvasBody.textContent = '';

    const message = document.createElement('span');
    message.textContent = 'No document open. Use New or Browse to get started.';

    const newButton = document.createElement('button');
    newButton.type = 'button';
    newButton.className = 'button-large button-accent';
    newButton.append(iconSpan('icon-new'), document.createTextNode('New'));
    newButton.addEventListener('click', onNew);

    const browseButton = document.createElement('button');
    browseButton.type = 'button';
    browseButton.className = 'button-large button-accent';
    browseButton.append(iconSpan('icon-browse'), document.createTextNode('Browse'));
    browseButton.addEventListener('click', browseDialog);

    const actions = document.createElement('div');
    actions.className = 'flex-row';
    actions.append(newButton, browseButton);

    const container = document.createElement('div');
    container.className = 'canvas-empty-state-container';
    container.append(message, actions);
    canvasBody.append(container);
}

function renderControls(documentId: string, page: Page): void {
    controlsEl.innerHTML = '';

    const leftGroup = document.createElement('div');
    leftGroup.className = 'flex-row stage-controls-left';

    const title = document.createElement('span');
    title.className = 'stage-page-title';
    title.textContent = page.name;
    title.title = page.name;
    leftGroup.append(title);

    if (isEditMode()) {
        const input = createImageFileInput(documentId, page.id);

        const replaceButton = document.createElement('button');
        replaceButton.type = 'button';
        replaceButton.className = 'stage-controls-fixed';
        replaceButton.append(
            iconSpan('icon-image-placeholder'),
            document.createTextNode(page.image ? 'Replace image' : 'Assign image')
        );
        replaceButton.addEventListener('click', () => input.click());

        leftGroup.append(replaceButton, input);
    }

    controlsEl.append(leftGroup);

    if (!isEditMode()) {
        controlsEl.append(buildStudyControls(page));
    }
}

function buildStudyControls(page: Page): HTMLElement {
    const rightGroup = document.createElement('div');
    rightGroup.className = 'flex-row stage-controls-fixed';

    const hideAllButton = document.createElement('button');
    hideAllButton.textContent = 'Hide all';
    hideAllButton.title = `Hide all (${shortcutHint('hideAll')})`;
    hideAllButton.addEventListener('click', () => setPageShapesVisibility(page.id, false));

    const revealAllButton = document.createElement('button');
    revealAllButton.textContent = 'Reveal all';
    revealAllButton.title = `Reveal all (${shortcutHint('revealAll')})`;
    revealAllButton.addEventListener('click', () => setPageShapesVisibility(page.id, true));

    const fullscreenButton = document.createElement('button');
    fullscreenButton.append(iconSpan('icon-fullscreen'), document.createTextNode('Fullscreen'));
    fullscreenButton.title = `Fullscreen (${shortcutHint('toggleFullscreen')})`;
    fullscreenButton.addEventListener('click', toggleFullscreen);

    rightGroup.append(revealAllButton, hideAllButton, fullscreenButton);
    return rightGroup;
}

function buildAssignImagePrompt(documentId: string, pageId: string): HTMLElement {
    const input = createImageFileInput(documentId, pageId);

    const assignButton = document.createElement('button');
    assignButton.type = 'button';
    assignButton.className = 'canvas-empty-state';
    assignButton.append(iconSpan('icon-image-placeholder'), document.createTextNode('Assign image'));
    assignButton.addEventListener('click', () => input.click());

    const hint = document.createElement('span');
    hint.className = 'canvas-empty-state-hint';
    hint.textContent = 'Or drag & drop / paste an image';

    const container = document.createElement('div');
    container.className = 'canvas-empty-state-container';
    container.append(assignButton, hint, input);
    return container;
}

function buildNoPagesPrompt(): HTMLElement {
    const message = document.createElement('span');
    message.className = 'canvas-no-pages-message';
    message.append(iconSpan('icon-chevron-left'), document.createTextNode('You can add a page from the sidebar'));

    const container = document.createElement('div');
    container.className = 'canvas-empty-state-container';
    container.append(message);
    return container;
}

function buildStudyEmptyState(): HTMLElement {
    const message = document.createElement('span');
    message.className = 'canvas-empty-state-message';
    message.append(iconSpan('icon-image-placeholder'), document.createTextNode('Go to edit mode to assign an image'));

    const container = document.createElement('div');
    container.className = 'canvas-empty-state-container';
    container.append(message);
    return container;
}

function createImageFileInput(documentId: string, pageId: string): HTMLInputElement {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/png,image/jpeg,image/webp,image/gif';
    input.hidden = true;
    input.addEventListener('change', () => {
        const file = input.files?.[0];
        if (file) {
            void assignImage(documentId, pageId, file);
        }
    });
    return input;
}

function renderCanvas(documentId: string, page: Page): void {
    const { selectedShapeId, mode, revealedShapeIds } = getState();
    canvasHintsHandle.setMode(mode);

    if (!page.image) {
        unmountCanvas();
        canvasBody.textContent = '';
        canvasBody.append(isEditMode() ? buildAssignImagePrompt(documentId, page.id) : buildStudyEmptyState());
        return;
    }

    if (mountedCanvas?.pageId === page.id && mountedCanvas.imageFile === page.image.file) {
        mountedCanvas.handle.update(page.shapes, selectedShapeId, mode, revealedShapeIds);
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
            revealedShapeIds,
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
                    toggleShapeVisibility(shapeId);
                }
            }
        )
    };
    canvasZoomHandle.setSource(mountedCanvas.handle);
}

function unmountCanvas(): void {
    mountedCanvas?.handle.destroy();
    mountedCanvas = null;
    canvasZoomHandle.setSource(null);
}

function toggleFullscreen(): void {
    if (isFullscreen) {
        void document.exitFullscreen();
    } else {
        requestFullscreen(canvasMount);
    }
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
