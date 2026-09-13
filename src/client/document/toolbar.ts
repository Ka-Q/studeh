import { createDocument, saveDocument } from './api.js';
import { confirmDiscardIfDirty, getState, markClean, renameDocument, setDocument, subscribe } from './state.js';
import { openDocumentDialog } from './openDialog.js';
import { requireElement } from '../dom.js';
import { reportError } from '../errors.js';

export function initToolbar(): void {
    const newButton = requireElement('btn-new');
    const openButton = requireElement('btn-open');
    const saveButton = requireElement('btn-save');
    const renameButton = requireElement('btn-rename-document');
    const titleEl = requireElement('doc-title');
    const dirtyEl = requireElement('dirty-indicator');

    newButton.addEventListener('click', onNew);
    openButton.addEventListener('click', openDocumentDialog);
    saveButton.addEventListener('click', onSave);
    renameButton.addEventListener('click', onRenameDocument);

    subscribe(function renderOnChange(state) {
        titleEl.textContent = state.document?.name ?? 'No document open';
        dirtyEl.hidden = !state.dirty;
        saveButton.toggleAttribute('disabled', !state.document);
        renameButton.toggleAttribute('disabled', !state.document);
    });
}

async function onNew(): Promise<void> {
    if (!confirmDiscardIfDirty()) {
        return;
    }
    const name = prompt('Document name', 'Untitled document');
    if (!name) {
        return;
    }
    try {
        setDocument(await createDocument(name));
    } catch (error) {
        reportError('create document', error);
    }
}

async function onSave(): Promise<void> {
    const doc = getState().document;
    if (!doc) {
        return;
    }
    try {
        await saveDocument(doc);
        markClean();
    } catch (error) {
        reportError('save document', error);
    }
}

function onRenameDocument(): void {
    const doc = getState().document;
    if (!doc) {
        return;
    }
    const name = prompt('Rename document', doc.name);
    if (name) {
        renameDocument(name);
    }
}
