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
    | 'zoomIn'
    | 'zoomOut'
    | 'resetZoom'
    | 'fitToView'
    | 'deleteSelectedShape'
    | 'cycleFocusedShapeNext'
    | 'cycleFocusedShapePrev'
    | 'toggleFocusedShapeVisibility';

export const Modifier = {
    PRIMARY: 'primary',
    PRIMARY_SHIFT: 'primaryShift',
    SHIFT: 'shift',
    NONE: 'none',
    ANY: 'any'      // Matches whatever Shift/AltGr state produces the symbol, never Ctrl/Cmd. Default for symbol keys (which modifier produces them varies by layout).
} as const;

export type Modifier = typeof Modifier[keyof typeof Modifier];

export interface KeyBinding {
    key: string;
    modifier: Modifier;
    displayKey: string;
}

export interface ShortcutSpec {
    bindings: KeyBinding[];
    allowInFullscreen: boolean;
}

export const SHORTCUTS: Record<ShortcutId, ShortcutSpec> = {
    new: { bindings: [{ key: 'd', modifier: Modifier.PRIMARY, displayKey: 'D' }], allowInFullscreen: false },
    browse: { bindings: [{ key: 'b', modifier: Modifier.PRIMARY, displayKey: 'B' }], allowInFullscreen: false },
    save: { bindings: [{ key: 's', modifier: Modifier.PRIMARY, displayKey: 'S' }], allowInFullscreen: false },
    reorderPageUp: { bindings: [{ key: 'ArrowUp', modifier: Modifier.PRIMARY, displayKey: 'Up arrow' }], allowInFullscreen: false },
    reorderPageDown: { bindings: [{ key: 'ArrowDown', modifier: Modifier.PRIMARY, displayKey: 'Down arrow' }], allowInFullscreen: false },
    selectPreviousPage: {
        bindings: [
            { key: 'ArrowUp', modifier: Modifier.NONE, displayKey: 'Up arrow' },
            { key: 'ArrowLeft', modifier: Modifier.NONE, displayKey: 'Left arrow' }
        ],
        allowInFullscreen: true
    },
    selectNextPage: {
        bindings: [
            { key: 'ArrowDown', modifier: Modifier.NONE, displayKey: 'Down arrow' },
            { key: 'ArrowRight', modifier: Modifier.NONE, displayKey: 'Right arrow' }
        ],
        allowInFullscreen: true
    },
    toggleMode: { bindings: [{ key: 'm', modifier: Modifier.NONE, displayKey: 'M' }], allowInFullscreen: false },
    newPage: { bindings: [{ key: 'a', modifier: Modifier.PRIMARY, displayKey: 'A' }], allowInFullscreen: false },
    newPageFromImages: { bindings: [{ key: 'a', modifier: Modifier.PRIMARY_SHIFT, displayKey: 'A' }], allowInFullscreen: false },
    toggleActivePageSelection: { bindings: [{ key: 'Enter', modifier: Modifier.PRIMARY, displayKey: 'Enter' }], allowInFullscreen: false },
    toggleSelectAllPages: { bindings: [{ key: 'Enter', modifier: Modifier.PRIMARY_SHIFT, displayKey: 'Enter' }], allowInFullscreen: false },
    deleteActivePage: { bindings: [{ key: 'x', modifier: Modifier.PRIMARY, displayKey: 'X' }], allowInFullscreen: false },
    deleteSelectedPages: { bindings: [{ key: 'x', modifier: Modifier.PRIMARY_SHIFT, displayKey: 'X' }], allowInFullscreen: false },
    renameDocument: { bindings: [{ key: 'F2', modifier: Modifier.NONE, displayKey: 'F2' }], allowInFullscreen: false },
    renameActivePage: { bindings: [{ key: 'F2', modifier: Modifier.PRIMARY, displayKey: 'F2' }], allowInFullscreen: false },
    toggleSidebar: { bindings: [{ key: 'h', modifier: Modifier.PRIMARY, displayKey: 'H' }], allowInFullscreen: false },
    toggleFullscreen: { bindings: [{ key: 'f', modifier: Modifier.NONE, displayKey: 'F' }], allowInFullscreen: true },
    hideAll: { bindings: [{ key: '.', modifier: Modifier.ANY, displayKey: '.' }], allowInFullscreen: true },
    revealAll: { bindings: [{ key: ',', modifier: Modifier.ANY, displayKey: ',' }], allowInFullscreen: true },
    toggleCanvasHints: { bindings: [{ key: 'h', modifier: Modifier.NONE, displayKey: 'H' }], allowInFullscreen: true },
    zoomIn: { bindings: [{ key: '+', modifier: Modifier.ANY, displayKey: '+' }], allowInFullscreen: true },
    zoomOut: { bindings: [{ key: '-', modifier: Modifier.ANY, displayKey: '-' }], allowInFullscreen: true },
    resetZoom: { bindings: [{ key: '0', modifier: Modifier.ANY, displayKey: '0' }], allowInFullscreen: true },
    fitToView: { bindings: [{ key: '=', modifier: Modifier.ANY, displayKey: '=' }], allowInFullscreen: true },
    deleteSelectedShape: {
        bindings: [
            { key: 'Delete', modifier: Modifier.NONE, displayKey: 'Delete' },
            { key: 'Backspace', modifier: Modifier.NONE, displayKey: 'Backspace' }
        ],
        allowInFullscreen: false
    },
    cycleFocusedShapeNext: { bindings: [{ key: 'Tab', modifier: Modifier.NONE, displayKey: 'Tab' }], allowInFullscreen: true },
    cycleFocusedShapePrev: { bindings: [{ key: 'Tab', modifier: Modifier.SHIFT, displayKey: 'Tab' }], allowInFullscreen: true },
    toggleFocusedShapeVisibility: {
        bindings: [
            { key: ' ', modifier: Modifier.NONE, displayKey: 'Space' },
            { key: 'Enter', modifier: Modifier.NONE, displayKey: 'Enter' }
        ],
        allowInFullscreen: true
    }
};

export function shortcutHint(id: ShortcutId): string {
    return SHORTCUTS[id].bindings.map(formatBinding).join(' / ');
}

function formatBinding(binding: KeyBinding): string {
    if (binding.modifier === Modifier.PRIMARY_SHIFT) {
        return `${primaryModifierLabel()}+Shift+${binding.displayKey}`;
    }
    if (binding.modifier === Modifier.PRIMARY) {
        return `${primaryModifierLabel()}+${binding.displayKey}`;
    }
    if (binding.modifier === Modifier.SHIFT) {
        return `Shift+${binding.displayKey}`;
    }
    return binding.displayKey;
}
