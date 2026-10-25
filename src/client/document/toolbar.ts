import { createDocument, saveDocument } from './api';
import { canRedo, canUndo, getState, markClean, redo, renameDocument, setDocument, subscribe, undo } from './state';
import { confirmDiscardIfDirty } from './discardGuard';
import { cancelTransientState, hasTransientState, onTransientStateChange } from './transientState';
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
    const undoButton = requireElement('btn-undo');
    const redoButton = requireElement('btn-redo');
    saveStatusEl = requireElement('save-status');
    const renameButton = requireElement('btn-rename-document');
    titleEl = requireElement('doc-title');

    newButton.title = `New (${shortcutHint('new')})`;
    browseButton.title = `Browse (${shortcutHint('browse')})`;
    saveButton.title = `Save (${shortcutHint('save')})`;
    labelIconButton(undoButton, `Undo (${shortcutHint('undo')})`);
    labelIconButton(redoButton, `Redo (${shortcutHint('redo')})`);
    const renameHint = `Rename document (${shortcutHint('renameDocument')})`;
    labelIconButton(renameButton, renameHint);

    newButton.addEventListener('click', onNew);
    browseButton.addEventListener('click', browseDialog);
    saveButton.addEventListener('click', onSave);
    undoButton.addEventListener('click', undoOrCancel);
    redoButton.addEventListener('click', redoOrCancel);
    renameButton.addEventListener('click', onRenameDocument);
    titleEl.addEventListener('dblclick', onRenameDocument);
    registerShortcut('renameDocument', onRenameDocument);
    registerShortcut('undo', undoOrCancel);
    registerShortcut('redo', redoOrCancel);

    function updateHistoryButtons(): void {
        undoButton.toggleAttribute('disabled', !canUndo() && !hasTransientState());
        redoButton.toggleAttribute('disabled', !canRedo() && !hasTransientState());
    }
    onTransientStateChange(updateHistoryButtons);

    subscribe(function renderOnChange(state) {
        titleEl.textContent = state.document?.name ?? 'No document open';
        titleEl.title = state.document?.name ?? '';
        saveButton.toggleAttribute('disabled', !state.document);
        saveButton.classList.toggle('dirty', state.dirty);
        updateHistoryButtons();
        renameButton.hidden = !state.document;
        updateSaveStatus(state.dirty);
    });
}

// With something shown but not yet in the document, undo and redo only end that.
function undoOrCancel(): void {
    if (!cancelTransientState()) {
        undo();
    }
}

function redoOrCancel(): void {
    if (!cancelTransientState()) {
        redo();
    }
}

function labelIconButton(button: HTMLElement, label: string): void {
    button.title = label;
    button.setAttribute('aria-label', label);
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
        const saved = await saveDocument(doc);
        if (getState().document?.id === doc.id) {
            markClean(saved);
            showSavedStatus();
        }
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
