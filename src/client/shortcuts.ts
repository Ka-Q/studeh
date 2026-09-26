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
    | 'openHelp'
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

export type ShortcutGroup = 'document' | 'pages' | 'canvas';

export interface ShortcutSpec {
    label: string;
    group: ShortcutGroup;
    bindings: KeyBinding[];
    allowInFullscreen: boolean;
}

export const SHORTCUTS: Record<ShortcutId, ShortcutSpec> = {
    new: { label: 'New document', group: 'document', bindings: [{ key: 'd', modifier: Modifier.PRIMARY, displayKey: 'D' }], allowInFullscreen: false },
    browse: { label: 'Browse documents', group: 'document', bindings: [{ key: 'b', modifier: Modifier.PRIMARY, displayKey: 'B' }], allowInFullscreen: false },
    save: { label: 'Save document', group: 'document', bindings: [{ key: 's', modifier: Modifier.PRIMARY, displayKey: 'S' }], allowInFullscreen: false },
    reorderPageUp: { label: 'Move page up', group: 'pages', bindings: [{ key: 'ArrowUp', modifier: Modifier.PRIMARY, displayKey: 'Up arrow' }], allowInFullscreen: false },
    reorderPageDown: { label: 'Move page down', group: 'pages', bindings: [{ key: 'ArrowDown', modifier: Modifier.PRIMARY, displayKey: 'Down arrow' }], allowInFullscreen: false },
    selectPreviousPage: {
        label: 'Previous page',
        group: 'pages',
        bindings: [
            { key: 'ArrowUp', modifier: Modifier.NONE, displayKey: 'Up arrow' },
            { key: 'ArrowLeft', modifier: Modifier.NONE, displayKey: 'Left arrow' }
        ],
        allowInFullscreen: true
    },
    selectNextPage: {
        label: 'Next page',
        group: 'pages',
        bindings: [
            { key: 'ArrowDown', modifier: Modifier.NONE, displayKey: 'Down arrow' },
            { key: 'ArrowRight', modifier: Modifier.NONE, displayKey: 'Right arrow' }
        ],
        allowInFullscreen: true
    },
    toggleMode: { label: 'Switch Edit / Study mode', group: 'document', bindings: [{ key: 'm', modifier: Modifier.NONE, displayKey: 'M' }], allowInFullscreen: false },
    newPage: { label: 'Add empty page', group: 'pages', bindings: [{ key: 'a', modifier: Modifier.PRIMARY, displayKey: 'A' }], allowInFullscreen: false },
    newPageFromImages: { label: 'Add page(s) from image', group: 'pages', bindings: [{ key: 'a', modifier: Modifier.PRIMARY_SHIFT, displayKey: 'A' }], allowInFullscreen: false },
    toggleActivePageSelection: { label: 'Select / deselect current page', group: 'pages', bindings: [{ key: 'Enter', modifier: Modifier.PRIMARY, displayKey: 'Enter' }], allowInFullscreen: false },
    toggleSelectAllPages: { label: 'Select / deselect all pages', group: 'pages', bindings: [{ key: 'Enter', modifier: Modifier.PRIMARY_SHIFT, displayKey: 'Enter' }], allowInFullscreen: false },
    deleteActivePage: { label: 'Delete current page', group: 'pages', bindings: [{ key: 'x', modifier: Modifier.PRIMARY, displayKey: 'X' }], allowInFullscreen: false },
    deleteSelectedPages: { label: 'Delete selected pages', group: 'pages', bindings: [{ key: 'x', modifier: Modifier.PRIMARY_SHIFT, displayKey: 'X' }], allowInFullscreen: false },
    renameDocument: { label: 'Rename document', group: 'document', bindings: [{ key: 'F2', modifier: Modifier.NONE, displayKey: 'F2' }], allowInFullscreen: false },
    renameActivePage: { label: 'Rename current page', group: 'pages', bindings: [{ key: 'F2', modifier: Modifier.PRIMARY, displayKey: 'F2' }], allowInFullscreen: false },
    toggleSidebar: { label: 'Show / hide sidebar', group: 'document', bindings: [{ key: 'h', modifier: Modifier.PRIMARY, displayKey: 'H' }], allowInFullscreen: false },
    openHelp: { label: 'Open this help overlay', group: 'document', bindings: [{ key: '?', modifier: Modifier.ANY, displayKey: '?' }], allowInFullscreen: false },
    toggleFullscreen: { label: 'Enter / exit fullscreen', group: 'canvas', bindings: [{ key: 'f', modifier: Modifier.NONE, displayKey: 'F' }], allowInFullscreen: true },
    hideAll: { label: 'Hide all shapes (Study mode)', group: 'canvas', bindings: [{ key: '.', modifier: Modifier.ANY, displayKey: '.' }], allowInFullscreen: true },
    revealAll: { label: 'Reveal all shapes (Study mode)', group: 'canvas', bindings: [{ key: ',', modifier: Modifier.ANY, displayKey: ',' }], allowInFullscreen: true },
    toggleCanvasHints: { label: 'Show / hide shortcut hints', group: 'canvas', bindings: [{ key: 'h', modifier: Modifier.NONE, displayKey: 'H' }], allowInFullscreen: true },
    zoomIn: { label: 'Zoom in', group: 'canvas', bindings: [{ key: '+', modifier: Modifier.ANY, displayKey: '+' }], allowInFullscreen: true },
    zoomOut: { label: 'Zoom out', group: 'canvas', bindings: [{ key: '-', modifier: Modifier.ANY, displayKey: '-' }], allowInFullscreen: true },
    resetZoom: { label: 'Reset zoom to 100%', group: 'canvas', bindings: [{ key: '0', modifier: Modifier.ANY, displayKey: '0' }], allowInFullscreen: true },
    fitToView: { label: 'Fit image to view', group: 'canvas', bindings: [{ key: '=', modifier: Modifier.ANY, displayKey: '=' }], allowInFullscreen: true },
    deleteSelectedShape: {
        label: 'Delete selected shape (Edit mode)',
        group: 'canvas',
        bindings: [
            { key: 'Delete', modifier: Modifier.NONE, displayKey: 'Delete' },
            { key: 'Backspace', modifier: Modifier.NONE, displayKey: 'Backspace' }
        ],
        allowInFullscreen: false
    },
    cycleFocusedShapeNext: { label: 'Cycle focused shape (Study mode)', group: 'canvas', bindings: [{ key: 'Tab', modifier: Modifier.NONE, displayKey: 'Tab' }], allowInFullscreen: true },
    cycleFocusedShapePrev: { label: 'Cycle focused shape backward (Study mode)', group: 'canvas', bindings: [{ key: 'Tab', modifier: Modifier.SHIFT, displayKey: 'Tab' }], allowInFullscreen: true },
    toggleFocusedShapeVisibility: {
        label: 'Toggle focused shape (Study mode)',
        group: 'canvas',
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
