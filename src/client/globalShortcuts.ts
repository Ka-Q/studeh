import { onNew, onSave } from './document/toolbar.js';
import { browseDialog } from './document/browseDialog.js';
import { isPrimaryModifierPressed } from './dom.js';
import { isBlockedByInputOrDialog } from './keyboardNav.js';

const ACTIONS_BY_KEY: Record<string, () => void> = {
    d: onNew,
    b: browseDialog,
    s: onSave
};

export function initGlobalShortcuts(): void {
    document.addEventListener('keydown', onKeyDown);
}

function onKeyDown(event: KeyboardEvent): void {
    if (!isPrimaryModifierPressed(event) || isBlockedByInputOrDialog()) {
        return;
    }
    const action = ACTIONS_BY_KEY[event.key.toLowerCase()];
    if (action) {
        event.preventDefault();
        action();
    }
}
