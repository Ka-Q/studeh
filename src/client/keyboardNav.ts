import { getState, movePage, setActivePage } from './document/state';
import { isPrimaryModifierPressed } from './dom';
import { registerRawKeydown, registerShortcut } from './shortcutDispatch';

const previousPageKeys = new Set(['ArrowUp', 'ArrowLeft']);
const nextPageKeys = new Set(['ArrowDown', 'ArrowRight']);

export function initKeyboardNav(): void {
    registerRawKeydown(onKeyDown, { allowInFullscreen: true });
    registerShortcut('reorderPageUp', function onReorderUp() {
        reorderActivePage(-1);
    });
    registerShortcut('reorderPageDown', function onReorderDown() {
        reorderActivePage(1);
    });
}

function onKeyDown(event: KeyboardEvent): void {
    if (isPrimaryModifierPressed(event)) {
        return;
    }
    if (previousPageKeys.has(event.key)) {
        selectAdjacentPage(-1);
    } else if (nextPageKeys.has(event.key)) {
        selectAdjacentPage(1);
    }
}

function reorderActivePage(direction: -1 | 1): void {
    const { activePageId } = getState();
    if (activePageId) {
        movePage(activePageId, direction);
    }
}

function selectAdjacentPage(direction: -1 | 1): void {
    const { document: doc, activePageId } = getState();
    if (!doc || doc.pages.length === 0) {
        return;
    }
    const currentIndex = doc.pages.findIndex(function matchesActive(page) {
        return page.id === activePageId;
    });
    if (currentIndex === -1) {
        return;
    }
    const nextIndex = Math.min(doc.pages.length - 1, Math.max(0, currentIndex + direction));
    if (nextIndex !== currentIndex) {
        setActivePage(doc.pages[nextIndex].id);
    }
}

export function isBlockedByInputOrDialog(): boolean {
    return isTypingTarget() || document.querySelector('dialog[open]') !== null;
}

function isTypingTarget(): boolean {
    const active = document.activeElement;
    if (!active) {
        return false;
    }
    return active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || (active as HTMLElement).isContentEditable;
}
