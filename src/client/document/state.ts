import type { DocumentManifest, Page, PageImage, RectangleShape } from '../shared/types.js';
import type { Rect } from '../shapes/rectangle.js';

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

export function addPage(name: string): Page | null {
    if (!state.document) {
        return null;
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
    return page;
}

export function renamePage(pageId: string, name: string): void {
    if (!updatePage(pageId, function withName(page) {
        return { ...page, name };
    })) {
        return;
    }
    markDirty();
}

export function deletePage(pageId: string): void {
    if (!state.document) {
        return;
    }
    const pages = state.document.pages;
    const remaining = pages.filter(function isNotTarget(page) {
        return page.id !== pageId;
    });
    replaceDocument({ ...state.document, pages: remaining });
    if (state.activePageId === pageId) {
        state.activePageId = pickActivePageIdAfterDeletion(pages, new Set([pageId]), pageId, remaining);
    }
    state.selectedShapeId = null;
    markDirty();
}

export function movePage(pageId: string, direction: -1 | 1): void {
    if (!state.document) {
        return;
    }
    const pages = state.document.pages;
    const index = pages.findIndex(function matchesId(page) {
        return page.id === pageId;
    });
    const targetIndex = index + direction;
    if (index === -1 || targetIndex < 0 || targetIndex >= pages.length) {
        return;
    }
    const reordered = [...pages];
    [reordered[index], reordered[targetIndex]] = [reordered[targetIndex], reordered[index]];
    replaceDocument({ ...state.document, pages: reordered });
    markDirty();
}

export function deletePages(pageIds: string[]): void {
    if (!state.document) {
        return;
    }
    const idsToDelete = new Set(pageIds);
    const pages = state.document.pages;
    const remaining = pages.filter(function isNotTarget(page) {
        return !idsToDelete.has(page.id);
    });
    replaceDocument({ ...state.document, pages: remaining });
    if (state.activePageId && idsToDelete.has(state.activePageId)) {
        state.activePageId = pickActivePageIdAfterDeletion(pages, idsToDelete, state.activePageId, remaining);
    }
    state.selectedShapeId = null;
    markDirty();
}

export function setPageImage(pageId: string, image: PageImage): void {
    if (!updatePage(pageId, function withImage(page) {
        return { ...page, image };
    })) {
        return;
    }
    markDirty();
}

export function addShape(pageId: string, rect: Rect): void {
    const shape: RectangleShape = {
        id: generateId('shape'),
        type: 'rectangle',
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
        visible: false
    };
    if (!updatePageShapes(pageId, function addShapeToPage(shapes) {
        return [...shapes, shape];
    })) {
        return;
    }
    state.selectedShapeId = shape.id;
    markDirty();
}

export function updateShapeRect(pageId: string, shapeId: string, rect: Rect): void {
    const updated = updatePageShapes(pageId, function applyRect(shapes) {
        return shapes.map(function updateShapeIfTarget(shape) {
            return shape.id === shapeId ? { ...shape, ...rect } : shape;
        });
    });
    if (!updated) {
        return;
    }
    markDirty();
}

export function setMode(mode: Mode): void {
    state.mode = mode;
    state.selectedShapeId = null;
    notify();
}

export function toggleShapeVisibility(pageId: string, shapeId: string): void {
    const updated = updatePageShapes(pageId, function toggleShapeIfTarget(shapes) {
        return shapes.map(function toggle(shape) {
            return shape.id === shapeId ? { ...shape, visible: !shape.visible } : shape;
        });
    });
    if (!updated) {
        return;
    }
    markDirty();
}

export function setPageShapesVisibility(pageId: string, visible: boolean): void {
    const updated = updatePageShapes(pageId, function setAllVisibility(shapes) {
        return shapes.map(function setShapeVisibility(shape) {
            return { ...shape, visible };
        });
    });
    if (!updated) {
        return;
    }
    markDirty();
}

export function selectShape(shapeId: string | null): void {
    state.selectedShapeId = shapeId;
    notify();
}

export function deleteSelectedShape(): void {
    if (!state.activePageId || !state.selectedShapeId) {
        return;
    }
    const shapeId = state.selectedShapeId;
    const updated = updatePageShapes(state.activePageId, function removeShape(shapes) {
        return shapes.filter(function isNotTarget(shape) {
            return shape.id !== shapeId;
        });
    });
    if (!updated) {
        return;
    }
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

export function documentUrlPath(document: DocumentManifest | null): string {
    return document ? `/${document.id}` : '/';
}

function syncUrlWithDocument(document: DocumentManifest | null): void {
    const targetPath = documentUrlPath(document);
    if (location.pathname !== targetPath) {
        history.pushState(null, '', targetPath);
    }
}

function findPage(pageId: string): Page | null {
    return state.document?.pages.find(function matchesId(page) {
        return page.id === pageId;
    }) ?? null;
}

function updatePage(pageId: string, updater: (page: Page) => Page): boolean {
    if (!state.document || !findPage(pageId)) {
        return false;
    }
    replaceDocument({
        ...state.document,
        pages: state.document.pages.map(function updateIfTarget(page) {
            return page.id === pageId ? updater(page) : page;
        })
    });
    return true;
}

function updatePageShapes(pageId: string, updater: (shapes: RectangleShape[]) => RectangleShape[]): boolean {
    return updatePage(pageId, function applyToShapes(page) {
        return { ...page, shapes: updater(page.shapes) };
    });
}

function pickActivePageIdAfterDeletion(
    pages: readonly Page[],
    idsToDelete: Set<string>,
    activePageId: string,
    remaining: readonly Page[]
): string | null {
    const activeIndex = pages.findIndex(function matchesId(page) {
        return page.id === activePageId;
    });
    for (let index = activeIndex - 1; index >= 0; index--) {
        if (!idsToDelete.has(pages[index].id)) {
            return pages[index].id;
        }
    }
    return remaining[0]?.id ?? null;
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
