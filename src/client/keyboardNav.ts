import { getState, movePage, setActivePage } from './document/state';
import { isPrimaryModifierPressed } from './dom';
import { SHORTCUTS } from './shortcuts';

const previousPageKeys = new Set(['ArrowUp', 'ArrowLeft']);
const nextPageKeys = new Set(['ArrowDown', 'ArrowRight']);
const reorderableKeys = new Set([SHORTCUTS.reorderPageUp.key, SHORTCUTS.reorderPageDown.key]);

export function initKeyboardNav(): void {
    document.addEventListener('keydown', onKeyDown);
}

function onKeyDown(event: KeyboardEvent): void {
    if (isBlockedByInputOrDialog()) {
        return;
    }
    if (previousPageKeys.has(event.key)) {
        handleArrowKey(event, -1);
    } else if (nextPageKeys.has(event.key)) {
        handleArrowKey(event, 1);
    }
}

function handleArrowKey(event: KeyboardEvent, direction: -1 | 1): void {
    if (reorderableKeys.has(event.key) && isPrimaryModifierPressed(event)) {
        event.preventDefault();
        reorderActivePage(direction);
    } else {
        selectAdjacentPage(direction);
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
