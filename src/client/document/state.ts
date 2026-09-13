import { getDocument } from './api.js';
import type { DocumentManifest, Page, PageImage, RectangleShape } from './types.js';
import type { Rect } from '../shapes/rectangle.js';
import { reportError } from '../errors.js';

export type Mode = 'edit' | 'study';

export interface AppState {
    document: DocumentManifest | null;
    activePageId: string | null;
    selectedShapeId: string | null;
    dirty: boolean;
    mode: Mode;
}

type Listener = (state: AppState) => void;

const state: AppState = {
    document: null,
    activePageId: null,
    selectedShapeId: null,
    dirty: false,
    mode: 'edit'
};

const listeners = new Set<Listener>();

export function getState(): AppState {
    return state;
}

export function subscribe(listener: Listener): void {
    listeners.add(listener);
}

export function setDocument(document: DocumentManifest | null): void {
    replaceDocument(document);
    state.activePageId = document?.pages[0]?.id ?? null;
    state.selectedShapeId = null;
    state.dirty = false;
    state.mode = 'edit';
    syncUrlWithDocument(document);
    notify();
}

export function markClean(): void {
    state.dirty = false;
    notify();
}

export function setActivePage(pageId: string): void {
    state.activePageId = pageId;
    state.selectedShapeId = null;
    notify();
}

export function getActivePage(): Page | null {
    if (!state.document || !state.activePageId) {
        return null;
    }
    return findPage(state.activePageId);
}

export function addPage(name: string): void {
    if (!state.document) {
        return;
    }
    const page: Page = {
        id: generateId('page'),
        name,
        image: null,
        shapes: []
    };
    replaceDocument({ ...state.document, pages: [...state.document.pages, page] });
    state.activePageId = page.id;
    markDirty();
}

export function renamePage(pageId: string, name: string): void {
    if (!state.document || !findPage(pageId)) {
        return;
    }
    replaceDocument({
        ...state.document,
        pages: state.document.pages.map(function renameIfTarget(page) {
            return page.id === pageId ? { ...page, name } : page;
        })
    });
    markDirty();
}

export function deletePage(pageId: string): void {
    if (!state.document) {
        return;
    }
    replaceDocument({
        ...state.document,
        pages: state.document.pages.filter(function isNotTarget(page) {
            return page.id !== pageId;
        })
    });
    if (state.activePageId === pageId) {
        state.activePageId = state.document.pages[0]?.id ?? null;
    }
    state.selectedShapeId = null;
    markDirty();
}

export function setPageImage(pageId: string, image: PageImage): void {
    if (!state.document || !findPage(pageId)) {
        return;
    }
    replaceDocument({
        ...state.document,
        pages: state.document.pages.map(function setImageIfTarget(page) {
            return page.id === pageId ? { ...page, image } : page;
        })
    });
    markDirty();
}

export function addShape(pageId: string, rect: Rect): void {
    if (!state.document || !findPage(pageId)) {
        return;
    }
    const shape: RectangleShape = {
        id: generateId('shape'),
        type: 'rectangle',
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
        visible: false
    };
    replaceDocument({
        ...state.document,
        pages: state.document.pages.map(function addShapeIfTarget(page) {
            return page.id === pageId ? { ...page, shapes: [...page.shapes, shape] } : page;
        })
    });
    state.selectedShapeId = shape.id;
    markDirty();
}

export function updateShapeRect(pageId: string, shapeId: string, rect: Rect): void {
    if (!state.document || !findPage(pageId)) {
        return;
    }
    replaceDocument({
        ...state.document,
        pages: state.document.pages.map(function updatePageIfTarget(page) {
            if (page.id !== pageId) {
                return page;
            }
            return {
                ...page,
                shapes: page.shapes.map(function updateShapeIfTarget(shape) {
                    return shape.id === shapeId ? { ...shape, ...rect } : shape;
                })
            };
        })
    });
    markDirty();
}

export function setMode(mode: Mode): void {
    state.mode = mode;
    state.selectedShapeId = null;
    notify();
}

export function toggleShapeVisibility(pageId: string, shapeId: string): void {
    if (!state.document || !findPage(pageId)) {
        return;
    }
    replaceDocument({
        ...state.document,
        pages: state.document.pages.map(function togglePageIfTarget(page) {
            if (page.id !== pageId) {
                return page;
            }
            return {
                ...page,
                shapes: page.shapes.map(function toggleShapeIfTarget(shape) {
                    return shape.id === shapeId ? { ...shape, visible: !shape.visible } : shape;
                })
            };
        })
    });
    markDirty();
}

export function setPageShapesVisibility(pageId: string, visible: boolean): void {
    if (!state.document || !findPage(pageId)) {
        return;
    }
    replaceDocument({
        ...state.document,
        pages: state.document.pages.map(function setVisibilityIfTarget(page) {
            if (page.id !== pageId) {
                return page;
            }
            return {
                ...page,
                shapes: page.shapes.map(function setShapeVisibility(shape) {
                    return { ...shape, visible };
                })
            };
        })
    });
    markDirty();
}

export function selectShape(shapeId: string | null): void {
    state.selectedShapeId = shapeId;
    notify();
}

export function deleteSelectedShape(): void {
    if (!state.document || !state.activePageId || !state.selectedShapeId) {
        return;
    }
    const shapeId = state.selectedShapeId;
    replaceDocument({
        ...state.document,
        pages: state.document.pages.map(function deleteShapeIfActivePage(page) {
            if (page.id !== state.activePageId) {
                return page;
            }
            return {
                ...page,
                shapes: page.shapes.filter(function isNotTarget(shape) {
                    return shape.id !== shapeId;
                })
            };
        })
    });
    state.selectedShapeId = null;
    markDirty();
}

export function renameDocument(name: string): void {
    if (!state.document) {
        return;
    }
    replaceDocument({ ...state.document, name });
    markDirty();
}

export function confirmDiscardIfDirty(): boolean {
    if (!state.dirty) {
        return true;
    }
    return confirm('You have unsaved changes. Discard them?');
}

function syncUrlWithDocument(document: DocumentManifest | null): void {
    const targetPath = document ? `/${document.id}` : '/';
    if (location.pathname !== targetPath) {
        history.pushState(null, '', targetPath);
    }
}

window.addEventListener('popstate', function onPopState() {
    const id = location.pathname.slice(1);
    if (id === state.document?.id || (!id && !state.document)) {
        return;
    }
    if (!confirmDiscardIfDirty()) {
        history.pushState(null, '', state.document ? `/${state.document.id}` : '/');
        return;
    }
    if (!id) {
        setDocument(null);
        return;
    }
    getDocument(id).then(setDocument).catch(function onRestoreError(error) {
        history.replaceState(null, '', state.document ? `/${state.document.id}` : '/');
        reportError('open document', error);
    });
});

function findPage(pageId: string): Page | null {
    return state.document?.pages.find(function matchesId(page) {
        return page.id === pageId;
    }) ?? null;
}

function generateId(prefix: string): string {
    return `${prefix}-${crypto.randomUUID().replace(/-/g, '')}`;
}

function replaceDocument(document: DocumentManifest | null): void {
    state.document = document && deepFreezeDocument(document);
}

function deepFreezeDocument(document: DocumentManifest): DocumentManifest {
    for (const page of document.pages) {
        for (const shape of page.shapes) {
            Object.freeze(shape);
        }
        Object.freeze(page.shapes);
        Object.freeze(page);
    }
    Object.freeze(document.pages);
    return Object.freeze(document);
}

function markDirty(): void {
    state.dirty = true;
    notify();
}

function notify(): void {
    for (const listener of listeners) {
        listener(state);
    }
}
