import { primaryModifierLabel } from './dom.js';

export type ShortcutId =
    | 'new'
    | 'browse'
    | 'save'
    | 'reorderPageUp'
    | 'reorderPageDown'
    | 'toggleMode'
    | 'newPage'
    | 'newPageFromImages'
    | 'toggleActivePageSelection'
    | 'toggleSelectAllPages'
    | 'deleteActivePage'
    | 'deleteSelectedPages'
    | 'renameDocument'
    | 'renameActivePage'
    | 'toggleSidebar'
    | 'toggleFullscreen'
    | 'hideAll'
    | 'revealAll';

export interface ShortcutSpec {
    key: string;
    modifier: 'primary' | 'primaryShift' | 'shift' | 'none';
    displayKey: string;
}

export const SHORTCUTS: Record<ShortcutId, ShortcutSpec> = {
    new: { key: 'd', modifier: 'primary', displayKey: 'D' },
    browse: { key: 'b', modifier: 'primary', displayKey: 'B' },
    save: { key: 's', modifier: 'primary', displayKey: 'S' },
    reorderPageUp: { key: 'ArrowUp', modifier: 'primary', displayKey: 'Up arrow' },
    reorderPageDown: { key: 'ArrowDown', modifier: 'primary', displayKey: 'Down arrow' },
    toggleMode: { key: 'm', modifier: 'none', displayKey: 'M' },
    newPage: { key: 'a', modifier: 'primary', displayKey: 'A' },
    newPageFromImages: { key: 'a', modifier: 'primaryShift', displayKey: 'A' },
    toggleActivePageSelection: { key: 'Enter', modifier: 'primary', displayKey: 'Enter' },
    toggleSelectAllPages: { key: 'Enter', modifier: 'primaryShift', displayKey: 'Enter' },
    deleteActivePage: { key: 'x', modifier: 'primary', displayKey: 'X' },
    deleteSelectedPages: { key: 'x', modifier: 'primaryShift', displayKey: 'X' },
    renameDocument: { key: 'F2', modifier: 'none', displayKey: 'F2' },
    renameActivePage: { key: 'F2', modifier: 'primary', displayKey: 'F2' },
    toggleSidebar: { key: 'h', modifier: 'primary', displayKey: 'H' },
    toggleFullscreen: { key: 'f', modifier: 'none', displayKey: 'F' },
    hideAll: { key: '.', modifier: 'none', displayKey: '.' },
    revealAll: { key: '.', modifier: 'shift', displayKey: '.' }
};

export function shortcutHint(id: ShortcutId): string {
    const spec = SHORTCUTS[id];
    if (spec.modifier === 'primaryShift') {
        return `${primaryModifierLabel()}+Shift+${spec.displayKey}`;
    }
    if (spec.modifier === 'primary') {
        return `${primaryModifierLabel()}+${spec.displayKey}`;
    }
    if (spec.modifier === 'shift') {
        return `Shift+${spec.displayKey}`;
    }
    return spec.displayKey;
}
