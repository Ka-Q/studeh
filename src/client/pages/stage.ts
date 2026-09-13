import { getActivePage, getState, setPageImage, subscribe } from '../document/state.js';
import { uploadPageImage } from '../document/api.js';
import type { Page } from '../document/types.js';
import { requireElement } from '../dom.js';

export function initStage(): void {
    const container = requireElement('canvas-area');
    subscribe(function renderOnChange() {
        render(container);
    });
    render(container);
}

function render(container: HTMLElement): void {
    const { document: doc } = getState();
    if (!doc) {
        container.textContent = 'No document open. Use New or Open to get started.';
        return;
    }

    const page = getActivePage();
    if (!page) {
        container.textContent = 'This document has no pages yet. Add one from the sidebar.';
        return;
    }

    container.innerHTML = '';
    container.append(renderStatus(page), renderImageInput(doc.id, page));
}

function renderStatus(page: Page): HTMLParagraphElement {
    const status = document.createElement('p');
    status.textContent = page.image
        ? `Active page: ${page.name} (image assigned)`
        : `Active page: ${page.name} (no image yet)`;
    return status;
}

function renderImageInput(documentId: string, page: Page): HTMLLabelElement {
    const label = document.createElement('label');
    label.textContent = page.image ? 'Replace image: ' : 'Assign image: ';

    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/png,image/jpeg,image/webp,image/gif';
    input.addEventListener('change', function onFileSelected() {
        const file = input.files?.[0];
        if (file) {
            void assignImage(documentId, page.id, file);
        }
    });

    label.appendChild(input);
    return label;
}

async function assignImage(documentId: string, pageId: string, file: File): Promise<void> {
    const image = await uploadPageImage(documentId, pageId, file);
    setPageImage(pageId, image);
}
