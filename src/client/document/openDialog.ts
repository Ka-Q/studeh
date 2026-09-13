import { getDocument, listDocuments } from './api.js';
import { confirmDiscardIfDirty, setDocument } from './state.js';
import type { DocumentSummary } from './types.js';
import { requireElement } from '../dom.js';
import { reportError } from '../errors.js';

let dialog: HTMLDialogElement;
let listEl: HTMLElement;

export function initOpenDialog(): void {
    dialog = requireElement('open-dialog') as HTMLDialogElement;
    listEl = requireElement('document-list');
    const closeButton = requireElement('btn-close-open-dialog');

    closeButton.addEventListener('click', function onClose() {
        dialog.close();
    });
}

export async function openDocumentDialog(): Promise<void> {
    try {
        renderDocumentList(await listDocuments());
        dialog.showModal();
    } catch (error) {
        reportError('load documents', error);
    }
}

function renderDocumentList(summaries: DocumentSummary[]): void {
    listEl.innerHTML = '';

    if (summaries.length === 0) {
        const empty = document.createElement('li');
        empty.textContent = 'No documents saved yet.';
        listEl.appendChild(empty);
        return;
    }

    for (const summary of summaries) {
        listEl.appendChild(renderDocumentItem(summary));
    }
}

function renderDocumentItem(summary: DocumentSummary): HTMLLIElement {
    const item = document.createElement('li');

    const openButton = document.createElement('button');
    openButton.className = 'document-open';
    const pageLabel = summary.pageCount === 1 ? 'page' : 'pages';
    openButton.textContent = `${summary.name} (${summary.pageCount} ${pageLabel})`;
    openButton.addEventListener('click', async function onOpenDocument() {
        if (!confirmDiscardIfDirty()) {
            return;
        }
        try {
            setDocument(await getDocument(summary.id));
            dialog.close();
        } catch (error) {
            reportError('open document', error);
        }
    });

    item.appendChild(openButton);
    return item;
}
