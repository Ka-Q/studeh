import { createDocument, saveDocument } from './api';
import { getState, markClean, renameDocument, setDocument, subscribe } from './state';
import { confirmDiscardIfDirty } from './discardGuard';
import { browseDialog } from './browseDialog';
import { newDocumentDialog } from '../dialogs/newDocumentDialog';
import { requireElement } from '../dom';
import { reportError } from '../errors';
import { startInlineEdit } from '../inlineEdit';
import { registerShortcut } from '../shortcutDispatch';
import { shortcutHint } from '../shortcuts';

const SAVED_STATUS_HOLD_MS = 2000;

let saveStatusEl: HTMLElement;
let saveStatusFadeTimer: ReturnType<typeof setTimeout> | undefined;
let titleEl: HTMLElement;

export function initToolbar(): void {
    const newButton = requireElement('btn-new');
    const browseButton = requireElement('btn-browse');
    const saveButton = requireElement('btn-save');
    saveStatusEl = requireElement('save-status');
    const renameButton = requireElement('btn-rename-document');
    titleEl = requireElement('doc-title');

    newButton.title = `New (${shortcutHint('new')})`;
    browseButton.title = `Browse (${shortcutHint('browse')})`;
    saveButton.title = `Save (${shortcutHint('save')})`;
    const renameHint = `Rename document (${shortcutHint('renameDocument')})`;
    renameButton.title = renameHint;
    renameButton.setAttribute('aria-label', renameHint);

    newButton.addEventListener('click', onNew);
    browseButton.addEventListener('click', browseDialog);
    saveButton.addEventListener('click', onSave);
    renameButton.addEventListener('click', onRenameDocument);
    titleEl.addEventListener('dblclick', onRenameDocument);
    registerShortcut('renameDocument', onRenameDocument);

    subscribe(function renderOnChange(state) {
        titleEl.textContent = state.document?.name ?? 'No document open';
        titleEl.title = state.document?.name ?? '';
        saveButton.toggleAttribute('disabled', !state.document);
        saveButton.classList.toggle('dirty', state.dirty);
        renameButton.hidden = !state.document;
        updateSaveStatus(state.dirty);
    });
}

function updateSaveStatus(dirty: boolean): void {
    clearTimeout(saveStatusFadeTimer);
    saveStatusFadeTimer = undefined;
    if (dirty) {
        saveStatusEl.textContent = 'Unsaved changes';
        saveStatusEl.classList.remove('fading');
        saveStatusEl.classList.add('visible');
    } else {
        saveStatusEl.classList.remove('visible', 'fading');
    }
}

function showSavedStatus(): void {
    saveStatusEl.textContent = 'Saved';
    saveStatusEl.classList.remove('fading');
    saveStatusEl.classList.add('visible');
    saveStatusFadeTimer = setTimeout(function fadeSavedStatus() {
        saveStatusEl.classList.add('fading');
    }, SAVED_STATUS_HOLD_MS);
}

export async function onNew(): Promise<void> {
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

export async function onSave(): Promise<void> {
    const doc = getState().document;
    if (!doc) {
        return;
    }
    try {
        await saveDocument(doc);
        markClean(doc);
        showSavedStatus();
    } catch (error) {
        reportError('save document', error);
    }
}

export function onRenameDocument(): void {
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
