import { pageImageUrl, uploadPageImage } from '../document/api.js';
import {
    addPage,
    deletePage,
    deletePages,
    getState,
    movePage,
    renamePage,
    setActivePage,
    setPageImage,
    subscribe
} from '../document/state.js';
import type { Page } from '../document/types.js';
import { confirmDialog } from '../dialogs/confirmDialog.js';
import { requireElement } from '../dom.js';
import { reportError } from '../errors.js';
import { startInlineEdit } from '../inlineEdit.js';

const MIN_SIDEBAR_WIDTH = 224;
const MAX_SIDEBAR_WIDTH = 480;
const DEFAULT_SIDEBAR_WIDTH = 220;
const WIDTH_STORAGE_KEY = 'studeh:sidebarWidth';
const COLLAPSED_STORAGE_KEY = 'studeh:sidebarCollapsed';

let pendingAutoRename = false;
let listEl: HTMLElement;
let selectAllCheckbox: HTMLInputElement;
let deleteSelectedButton: HTMLButtonElement;
const selectedPageIds = new Set<string>();

export function initPageSidebar(): void {
    listEl = requireElement('page-list');
    const addButton = requireElement('btn-add-page');
    const addFromImagesButton = requireElement('btn-add-pages-from-images');
    const imagesInput = createImagesFileInput();
    addFromImagesButton.after(imagesInput);
    selectAllCheckbox = requireElement('select-all-pages') as HTMLInputElement;
    deleteSelectedButton = requireElement('btn-delete-selected-pages') as HTMLButtonElement;

    addButton.addEventListener('click', function onAddPage() {
        const doc = getState().document;
        if (!doc) {
            return;
        }
        pendingAutoRename = true;
        addPage(`Page ${doc.pages.length + 1}`);
    });

    addFromImagesButton.addEventListener('click', function onAddFromImages() {
        imagesInput.click();
    });

    selectAllCheckbox.addEventListener('change', function onToggleSelectAll() {
        const doc = getState().document;
        if (!doc) {
            return;
        }
        const allSelected = doc.pages.length > 0 && doc.pages.every(function isSelected(page) {
            return selectedPageIds.has(page.id);
        });
        selectedPageIds.clear();
        if (!allSelected) {
            for (const page of doc.pages) {
                selectedPageIds.add(page.id);
            }
        }
        renderPageList(listEl);
    });

    deleteSelectedButton.addEventListener('click', async function onDeleteSelected() {
        const count = selectedPageIds.size;
        if (count === 0) {
            return;
        }
        const confirmed = await confirmDialog({
            title: 'Delete pages',
            message: `Delete all ${count} pages?`
        });
        if (!confirmed) {
            return;
        }
        deletePages(Array.from(selectedPageIds));
    });

    subscribe(function renderOnChange() {
        renderPageList(listEl);
    });
    renderPageList(listEl);

    initSidebarPanel();
}

function createImagesFileInput(): HTMLInputElement {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.accept = 'image/png,image/jpeg,image/webp,image/gif';
    input.hidden = true;
    input.addEventListener('change', function onFilesSelected() {
        const files = input.files ? Array.from(input.files) : [];
        input.value = '';
        const documentId = getState().document?.id;
        if (documentId && files.length > 0) {
            void createPagesFromImages(documentId, files);
        }
    });
    return input;
}

async function createPagesFromImages(documentId: string, files: File[]): Promise<void> {
    let createdCount = 0;
    for (const file of files) {
        const doc = getState().document;
        const page = doc && addPage(`Page ${doc.pages.length + 1}`);
        if (!page) {
            continue;
        }
        try {
            const image = await uploadPageImage(documentId, page.id, file);
            setPageImage(page.id, image);
            createdCount += 1;
        } catch (error) {
            deletePage(page.id);
            reportError('add page from image', error);
        }
    }
    if (createdCount === 1) {
        pendingAutoRename = true;
        renderPageList(listEl);
    }
}

function initSidebarImageDrop(sidebar: HTMLElement): void {
    sidebar.addEventListener('dragenter', function onDragEnter(event) {
        if (!isFileDrag(event)) {
            return;
        }
        event.preventDefault();
        sidebar.classList.add('drag-over');
    });
    sidebar.addEventListener('dragover', function onDragOver(event) {
        if (!isFileDrag(event)) {
            return;
        }
        event.preventDefault();
    });
    sidebar.addEventListener('dragleave', function onDragLeave(event) {
        const relatedTarget = event.relatedTarget as Node | null;
        if (!relatedTarget || !sidebar.contains(relatedTarget)) {
            sidebar.classList.remove('drag-over');
        }
    });
    sidebar.addEventListener('drop', function onDrop(event) {
        if (!isFileDrag(event)) {
            return;
        }
        event.preventDefault();
        sidebar.classList.remove('drag-over');
        const documentId = getState().document?.id;
        const files = Array.from(event.dataTransfer?.files ?? []).filter(function isImage(file) {
            return file.type.startsWith('image/');
        });
        if (documentId && files.length > 0) {
            void createPagesFromImages(documentId, files);
        }
    });
}

function isFileDrag(event: DragEvent): boolean {
    return event.dataTransfer !== null && Array.from(event.dataTransfer.types).includes('Files');
}

function initSidebarPanel(): void {
    const sidebar = requireElement('page-sidebar');
    const handle = requireElement('sidebar-resize-handle');
    const collapseButton = requireElement('btn-collapse-sidebar');
    const expandButton = requireElement('btn-expand-sidebar');

    initSidebarImageDrop(sidebar);

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
        selectedPageIds.clear();
        updateSelectionControls(0, 0);
        return;
    }

    const pageIds = new Set(doc.pages.map(function toId(page) {
        return page.id;
    }));
    for (const selectedId of selectedPageIds) {
        if (!pageIds.has(selectedId)) {
            selectedPageIds.delete(selectedId);
        }
    }

    doc.pages.forEach(function renderItem(page, index) {
        const isActive = page.id === activePageId;
        const isFirst = index === 0;
        const isLast = index === doc.pages.length - 1;
        listEl.appendChild(renderPageItem(doc.id, page, isActive, isFirst, isLast));
    });

    updateSelectionControls(selectedPageIds.size, doc.pages.length);

    if (pendingAutoRename) {
        pendingAutoRename = false;
        const activePage = doc.pages.find(function matchesActive(page) {
            return page.id === activePageId;
        });
        const nameEl = listEl.querySelector(`[data-page-id="${activePageId}"] .page-name`);
        if (activePage && nameEl instanceof HTMLElement) {
            startPageRename(activePage, nameEl);
        }
    }
}

function updateSelectionControls(selectedCount: number, totalCount: number): void {
    selectAllCheckbox.checked = totalCount > 0 && selectedCount === totalCount;
    selectAllCheckbox.indeterminate = selectedCount > 0 && selectedCount < totalCount;
    deleteSelectedButton.disabled = selectedCount === 0;
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

    const nameEl = renderPageName(page);
    const body = document.createElement('div');
    body.className = 'page-body';
    body.append(nameEl, renderActions(page, isFirst, isLast, nameEl));

    item.append(renderSelectCheckbox(page), renderThumbnail(documentId, page), body);
    return item;
}

function renderSelectCheckbox(page: Page): HTMLInputElement {
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'page-select-checkbox';
    checkbox.checked = selectedPageIds.has(page.id);
    checkbox.title = 'Select page';
    checkbox.setAttribute('aria-label', 'Select page');
    checkbox.addEventListener('click', function onCheckboxClick(event) {
        event.stopPropagation();
    });
    checkbox.addEventListener('change', function onToggle() {
        if (checkbox.checked) {
            selectedPageIds.add(page.id);
        } else {
            selectedPageIds.delete(page.id);
        }
        renderPageList(listEl);
    });
    return checkbox;
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

function renderPageName(page: Page): HTMLSpanElement {
    const name = document.createElement('span');
    name.className = 'page-name';
    name.textContent = page.name;
    name.title = page.name;
    return name;
}

function renderActions(page: Page, isFirst: boolean, isLast: boolean, nameEl: HTMLElement): HTMLDivElement {
    const actions = document.createElement('div');
    actions.className = 'page-actions';
    actions.append(
        renderMoveButton(page, -1, 'Move page up', 'icon-move-up', isFirst),
        renderMoveButton(page, 1, 'Move page down', 'icon-move-down', isLast),
        renderRenameButton(page, nameEl),
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

function renderRenameButton(page: Page, nameEl: HTMLElement): HTMLButtonElement {
    const button = document.createElement('button');
    button.className = 'icon-button';
    button.title = 'Rename page';
    button.setAttribute('aria-label', 'Rename page');
    button.appendChild(renderIcon('icon-rename'));
    button.addEventListener('click', function onRename(event) {
        event.stopPropagation();
        startPageRename(page, nameEl);
    });
    return button;
}

function startPageRename(page: Page, nameEl: HTMLElement): void {
    startInlineEdit(nameEl, page.name, function onCommit(name) {
        renamePage(page.id, name);
    });
}

function renderDeleteButton(page: Page): HTMLButtonElement {
    const button = document.createElement('button');
    button.className = 'icon-button';
    button.title = 'Delete page';
    button.setAttribute('aria-label', 'Delete page');
    button.appendChild(renderIcon('icon-trash'));
    button.addEventListener('click', async function onDelete(event) {
        event.stopPropagation();
        const hasContent = page.image !== null || page.shapes.length > 0;
        if (hasContent) {
            const confirmed = await confirmDialog({
                title: 'Delete page',
                message: `Delete page "${page.name}"? This page has content.`
            });
            if (!confirmed) {
                return;
            }
        }
        deletePage(page.id);
    });
    return button;
}
