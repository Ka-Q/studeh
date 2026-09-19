import { onNew, onSave } from './document/toolbar.js';
import { browseDialog } from './document/browseDialog.js';
import { isPrimaryModifierPressed } from './dom.js';
import { isBlockedByInputOrDialog } from './keyboardNav.js';
import { SHORTCUTS } from './shortcuts.js';

const ACTIONS_BY_KEY: Record<string, () => void> = {
    [SHORTCUTS.new.key]: onNew,
    [SHORTCUTS.browse.key]: browseDialog,
    [SHORTCUTS.save.key]: onSave
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
