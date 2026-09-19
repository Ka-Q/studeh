import { onNew, onSave } from './document/toolbar.js';
import { browseDialog } from './document/browseDialog.js';
import {
    deleteActivePage,
    deleteSelectedPagesWithConfirm,
    onAddFromImages,
    onAddPage,
    renameActivePage,
    toggleActivePageSelection,
    toggleSelectAllPages,
    toggleSidebarCollapse
} from './pages/sidebar.js';
import { isPrimaryModifierPressed } from './dom.js';
import { isBlockedByInputOrDialog } from './keyboardNav.js';
import { SHORTCUTS, type ShortcutSpec } from './shortcuts.js';

function lookupKey(spec: ShortcutSpec): string {
    return `${spec.modifier === 'primaryShift' ? 'shift+' : ''}${spec.key.toLowerCase()}`;
}

const ACTIONS_BY_KEY: Record<string, () => void> = {
    [lookupKey(SHORTCUTS.new)]: onNew,
    [lookupKey(SHORTCUTS.browse)]: browseDialog,
    [lookupKey(SHORTCUTS.save)]: onSave,
    [lookupKey(SHORTCUTS.newPage)]: onAddPage,
    [lookupKey(SHORTCUTS.newPageFromImages)]: onAddFromImages,
    [lookupKey(SHORTCUTS.toggleActivePageSelection)]: toggleActivePageSelection,
    [lookupKey(SHORTCUTS.toggleSelectAllPages)]: toggleSelectAllPages,
    [lookupKey(SHORTCUTS.deleteActivePage)]: deleteActivePage,
    [lookupKey(SHORTCUTS.deleteSelectedPages)]: deleteSelectedPagesWithConfirm,
    [lookupKey(SHORTCUTS.renameActivePage)]: renameActivePage,
    [lookupKey(SHORTCUTS.toggleSidebar)]: toggleSidebarCollapse
};

export function initGlobalShortcuts(): void {
    document.addEventListener('keydown', onKeyDown);
}

function onKeyDown(event: KeyboardEvent): void {
    if (event.repeat || !isPrimaryModifierPressed(event) || isBlockedByInputOrDialog()) {
        return;
    }
    const key = `${event.shiftKey ? 'shift+' : ''}${event.key.toLowerCase()}`;
    const action = ACTIONS_BY_KEY[key];
    if (action) {
        event.preventDefault();
        action();
    }
}
