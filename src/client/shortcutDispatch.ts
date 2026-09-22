import { isBlockedByInputOrDialog, isPrimaryModifierPressed } from './dom';
import { SHORTCUTS, type ShortcutId, type ShortcutModifier } from './shortcuts';

// Some physical keys produce a different `event.key` symbol when Shift is held
// (e.g. Period -> '.'/'>'), which would otherwise vary by keyboard layout.
const CODE_TO_KEY: Partial<Record<string, string>> = {
    Period: '.'
};

interface ShortcutRegistration {
    handler: () => void;
    guard?: () => boolean;
}

const handlersById: Partial<Record<ShortcutId, ShortcutRegistration>> = {};

export function registerShortcut(id: ShortcutId, handler: () => void, guard?: () => boolean): void {
    handlersById[id] = { handler, guard };
}

export function initShortcutDispatch(): void {
    document.addEventListener('keydown', onKeyDown);
}

function onKeyDown(event: KeyboardEvent): void {
    if (event.repeat || isBlockedByInputOrDialog()) {
        return;
    }
    const isFullscreen = document.fullscreenElement !== null;
    const id = matchShortcutId(resolveKey(event), modifierCombo(event));
    if (!id || (isFullscreen && !SHORTCUTS[id].allowInFullscreen)) {
        return;
    }
    event.preventDefault();
    const registration = handlersById[id];
    if (registration && (!registration.guard || registration.guard())) {
        registration.handler();
    }
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

export function resolveKey(event: Pick<KeyboardEvent, 'key' | 'code'>): string {
    return CODE_TO_KEY[event.code] ?? event.key;
}

function modifierCombo(event: KeyboardEvent): ShortcutModifier {
    if (isPrimaryModifierPressed(event)) {
        return event.shiftKey ? 'primaryShift' : 'primary';
    }
    return event.shiftKey ? 'shift' : 'none';
}
