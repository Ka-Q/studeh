import { pageImageUrl } from '../document/api.js';
import { addPage, deletePage, getState, renamePage, setActivePage, subscribe } from '../document/state.js';
import type { Page } from '../document/types.js';
import { requireElement } from '../dom.js';

const MIN_SIDEBAR_WIDTH = 180;
const MAX_SIDEBAR_WIDTH = 480;
const DEFAULT_SIDEBAR_WIDTH = 220;
const WIDTH_STORAGE_KEY = 'studeh:sidebarWidth';
const COLLAPSED_STORAGE_KEY = 'studeh:sidebarCollapsed';

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

    initSidebarPanel();
}

function initSidebarPanel(): void {
    const sidebar = requireElement('page-sidebar');
    const handle = requireElement('sidebar-resize-handle');
    const collapseButton = requireElement('btn-collapse-sidebar');
    const expandButton = requireElement('btn-expand-sidebar');

    let width = loadSidebarWidth();
    let collapsed = localStorage.getItem(COLLAPSED_STORAGE_KEY) === 'true';
    applySidebarState();

    collapseButton.addEventListener('click', function onCollapse() {
        collapsed = true;
        localStorage.setItem(COLLAPSED_STORAGE_KEY, String(collapsed));
        applySidebarState();
    });
    expandButton.addEventListener('click', function onExpand() {
        collapsed = false;
        localStorage.setItem(COLLAPSED_STORAGE_KEY, String(collapsed));
        applySidebarState();
    });

    handle.addEventListener('mousedown', function onDragStart(event) {
        event.preventDefault();
        handle.classList.add('dragging');
        document.body.style.cursor = 'col-resize';

        function onDragMove(moveEvent: MouseEvent): void {
            width = clampSidebarWidth(moveEvent.clientX - sidebar.getBoundingClientRect().left);
            applySidebarState();
        }

        function onDragEnd(): void {
            document.removeEventListener('mousemove', onDragMove);
            document.removeEventListener('mouseup', onDragEnd);
            handle.classList.remove('dragging');
            document.body.style.cursor = '';
            localStorage.setItem(WIDTH_STORAGE_KEY, String(width));
        }

        document.addEventListener('mousemove', onDragMove);
        document.addEventListener('mouseup', onDragEnd);
    });

    function applySidebarState(): void {
        sidebar.classList.toggle('collapsed', collapsed);
        sidebar.style.width = collapsed ? '0px' : `${width}px`;
        handle.hidden = collapsed;
        expandButton.hidden = !collapsed;
    }
}

function loadSidebarWidth(): number {
    const stored = Number(localStorage.getItem(WIDTH_STORAGE_KEY));
    return clampSidebarWidth(stored || DEFAULT_SIDEBAR_WIDTH);
}

function clampSidebarWidth(width: number): number {
    return Math.min(MAX_SIDEBAR_WIDTH, Math.max(MIN_SIDEBAR_WIDTH, width));
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

    const body = document.createElement('div');
    body.className = 'page-body';
    body.append(renderNameButton(page), renderActions(page));

    item.append(renderThumbnail(documentId, page), body);
    return item;
}

function renderThumbnail(documentId: string, page: Page): HTMLSpanElement {
    const thumb = document.createElement('span');
    thumb.className = 'page-thumb';
    thumb.addEventListener('click', function onSelect() {
        setActivePage(page.id);
    });

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

function renderNameButton(page: Page): HTMLButtonElement {
    const button = document.createElement('button');
    button.className = 'page-name';
    button.textContent = page.name;
    button.title = page.name;
    button.addEventListener('click', function onSelect() {
        setActivePage(page.id);
    });
    return button;
}

function renderActions(page: Page): HTMLDivElement {
    const actions = document.createElement('div');
    actions.className = 'page-actions';
    actions.addEventListener('click', function onSelect() {
        setActivePage(page.id);
    });
    actions.append(renderRenameButton(page), renderDeleteButton(page));
    return actions;
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
