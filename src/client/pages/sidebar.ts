import { pageImageUrl } from '../document/api.js';
import { addPage, deletePage, getState, renamePage, setActivePage, subscribe } from '../document/state.js';
import type { Page } from '../document/types.js';
import { requireElement } from '../dom.js';

export function initPageSidebar(): void {
    const listEl = requireElement('page-list');
    const addButton = requireElement('btn-add-page');

    addButton.addEventListener('click', function onAddPage() {
        const doc = getState().document;
        if (!doc) {
            return;
        }
        const name = prompt('Page name', `Page ${doc.pages.length + 1}`);
        if (name) {
            addPage(name);
        }
    });

    subscribe(function renderOnChange() {
        renderPageList(listEl);
    });
    renderPageList(listEl);
}

function renderPageList(listEl: HTMLElement): void {
    const { document: doc, activePageId } = getState();
    listEl.innerHTML = '';

    if (!doc) {
        return;
    }

    for (const page of doc.pages) {
        listEl.appendChild(renderPageItem(doc.id, page, page.id === activePageId));
    }
}

function renderPageItem(documentId: string, page: Page, isActive: boolean): HTMLLIElement {
    const item = document.createElement('li');
    item.className = isActive ? 'page-item active' : 'page-item';

    const rowButton = document.createElement('button');
    rowButton.className = 'page-row';
    rowButton.append(renderThumbnail(documentId, page), renderName(page));
    rowButton.addEventListener('click', function onSelect() {
        setActivePage(page.id);
    });

    const actions = document.createElement('div');
    actions.className = 'page-actions';
    actions.append(renderRenameButton(page), renderDeleteButton(page));

    item.append(rowButton, actions);
    return item;
}

function renderThumbnail(documentId: string, page: Page): HTMLSpanElement {
    const thumb = document.createElement('span');
    thumb.className = 'page-thumb';

    if (page.image) {
        const img = document.createElement('img');
        img.src = pageImageUrl(documentId, page.image);
        img.alt = '';
        thumb.appendChild(img);
    } else {
        thumb.appendChild(renderIcon('icon-image-placeholder'));
    }

    return thumb;
}

function renderIcon(className: string): HTMLSpanElement {
    const icon = document.createElement('span');
    icon.className = `icon ${className}`;
    icon.setAttribute('aria-hidden', 'true');
    return icon;
}

function renderName(page: Page): HTMLSpanElement {
    const name = document.createElement('span');
    name.className = 'page-name';
    name.textContent = page.name;
    return name;
}

function renderRenameButton(page: Page): HTMLButtonElement {
    const button = document.createElement('button');
    button.className = 'icon-button';
    button.title = 'Rename page';
    button.setAttribute('aria-label', 'Rename page');
    button.appendChild(renderIcon('icon-rename'));
    button.addEventListener('click', function onRename(event) {
        event.stopPropagation();
        const name = prompt('Rename page', page.name);
        if (name) {
            renamePage(page.id, name);
        }
    });
    return button;
}

function renderDeleteButton(page: Page): HTMLButtonElement {
    const button = document.createElement('button');
    button.className = 'icon-button';
    button.title = 'Delete page';
    button.setAttribute('aria-label', 'Delete page');
    button.appendChild(renderIcon('icon-trash'));
    button.addEventListener('click', function onDelete(event) {
        event.stopPropagation();
        const hasContent = page.image !== null || page.shapes.length > 0;
        if (hasContent && !confirm(`Delete page "${page.name}"? This page has content.`)) {
            return;
        }
        deletePage(page.id);
    });
    return button;
}
