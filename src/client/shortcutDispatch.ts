import { isBlockedByInputOrDialog, isPrimaryModifierPressed } from './dom';
import { Modifier, SHORTCUTS, type ShortcutId } from './shortcuts';

interface ShortcutRegistration {
    handler: () => void;
    guard?: () => boolean;
}

const handlersById: Partial<Record<ShortcutId, ShortcutRegistration>> = {};

export function registerShortcut(id: ShortcutId, handler: () => void, guard?: () => boolean): void {
    handlersById[id] = { handler, guard };
}

export function unregisterShortcut(id: ShortcutId): void {
    delete handlersById[id];
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
    const registration = handlersById[id];
    if (!registration || (registration.guard && !registration.guard())) {
        return;
    }
    event.preventDefault();
    registration.handler();
}

const SHORTCUT_LOOKUP = buildShortcutLookup();

function buildShortcutLookup(): Partial<Record<string, ShortcutId>> {
    const lookup: Partial<Record<string, ShortcutId>> = {};
    for (const id of Object.keys(SHORTCUTS) as ShortcutId[]) {
        for (const binding of SHORTCUTS[id].bindings) {
            if (binding.modifier === Modifier.ANY) {
                lookup[shortcutLookupKey(binding.key, Modifier.NONE)] = id;
                lookup[shortcutLookupKey(binding.key, Modifier.SHIFT)] = id;
                continue;
            }
            lookup[shortcutLookupKey(binding.key, binding.modifier)] = id;
        }
    }
    return lookup;
}

function shortcutLookupKey(key: string, modifier: Modifier): string {
    return `${key.toLowerCase()}:${modifier}`;
}

export function matchShortcutId(key: string, modifier: Modifier): ShortcutId | null {
    return SHORTCUT_LOOKUP[shortcutLookupKey(key, modifier)] ?? null;
}

function modifierCombo(event: KeyboardEvent): Modifier {
    // AltGr reports as Ctrl+Alt on Windows/Linux, which would otherwise be
    // misread as the primary modifier on layouts that gate a symbol behind it.
    if (!event.getModifierState('AltGraph') && isPrimaryModifierPressed(event)) {
        return event.shiftKey ? Modifier.PRIMARY_SHIFT : Modifier.PRIMARY;
    }
    return event.shiftKey ? Modifier.SHIFT : Modifier.NONE;
}
