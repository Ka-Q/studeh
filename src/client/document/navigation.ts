import { getDocument } from './api';
import { documentUrlPath, getState, setDocument } from './state';
import { confirmDiscardIfDirty } from './discardGuard';
import { onSave } from './toolbar';
import { confirmChoiceDialog } from '../dialogs/confirmDialog';
import { isPrimaryModifierPressed } from '../dom';
import { reportError } from '../errors';

let isReloadConfirmed = false;

export function initNavigationGuard(): void {
    // Closing the tab, the browser's reload button or leaving the app: the browser asks with its own wording, which a
    // page can't set. A reload from the keyboard reaches the page first and asks with the app's own dialog instead.
    window.addEventListener('beforeunload', (event) => {
        if (getState().dirty && !isReloadConfirmed) {
            event.preventDefault();
        }
    });
    window.addEventListener('keydown', (event) => {
        if (getState().dirty && isReloadKey(event)) {
            event.preventDefault();
            // Already asking (or held down): one dialog at a time.
            if (!document.querySelector('dialog[open]')) {
                void confirmReload();
            }
        }
    }, { capture: true });
    window.addEventListener('popstate', async () => {
        const id = location.pathname.slice(1);
        const openDocument = getState().document;
        if (id === openDocument?.id || (!id && !openDocument)) {
            return;
        }
        if (!(await confirmDiscardIfDirty())) {
            history.pushState(null, '', documentUrlPath(getState().document));
            return;
        }
        if (!id) {
            setDocument(null);
            return;
        }
        try {
            setDocument(await getDocument(id));
        } catch (error) {
            history.replaceState(null, '', documentUrlPath(getState().document));
            reportError('open document', error);
        }
    });
}

function isReloadKey(event: KeyboardEvent): boolean {
    return event.key === 'F5' || (isPrimaryModifierPressed(event) && event.key.toLowerCase() === 'r');
}

async function confirmReload(): Promise<void> {
    const choice = await confirmChoiceDialog({
        title: 'Reload with unsaved changes?',
        message: 'Save your changes before the page reloads, or discard them?',
        confirmLabel: 'Save',
        confirmIcon: 'icon-save',
        danger: false,
        alternative: { label: 'Discard', icon: 'icon-trash' }
    });
    if (choice === 'confirmed') {
        await onSave();
    }
    if (choice === 'alternative' || (choice === 'confirmed' && !getState().dirty)) {
        isReloadConfirmed = true;
        location.reload();
    }
}
