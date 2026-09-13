import type { DocumentManifest, Page, PageImage } from './types.js';

export interface AppState {
    document: DocumentManifest | null;
    activePageId: string | null;
    dirty: boolean;
}

type Listener = (state: AppState) => void;

const state: AppState = {
    document: null,
    activePageId: null,
    dirty: false
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
    state.dirty = false;
    notify();
}

export function markClean(): void {
    state.dirty = false;
    notify();
}

export function setActivePage(pageId: string): void {
    state.activePageId = pageId;
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
