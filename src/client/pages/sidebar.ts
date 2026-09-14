import { pageImageUrl } from '../document/api.js';
import { addPage, deletePage, getState, movePage, renamePage, setActivePage, subscribe } from '../document/state.js';
import type { Page } from '../document/types.js';
import { requireElement } from '../dom.js';
import { startInlineEdit } from '../inlineEdit.js';

const MIN_SIDEBAR_WIDTH = 200;
const MAX_SIDEBAR_WIDTH = 480;
const DEFAULT_SIDEBAR_WIDTH = 220;
const WIDTH_STORAGE_KEY = 'studeh:sidebarWidth';
const COLLAPSED_STORAGE_KEY = 'studeh:sidebarCollapsed';

let pendingAutoRename = false;

export function initPageSidebar(): void {
    const listEl = requireElement('page-list');
    const addButton = requireElement('btn-add-page');

    addButton.addEventListener('click', function onAddPage() {
        const doc = getState().document;
        if (!doc) {
            return;
        }
        pendingAutoRename = true;
        addPage(`Page ${doc.pages.length + 1}`);
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
        pendingAutoRename = false;
        return;
    }

    doc.pages.forEach(function renderItem(page, index) {
        const isActive = page.id === activePageId;
        const isFirst = index === 0;
        const isLast = index === doc.pages.length - 1;
        listEl.appendChild(renderPageItem(doc.id, page, isActive, isFirst, isLast));
    });

    if (pendingAutoRename) {
        pendingAutoRename = false;
        const activePage = doc.pages.find(function matchesActive(page) {
            return page.id === activePageId;
        });
        const nameButton = listEl.querySelector(`[data-page-id="${activePageId}"] .page-name`);
        if (activePage && nameButton instanceof HTMLElement) {
            startPageRename(activePage, nameButton);
        }
    }
}

function renderPageItem(
    documentId: string,
    page: Page,
    isActive: boolean,
    isFirst: boolean,
    isLast: boolean
): HTMLLIElement {
    const item = document.createElement('li');
    item.className = isActive ? 'page-item active' : 'page-item';
    item.dataset.pageId = page.id;
    item.addEventListener('click', function onSelect() {
        setActivePage(page.id);
    });

    const nameButton = renderNameButton(page);
    const body = document.createElement('div');
    body.className = 'page-body';
    body.append(nameButton, renderActions(page, isFirst, isLast, nameButton));

    item.append(renderThumbnail(documentId, page), body);
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

function renderNameButton(page: Page): HTMLButtonElement {
    const button = document.createElement('button');
    button.className = 'page-name';
    button.textContent = page.name;
    button.title = page.name;
    return button;
}

function renderActions(page: Page, isFirst: boolean, isLast: boolean, nameButton: HTMLElement): HTMLDivElement {
    const actions = document.createElement('div');
    actions.className = 'page-actions';
    actions.append(
        renderMoveButton(page, -1, 'Move page up', 'icon-move-up', isFirst),
        renderMoveButton(page, 1, 'Move page down', 'icon-move-down', isLast),
        renderRenameButton(page, nameButton),
        renderDeleteButton(page)
    );
    return actions;
}

function renderMoveButton(
    page: Page,
    direction: -1 | 1,
    label: string,
    iconClass: string,
    disabled: boolean
): HTMLButtonElement {
    const button = document.createElement('button');
    button.className = 'icon-button';
    button.title = label;
    button.setAttribute('aria-label', label);
    button.disabled = disabled;
    button.appendChild(renderIcon(iconClass));
    button.addEventListener('click', function onMove(event) {
        event.stopPropagation();
        movePage(page.id, direction);
    });
    return button;
}

function renderRenameButton(page: Page, nameButton: HTMLElement): HTMLButtonElement {
    const button = document.createElement('button');
    button.className = 'icon-button';
    button.title = 'Rename page';
    button.setAttribute('aria-label', 'Rename page');
    button.appendChild(renderIcon('icon-rename'));
    button.addEventListener('click', function onRename(event) {
        event.stopPropagation();
        startPageRename(page, nameButton);
    });
    return button;
}

function startPageRename(page: Page, nameButton: HTMLElement): void {
    startInlineEdit(nameButton, page.name, function onCommit(name) {
        renamePage(page.id, name);
    });
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
