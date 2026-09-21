import { isBlockedByInputOrDialog, isPrimaryModifierPressed } from './dom';
import { SHORTCUTS, type ShortcutId, type ShortcutModifier } from './shortcuts';

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
        for (const binding of SHORTCUTS[id].bindings) {
            lookup[shortcutLookupKey(binding.key, binding.modifier)] = id;
        }
    }
    return lookup;
}

function shortcutLookupKey(key: string, modifier: ShortcutModifier): string {
    return `${key.toLowerCase()}:${modifier}`;
}

export function matchShortcutId(key: string, modifier: ShortcutModifier): ShortcutId | null {
    return SHORTCUT_LOOKUP[shortcutLookupKey(key, modifier)] ?? null;
}

function modifierCombo(event: KeyboardEvent): ShortcutModifier {
    if (isPrimaryModifierPressed(event)) {
        return event.shiftKey ? 'primaryShift' : 'primary';
    }
    return event.shiftKey ? 'shift' : 'none';
}
