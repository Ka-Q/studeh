import { primaryModifierLabel } from './dom';

export type ShortcutId =
    | 'new'
    | 'browse'
    | 'save'
    | 'reorderPageUp'
    | 'reorderPageDown'
    | 'selectPreviousPage'
    | 'selectNextPage'
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
    | 'toggleCanvasHints'
    | 'deleteSelectedShape'
    | 'cycleFocusedShapeNext'
    | 'cycleFocusedShapePrev'
    | 'toggleFocusedShapeVisibility';

export type ShortcutModifier = 'primary' | 'primaryShift' | 'shift' | 'none';

export interface KeyBinding {
    key: string;
    modifier: ShortcutModifier;
    displayKey: string;
}

export interface ShortcutSpec {
    bindings: KeyBinding[];
    allowInFullscreen: boolean;
}

export const SHORTCUTS: Record<ShortcutId, ShortcutSpec> = {
    new: { bindings: [{ key: 'd', modifier: 'primary', displayKey: 'D' }], allowInFullscreen: false },
    browse: { bindings: [{ key: 'b', modifier: 'primary', displayKey: 'B' }], allowInFullscreen: false },
    save: { bindings: [{ key: 's', modifier: 'primary', displayKey: 'S' }], allowInFullscreen: false },
    reorderPageUp: { bindings: [{ key: 'ArrowUp', modifier: 'primary', displayKey: 'Up arrow' }], allowInFullscreen: false },
    reorderPageDown: { bindings: [{ key: 'ArrowDown', modifier: 'primary', displayKey: 'Down arrow' }], allowInFullscreen: false },
    selectPreviousPage: {
        bindings: [
            { key: 'ArrowUp', modifier: 'none', displayKey: 'Up arrow' },
            { key: 'ArrowLeft', modifier: 'none', displayKey: 'Left arrow' }
        ],
        allowInFullscreen: true
    },
    selectNextPage: {
        bindings: [
            { key: 'ArrowDown', modifier: 'none', displayKey: 'Down arrow' },
            { key: 'ArrowRight', modifier: 'none', displayKey: 'Right arrow' }
        ],
        allowInFullscreen: true
    },
    toggleMode: { bindings: [{ key: 'm', modifier: 'none', displayKey: 'M' }], allowInFullscreen: false },
    newPage: { bindings: [{ key: 'a', modifier: 'primary', displayKey: 'A' }], allowInFullscreen: false },
    newPageFromImages: { bindings: [{ key: 'a', modifier: 'primaryShift', displayKey: 'A' }], allowInFullscreen: false },
    toggleActivePageSelection: { bindings: [{ key: 'Enter', modifier: 'primary', displayKey: 'Enter' }], allowInFullscreen: false },
    toggleSelectAllPages: { bindings: [{ key: 'Enter', modifier: 'primaryShift', displayKey: 'Enter' }], allowInFullscreen: false },
    deleteActivePage: { bindings: [{ key: 'x', modifier: 'primary', displayKey: 'X' }], allowInFullscreen: false },
    deleteSelectedPages: { bindings: [{ key: 'x', modifier: 'primaryShift', displayKey: 'X' }], allowInFullscreen: false },
    renameDocument: { bindings: [{ key: 'F2', modifier: 'none', displayKey: 'F2' }], allowInFullscreen: false },
    renameActivePage: { bindings: [{ key: 'F2', modifier: 'primary', displayKey: 'F2' }], allowInFullscreen: false },
    toggleSidebar: { bindings: [{ key: 'h', modifier: 'primary', displayKey: 'H' }], allowInFullscreen: false },
    toggleFullscreen: { bindings: [{ key: 'f', modifier: 'none', displayKey: 'F' }], allowInFullscreen: true },
    hideAll: { bindings: [{ key: '.', modifier: 'none', displayKey: '.' }], allowInFullscreen: true },
    revealAll: { bindings: [{ key: '.', modifier: 'shift', displayKey: '.' }], allowInFullscreen: true },
    toggleCanvasHints: { bindings: [{ key: 'h', modifier: 'none', displayKey: 'H' }], allowInFullscreen: true },
    deleteSelectedShape: {
        bindings: [
            { key: 'Delete', modifier: 'none', displayKey: 'Delete' },
            { key: 'Backspace', modifier: 'none', displayKey: 'Backspace' }
        ],
        allowInFullscreen: false
    },
    cycleFocusedShapeNext: { bindings: [{ key: 'Tab', modifier: 'none', displayKey: 'Tab' }], allowInFullscreen: true },
    cycleFocusedShapePrev: { bindings: [{ key: 'Tab', modifier: 'shift', displayKey: 'Tab' }], allowInFullscreen: true },
    toggleFocusedShapeVisibility: {
        bindings: [
            { key: ' ', modifier: 'none', displayKey: 'Space' },
            { key: 'Enter', modifier: 'none', displayKey: 'Enter' }
        ],
        allowInFullscreen: true
    }
};

export function shortcutHint(id: ShortcutId): string {
    return SHORTCUTS[id].bindings.map(formatBinding).join(' / ');
}

function formatBinding(binding: KeyBinding): string {
    if (binding.modifier === 'primaryShift') {
        return `${primaryModifierLabel()}+Shift+${binding.displayKey}`;
    }
    if (binding.modifier === 'primary') {
        return `${primaryModifierLabel()}+${binding.displayKey}`;
    }
    if (binding.modifier === 'shift') {
        return `Shift+${binding.displayKey}`;
    }
    return binding.displayKey;
}
