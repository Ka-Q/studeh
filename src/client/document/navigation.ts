import { getDocument } from './api.js';
import { getState, setDocument } from './state.js';
import { confirmDialog } from '../dialogs/confirmDialog.js';
import { reportError } from '../errors.js';

export function confirmDiscardIfDirty(): Promise<boolean> {
    if (!getState().dirty) {
        return Promise.resolve(true);
    }
    return confirmDialog({
        title: 'Discard changes?',
        message: 'You have unsaved changes. Discard them?',
        confirmLabel: 'Discard',
        confirmIcon: 'icon-trash',
        danger: true
    });
}

export function initNavigationGuard(): void {
    window.addEventListener('popstate', async function onPopState() {
        const id = location.pathname.slice(1);
        const openDocument = getState().document;
        if (id === openDocument?.id || (!id && !openDocument)) {
            return;
        }
        if (!(await confirmDiscardIfDirty())) {
            history.pushState(null, '', openDocument ? `/${openDocument.id}` : '/');
            return;
        }
        if (!id) {
            setDocument(null);
            return;
        }
        try {
            setDocument(await getDocument(id));
        } catch (error) {
            const current = getState().document;
            history.replaceState(null, '', current ? `/${current.id}` : '/');
            reportError('open document', error);
        }
    });
}
