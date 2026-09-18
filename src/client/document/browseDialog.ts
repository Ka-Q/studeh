import { deleteDocument, getDocument, listDocuments, pageImageUrl } from './api.js';
import { getState, setDocument } from './state.js';
import { confirmDiscardIfDirty } from './discardGuard.js';
import type { DocumentSummary } from './types.js';
import { confirmDialog } from '../dialogs/confirmDialog.js';
import { iconSpan, initScrollFade, requireElement, showDialog, wireDialogClose } from '../dom.js';
import { reportError } from '../errors.js';

type SortMode = 'updatedAt' | 'name';

const SORT_LABELS: Record<SortMode, string> = {
    updatedAt: 'Last edited',
    name: 'Name'
};

let dialog: HTMLDialogElement;
let listEl: HTMLElement;
let sortButton: HTMLButtonElement;
let updateListScrollFade: () => void;
let currentSummaries: DocumentSummary[] = [];
let sortMode: SortMode = 'updatedAt';

export function initBrowseDialog(): void {
    dialog = requireElement('browse-dialog') as HTMLDialogElement;
    listEl = requireElement('document-list');
    updateListScrollFade = initScrollFade(listEl, requireElement('document-list-fade'));
    sortButton = requireElement('btn-sort-documents') as HTMLButtonElement;
    const closeButton = requireElement('btn-close-browse-dialog');

    wireDialogClose(dialog, closeButton);

    sortButton.addEventListener('click', function onToggleSort() {
        sortMode = sortMode === 'updatedAt' ? 'name' : 'updatedAt';
        renderDocumentList();
    });
    updateSortButtonLabel();
}

export async function browseDialog(): Promise<void> {
    try {
        currentSummaries = await listDocuments();
    } catch (error) {
        reportError('load documents', error);
        return;
    }
    await showDialog(dialog, function populate() {
        renderDocumentList();
    });
}

function updateSortButtonLabel(): void {
    sortButton.innerHTML = '';
    const label = document.createElement('span');
    label.textContent = SORT_LABELS[sortMode];
    sortButton.append(iconSpan('icon-sort'), label);
}

function sortedSummaries(): DocumentSummary[] {
    const summaries = [...currentSummaries];
    if (sortMode === 'name') {
        summaries.sort(function byName(a, b) {
            return a.name.localeCompare(b.name);
        });
    } else {
        summaries.sort(function byUpdatedAtDesc(a, b) {
            return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
        });
    }
    return summaries;
}

function renderDocumentList(): void {
    updateSortButtonLabel();
    listEl.innerHTML = '';

    const summaries = sortedSummaries();
    if (summaries.length === 0) {
        const empty = document.createElement('li');
        empty.textContent = 'No documents saved yet.';
        listEl.appendChild(empty);
        updateListScrollFade();
        return;
    }

    for (const summary of summaries) {
        listEl.appendChild(renderDocumentItem(summary));
    }
    updateListScrollFade();
}

function renderDocumentItem(summary: DocumentSummary): HTMLLIElement {
    const item = document.createElement('li');
    item.className = 'document-item';
    item.append(renderOpenButton(summary), renderDeleteButton(summary));
    return item;
}

function renderThumbnail(summary: DocumentSummary): HTMLSpanElement {
    const thumb = document.createElement('span');
    thumb.className = 'document-thumb';

    if (summary.thumbnail) {
        const img = document.createElement('img');
        img.src = pageImageUrl(summary.id, summary.thumbnail);
        img.alt = '';
        thumb.appendChild(img);
    } else {
        thumb.appendChild(iconSpan('icon-image-placeholder'));
    }

    return thumb;
}

function renderOpenButton(summary: DocumentSummary): HTMLButtonElement {
    const button = document.createElement('button');
    button.className = 'document-open';

    const name = document.createElement('span');
    name.className = 'document-name';
    name.textContent = summary.name;

    const meta = document.createElement('span');
    meta.className = 'document-meta';
    const pageLabel = summary.pageCount === 1 ? 'page' : 'pages';
    meta.textContent = `${summary.pageCount} ${pageLabel} · Edited ${formatUpdatedAt(summary.updatedAt)}`;

    const text = document.createElement('span');
    text.className = 'document-text';
    text.append(name, meta);

    button.append(renderThumbnail(summary), text);
    button.addEventListener('click', async function onOpenDocument() {
        if (!(await confirmDiscardIfDirty())) {
            return;
        }
        try {
            setDocument(await getDocument(summary.id));
            dialog.close();
        } catch (error) {
            reportError('open document', error);
        }
    });
    return button;
}

function renderDeleteButton(summary: DocumentSummary): HTMLButtonElement {
    const button = document.createElement('button');
    button.className = 'icon-button';
    button.title = 'Delete document';
    button.setAttribute('aria-label', 'Delete document');
    button.appendChild(iconSpan('icon-trash'));
    button.addEventListener('click', async function onDelete() {
        const confirmed = await confirmDialog({
            title: 'Delete document',
            message: `Delete "${summary.name}"? This cannot be undone.`
        });
        if (!confirmed) {
            return;
        }
        try {
            await deleteDocument(summary.id);
            if (getState().document?.id === summary.id) {
                setDocument(null);
            }
            currentSummaries = await listDocuments();
            renderDocumentList();
        } catch (error) {
            reportError('delete document', error);
        }
    });
    return button;
}

function formatUpdatedAt(iso: string): string {
    return new Date(iso).toLocaleString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit'
    });
}
