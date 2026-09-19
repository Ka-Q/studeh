import { primaryModifierLabel } from './dom.js';

export type ShortcutId = 'new' | 'browse' | 'save' | 'reorderPageUp' | 'reorderPageDown' | 'toggleMode';

interface ShortcutSpec {
    key: string;
    modifier: 'primary' | 'none';
    displayKey: string;
}

export const SHORTCUTS: Record<ShortcutId, ShortcutSpec> = {
    new: { key: 'd', modifier: 'primary', displayKey: 'D' },
    browse: { key: 'b', modifier: 'primary', displayKey: 'B' },
    save: { key: 's', modifier: 'primary', displayKey: 'S' },
    reorderPageUp: { key: 'ArrowUp', modifier: 'primary', displayKey: 'Up arrow' },
    reorderPageDown: { key: 'ArrowDown', modifier: 'primary', displayKey: 'Down arrow' },
    toggleMode: { key: 'm', modifier: 'none', displayKey: 'M' }
};

export function shortcutHint(id: ShortcutId): string {
    const spec = SHORTCUTS[id];
    return spec.modifier === 'primary' ? `${primaryModifierLabel()}+${spec.displayKey}` : spec.displayKey;
}
