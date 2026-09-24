import type { DocumentManifest, Page, PageImage, RectangleShape } from '../../shared/types';
import type { Rect } from '../shapes/rectangle';

export type Mode = 'edit' | 'study';

export interface AppState {
    document: DocumentManifest | null;
    activePageId: string | null;
    selectedShapeId: string | null;
    dirty: boolean;
    mode: Mode;
    revealedShapeIds: ReadonlySet<string>;
}

type Listener = (state: AppState) => void;

const state: AppState = {
    document: null,
    activePageId: null,
    selectedShapeId: null,
    dirty: false,
    mode: 'edit',
    revealedShapeIds: new Set()
};

const listeners = new Set<Listener>();
let lastSavedDocument: DocumentManifest | null = null;

export function getState(): AppState {
    return state;
}

export function subscribe(listener: Listener): void {
    listeners.add(listener);
}

export function setDocument(document: DocumentManifest | null): void {
    replaceDocument(document);
    lastSavedDocument = state.document;
    state.activePageId = document?.pages[0]?.id ?? null;
    state.selectedShapeId = null;
    state.dirty = false;
    state.mode = 'edit';
    state.revealedShapeIds = new Set();
    syncUrlWithDocument(document);
    notify();
}

export function markClean(): void {
    lastSavedDocument = state.document;
    state.dirty = false;
    notify();
}

export function setActivePage(pageId: string): void {
    if (state.activePageId === pageId) {
        return;
    }
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
    notify();
    return page;
}

export function renamePage(pageId: string, name: string): void {
    if (!updatePage(pageId, function withName(page) {
        return { ...page, name };
    })) {
        return;
    }
    notify();
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
    notify();
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
    notify();
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
    notify();
}

export function setPageImage(pageId: string, image: PageImage): void {
    if (!updatePage(pageId, function withImage(page) {
        return { ...page, image };
    })) {
        return;
    }
    notify();
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
    notify();
}

export function updateShapeRect(pageId: string, shapeId: string, rect: Rect): void {
    if (!updatePageShapes(pageId, function applyRect(shapes) {
        return shapes.map(function updateShapeIfTarget(shape) {
            return shape.id === shapeId ? { ...shape, ...rect } : shape;
        });
    })) {
        return;
    }
    notify();
}

export function setMode(mode: Mode): void {
    state.mode = mode;
    state.selectedShapeId = null;
    if (mode === 'study') {
        state.revealedShapeIds = new Set();
    }
    notify();
}

export function toggleShapeVisibility(shapeId: string): void {
    const next = new Set(state.revealedShapeIds);
    if (next.has(shapeId)) {
        next.delete(shapeId);
    } else {
        next.add(shapeId);
    }
    state.revealedShapeIds = next;
    notify();
}

export function setPageShapesVisibility(pageId: string, visible: boolean): void {
    const page = findPage(pageId);
    if (!page) {
        return;
    }
    const next = new Set(state.revealedShapeIds);
    for (const shape of page.shapes) {
        if (visible) {
            next.add(shape.id);
        } else {
            next.delete(shape.id);
        }
    }
    state.revealedShapeIds = next;
    notify();
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
    notify();
}

export function renameDocument(name: string): void {
    if (!state.document) {
        return;
    }
    replaceDocument({ ...state.document, name });
    notify();
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
    state.dirty = !deepEqual(state.document, lastSavedDocument);
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

function deepEqual(a: unknown, b: unknown): boolean {
    if (a === b) {
        return true;
    }
    if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) {
        return false;
    }
    if (Array.isArray(a) || Array.isArray(b)) {
        return Array.isArray(a) && Array.isArray(b) && a.length === b.length &&
            a.every(function matchesAtIndex(value, index) {
                return deepEqual(value, b[index]);
            });
    }
    const aRecord = a as Record<string, unknown>;
    const bRecord = b as Record<string, unknown>;
    const aKeys = Object.keys(aRecord);
    return aKeys.length === Object.keys(bRecord).length && aKeys.every(function matchesKey(key) {
        return deepEqual(aRecord[key], bRecord[key]);
    });
}

function notify(): void {
    for (const listener of listeners) {
        listener(state);
    }
}
