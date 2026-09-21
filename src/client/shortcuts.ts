import { primaryModifierLabel } from './dom';

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
    | 'revealAll'
    | 'toggleCanvasHints';

export interface ShortcutSpec {
    key: string;
    modifier: 'primary' | 'primaryShift' | 'shift' | 'none';
    displayKey: string;
    allowInFullscreen: boolean;
}

export const SHORTCUTS: Record<ShortcutId, ShortcutSpec> = {
    new: { key: 'd', modifier: 'primary', displayKey: 'D', allowInFullscreen: false },
    browse: { key: 'b', modifier: 'primary', displayKey: 'B', allowInFullscreen: false },
    save: { key: 's', modifier: 'primary', displayKey: 'S', allowInFullscreen: false },
    reorderPageUp: { key: 'ArrowUp', modifier: 'primary', displayKey: 'Up arrow', allowInFullscreen: false },
    reorderPageDown: { key: 'ArrowDown', modifier: 'primary', displayKey: 'Down arrow', allowInFullscreen: false },
    toggleMode: { key: 'm', modifier: 'none', displayKey: 'M', allowInFullscreen: false },
    newPage: { key: 'a', modifier: 'primary', displayKey: 'A', allowInFullscreen: false },
    newPageFromImages: { key: 'a', modifier: 'primaryShift', displayKey: 'A', allowInFullscreen: false },
    toggleActivePageSelection: { key: 'Enter', modifier: 'primary', displayKey: 'Enter', allowInFullscreen: false },
    toggleSelectAllPages: { key: 'Enter', modifier: 'primaryShift', displayKey: 'Enter', allowInFullscreen: false },
    deleteActivePage: { key: 'x', modifier: 'primary', displayKey: 'X', allowInFullscreen: false },
    deleteSelectedPages: { key: 'x', modifier: 'primaryShift', displayKey: 'X', allowInFullscreen: false },
    renameDocument: { key: 'F2', modifier: 'none', displayKey: 'F2', allowInFullscreen: false },
    renameActivePage: { key: 'F2', modifier: 'primary', displayKey: 'F2', allowInFullscreen: false },
    toggleSidebar: { key: 'h', modifier: 'primary', displayKey: 'H', allowInFullscreen: false },
    toggleFullscreen: { key: 'f', modifier: 'none', displayKey: 'F', allowInFullscreen: true },
    hideAll: { key: '.', modifier: 'none', displayKey: '.', allowInFullscreen: true },
    revealAll: { key: '.', modifier: 'shift', displayKey: '.', allowInFullscreen: true },
    toggleCanvasHints: { key: 'h', modifier: 'none', displayKey: 'H', allowInFullscreen: true }
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
