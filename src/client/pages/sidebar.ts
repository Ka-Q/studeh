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
        listEl.appendChild(renderPageItem(page, page.id === activePageId));
    }
}

function renderPageItem(page: Page, isActive: boolean): HTMLLIElement {
    const item = document.createElement('li');
    item.className = isActive ? 'page-item active' : 'page-item';

    const nameButton = document.createElement('button');
    nameButton.className = 'page-name';
    nameButton.textContent = page.name;
    nameButton.addEventListener('click', function onSelect() {
        setActivePage(page.id);
    });

    const renameButton = document.createElement('button');
    renameButton.className = 'page-rename';
    renameButton.textContent = 'Rename';
    renameButton.addEventListener('click', function onRename() {
        const name = prompt('Rename page', page.name);
        if (name) {
            renamePage(page.id, name);
        }
    });

    const deleteButton = document.createElement('button');
    deleteButton.className = 'page-delete';
    deleteButton.textContent = 'Delete';
    deleteButton.addEventListener('click', function onDelete() {
        const hasContent = page.image !== null || page.shapes.length > 0;
        if (hasContent && !confirm(`Delete page "${page.name}"? This page has content.`)) {
            return;
        }
        deletePage(page.id);
    });

    item.append(nameButton, renameButton, deleteButton);
    return item;
}
