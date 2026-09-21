import { isPrimaryModifierPressed } from './dom';
import { isBlockedByInputOrDialog } from './keyboardNav';
import { SHORTCUTS, type ShortcutId, type ShortcutSpec } from './shortcuts';

const handlersById: Partial<Record<ShortcutId, () => void>> = {};

export function registerShortcut(id: ShortcutId, handler: () => void): void {
    handlersById[id] = handler;
}

export function initShortcutDispatch(): void {
    document.addEventListener('keydown', onKeyDown);
}

function onKeyDown(event: KeyboardEvent): void {
    if (event.repeat || isBlockedByInputOrDialog()) {
        return;
    }
    const isFullscreen = document.fullscreenElement !== null;
    const id = matchShortcutId(event.key, modifierCombo(event));
    if (!id || (isFullscreen && !SHORTCUTS[id].allowInFullscreen)) {
        return;
    }
    event.preventDefault();
    handlersById[id]?.();
}

const SHORTCUT_LOOKUP = buildShortcutLookup();

function buildShortcutLookup(): Partial<Record<string, ShortcutId>> {
    const lookup: Partial<Record<string, ShortcutId>> = {};
    for (const id of Object.keys(SHORTCUTS) as ShortcutId[]) {
        const spec = SHORTCUTS[id];
        lookup[shortcutLookupKey(spec.key, spec.modifier)] = id;
    }
    return lookup;
}

function shortcutLookupKey(key: string, modifier: ShortcutSpec['modifier']): string {
    return `${key.toLowerCase()}:${modifier}`;
}

export function matchShortcutId(key: string, modifier: ShortcutSpec['modifier']): ShortcutId | null {
    return SHORTCUT_LOOKUP[shortcutLookupKey(key, modifier)] ?? null;
}

function modifierCombo(event: KeyboardEvent): ShortcutSpec['modifier'] {
    if (isPrimaryModifierPressed(event)) {
        return event.shiftKey ? 'primaryShift' : 'primary';
    }
    return event.shiftKey ? 'shift' : 'none';
}
