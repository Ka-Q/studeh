import { getDocument } from './api.js';
import { documentUrlPath, getState, setDocument } from './state.js';
import { confirmDiscardIfDirty } from './discardGuard.js';
import { reportError } from '../errors.js';

export function initNavigationGuard(): void {
    window.addEventListener('popstate', async function onPopState() {
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
