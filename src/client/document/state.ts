import type { DocumentManifest, Page, PageImage, RectangleShape } from '../../shared/types';
import type { Rect, RotatedRect } from '../shapes/rectangle';

export type Mode = 'edit' | 'study';

export interface AppState {
    document: DocumentManifest | null;
    activePageId: string | null;
    // The shape selected last, which has the handles and buttons, is the last.
    selectedShapeIds: readonly string[];
    dirty: boolean;
    mode: Mode;
    revealedShapeIds: ReadonlySet<string>;
}

type Listener = (state: AppState) => void;

const state: AppState = {
    document: null,
    activePageId: null,
    selectedShapeIds: [],
    dirty: false,
    mode: 'edit',
    revealedShapeIds: new Set()
};

const listeners = new Set<Listener>();
let lastSavedDocument: DocumentManifest | null = null;
// The selections made one after another before the current one, most recent last: deleting the selected shapes selects
// the latest of them with shapes still on the page. Clearing the selection starts it over.
let selectionHistory: (readonly string[])[] = [];
let lastNotifiedSelectedShapeIds: readonly string[] = [];

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
    state.selectedShapeIds = [];
    state.dirty = false;
    state.mode = 'edit';
    state.revealedShapeIds = new Set();
    syncUrlWithDocument(document);
    notify();
}

export function markClean(savedDocument: DocumentManifest): void {
    lastSavedDocument = savedDocument;
    state.dirty = !deepEqual(state.document, savedDocument);
    notify();
}

export function setActivePage(pageId: string): void {
    if (state.activePageId === pageId) {
        return;
    }
    state.activePageId = pageId;
    state.selectedShapeIds = [];
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
    state.selectedShapeIds = [];
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
    state.selectedShapeIds = [];
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
    insertShapes(pageId, [{
        id: generateId('shape'),
        type: 'rectangle',
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
        visible: false
    }]);
}

// Each copy keeps every property of its original but its id and place, shifted by dx/dy; the copies become the selection.
export function cloneSelectedShapes(dx: number, dy: number): void {
    const page = getActivePage();
    if (!page) {
        return;
    }
    const byId = new Map(page.shapes.map((shape) => [shape.id, shape]));
    const copies = state.selectedShapeIds.filter((id) => byId.has(id)).map(function copyOf(id) {
        const original = byId.get(id)!;
        return { ...original, id: generateId('shape'), x: original.x + dx, y: original.y + dy };
    });
    if (copies.length > 0) {
        insertShapes(page.id, copies);
    }
}

function insertShapes(pageId: string, newShapes: RectangleShape[]): void {
    if (!updatePageShapes(pageId, function addShapesToPage(shapes) {
        return [...shapes, ...newShapes];
    })) {
        return;
    }
    state.selectedShapeIds = newShapes.map((shape) => shape.id);
    notify();
}

export function updateShapeRects(pageId: string, rects: ReadonlyMap<string, RotatedRect>): void {
    if (!updatePageShapes(pageId, function applyRects(shapes) {
        return shapes.map(function updateShapeIfTarget(shape) {
            const rect = rects.get(shape.id);
            return rect ? withRect(shape, rect) : shape;
        });
    })) {
        return;
    }
    notify();
}

// An unrotated shape keeps no rotation, as in documents made before shapes could rotate.
function withRect(shape: RectangleShape, rect: RotatedRect): RectangleShape {
    const next = { ...shape, ...rect };
    if (!next.rotation) {
        delete next.rotation;
    }
    return next;
}

export function setMode(mode: Mode): void {
    state.mode = mode;
    state.selectedShapeIds = [];
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

export function selectShapes(shapeIds: readonly string[]): void {
    state.selectedShapeIds = shapeIds;
    notify();
}

export function deleteSelectedShapes(): void {
    if (!state.activePageId || state.selectedShapeIds.length === 0) {
        return;
    }
    const selected = new Set(state.selectedShapeIds);
    const updated = updatePageShapes(state.activePageId, function removeSelected(shapes) {
        return shapes.filter(function isNotSelected(shape) {
            return !selected.has(shape.id);
        });
    });
    if (!updated) {
        return;
    }
    state.selectedShapeIds = latestPreviousSelection(getActivePage()!.shapes);
    notify();
}

// Of the latest earlier selection with shapes still on the page, those shapes.
function latestPreviousSelection(shapes: RectangleShape[]): string[] {
    const ids = new Set(shapes.map((shape) => shape.id));
    for (const selection of [...selectionHistory].reverse()) {
        const onPage = selection.filter((shapeId) => ids.has(shapeId));
        if (onPage.length > 0) {
            return onPage;
        }
    }
    return [];
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

function trackSelectionChange(previous: readonly string[], next: readonly string[]): void {
    if (next.length === 0) {
        selectionHistory = [];
    } else if (previous.length > 0) {
        selectionHistory = [...selectionHistory.filter(function isNotPrevious(selection) {
            return !haveSameIds(selection, previous);
        }), previous];
    }
}

function haveSameIds(a: readonly string[], b: readonly string[]): boolean {
    const bIds = new Set(b);
    return a.length === bIds.size && a.every((id) => bIds.has(id));
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
    const { selectedShapeIds } = state;
    const isSelectionChanged = selectedShapeIds.length !== lastNotifiedSelectedShapeIds.length ||
        selectedShapeIds.some((id, index) => id !== lastNotifiedSelectedShapeIds[index]);
    if (isSelectionChanged) {
        trackSelectionChange(lastNotifiedSelectedShapeIds, selectedShapeIds);
        lastNotifiedSelectedShapeIds = selectedShapeIds;
    }
    for (const listener of listeners) {
        listener(state);
    }
}
