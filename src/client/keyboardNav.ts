import { getState, movePage, setActivePage } from './document/state';
import { registerShortcut } from './shortcutDispatch';

export function initKeyboardNav(): void {
    registerShortcut('selectPreviousPage', function onSelectPreviousPage() {
        selectAdjacentPage(-1);
    });
    registerShortcut('selectNextPage', function onSelectNextPage() {
        selectAdjacentPage(1);
    });
    registerShortcut('reorderPageUp', function onReorderUp() {
        reorderActivePage(-1);
    });
    registerShortcut('reorderPageDown', function onReorderDown() {
        reorderActivePage(1);
    });
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
