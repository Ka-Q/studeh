import { createDocument, saveDocument } from './api.js';
import { getState, markClean, renameDocument, setDocument, subscribe } from './state.js';
import { confirmDiscardIfDirty } from './navigation.js';
import { openDocumentDialog } from './openDialog.js';
import { newDocumentDialog } from '../dialogs/newDocumentDialog.js';
import { requireElement } from '../dom.js';
import { reportError } from '../errors.js';
import { startInlineEdit } from '../inlineEdit.js';

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
    renameButton.addEventListener('click', function onRename() {
        onRenameDocument(titleEl);
    });

    subscribe(function renderOnChange(state) {
        titleEl.textContent = state.document?.name ?? 'No document open';
        titleEl.title = state.document?.name ?? '';
        dirtyEl.hidden = !state.dirty;
        saveButton.toggleAttribute('disabled', !state.document);
        renameButton.toggleAttribute('disabled', !state.document);
    });
}

async function onNew(): Promise<void> {
    if (!(await confirmDiscardIfDirty())) {
        return;
    }
    const name = await newDocumentDialog();
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

function onRenameDocument(titleEl: HTMLElement): void {
    const doc = getState().document;
    if (!doc) {
        return;
    }
    const documentId = doc.id;
    startInlineEdit(titleEl, doc.name, function onCommit(name) {
        if (getState().document?.id === documentId) {
            renameDocument(name);
        }
    });
}
