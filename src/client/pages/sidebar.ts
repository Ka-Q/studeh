import { pageImageUrl, uploadPageImage } from '../document/api.js';
import {
    addPage,
    deletePage,
    deletePages,
    getActivePage,
    getState,
    movePage,
    renamePage,
    setActivePage,
    setPageImage,
    subscribe
} from '../document/state.js';
import type { Page } from '../document/types.js';
import { confirmDialog } from '../dialogs/confirmDialog.js';
import { getDroppedImageFiles, iconSpan, initHoverScopedPaste, initScrollFade, isFileDrag, requireElement, startDragSession } from '../dom.js';
import { reportError } from '../errors.js';
import { startInlineEdit } from '../inlineEdit.js';
import { shortcutHint } from '../shortcuts.js';

const MIN_SIDEBAR_WIDTH = 224;
const MAX_SIDEBAR_WIDTH = 480;
const DEFAULT_SIDEBAR_WIDTH = 248;
const WIDTH_STORAGE_KEY = 'studeh:sidebarWidth';
const COLLAPSED_STORAGE_KEY = 'studeh:sidebarCollapsed';

let pendingAutoRename = false;
let listEl: HTMLElement;
let selectAllCheckbox: HTMLInputElement;
let deleteSelectedButton: HTMLButtonElement;
let imagesInput: HTMLInputElement;
let updateListScrollFade: () => void;
let toggleSidebarCollapseRef: (() => void) | null = null;
const selectedPageIds = new Set<string>();

export function initPageSidebar(): void {
    listEl = requireElement('page-list');
    updateListScrollFade = initScrollFade(listEl, requireElement('page-list-fade'));
    const addButton = requireElement('btn-add-page');
    const addFromImagesButton = requireElement('btn-add-pages-from-images');
    imagesInput = createImagesFileInput();
    addFromImagesButton.after(imagesInput);
    selectAllCheckbox = requireElement('select-all-pages') as HTMLInputElement;
    deleteSelectedButton = requireElement('btn-delete-selected-pages') as HTMLButtonElement;

    addButton.title = `New empty page (${shortcutHint('newPage')})`;
    addFromImagesButton.title = `New from image(s) (${shortcutHint('newPageFromImages')})`;
    setLabelWithHint(selectAllCheckbox, 'Select all pages', shortcutHint('toggleSelectAllPages'));
    setLabelWithHint(deleteSelectedButton, 'Delete selected pages', shortcutHint('deleteSelectedPages'));

    addButton.addEventListener('click', onAddPage);
    addFromImagesButton.addEventListener('click', onAddFromImages);
    selectAllCheckbox.addEventListener('change', toggleSelectAllPages);
    deleteSelectedButton.addEventListener('click', deleteSelectedPagesWithConfirm);

    subscribe(function renderOnChange(state) {
        renderPageList(listEl);
        addButton.toggleAttribute('disabled', !state.document);
        addFromImagesButton.toggleAttribute('disabled', !state.document);
    });
    renderPageList(listEl);

    initSidebarPanel();
}

function setLabelWithHint(element: HTMLElement, label: string, hint: string): void {
    const text = `${label} (${hint})`;
    element.title = text;
    element.setAttribute('aria-label', text);
}

export function onAddPage(): void {
    const doc = getState().document;
    if (!doc) {
        return;
    }
    pendingAutoRename = true;
    addPage(`Page ${doc.pages.length + 1}`);
}

export function onAddFromImages(): void {
    imagesInput.click();
}

function togglePageSelection(pageId: string): void {
    if (selectedPageIds.has(pageId)) {
        selectedPageIds.delete(pageId);
    } else {
        selectedPageIds.add(pageId);
    }
    renderPageList(listEl);
}

export function toggleActivePageSelection(): void {
    const { activePageId } = getState();
    if (activePageId) {
        togglePageSelection(activePageId);
    }
}

export function toggleSelectAllPages(): void {
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
}

async function deletePageWithConfirm(page: Page): Promise<void> {
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
}

export async function deleteActivePage(): Promise<void> {
    const page = getActivePage();
    if (page) {
        await deletePageWithConfirm(page);
    }
}

export async function deleteSelectedPagesWithConfirm(): Promise<void> {
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
}

export function renameActivePage(): void {
    const { activePageId } = getState();
    const page = getActivePage();
    const nameEl = listEl.querySelector(`[data-page-id="${activePageId}"] .page-name`);
    if (page && nameEl instanceof HTMLElement) {
        startPageRename(page, nameEl);
    }
}

export function toggleSidebarCollapse(): void {
    toggleSidebarCollapseRef?.();
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
        const files = getDroppedImageFiles(event);
        if (documentId && files.length > 0) {
            void createPagesFromImages(documentId, files);
        }
    });
}

function initSidebarImagePaste(sidebar: HTMLElement): void {
    initHoverScopedPaste(sidebar, function onFile(file) {
        const documentId = getState().document?.id;
        if (documentId) {
            void createPagesFromImages(documentId, [file]);
        }
    });
}

function initSidebarPanel(): void {
    const sidebar = requireElement('page-sidebar');
    const handle = requireElement('sidebar-resize-handle');
    const collapseButton = requireElement('btn-collapse-sidebar');
    const expandButton = requireElement('btn-expand-sidebar');

    setLabelWithHint(collapseButton, 'Collapse sidebar', shortcutHint('toggleSidebar'));
    setLabelWithHint(expandButton, 'Show sidebar', shortcutHint('toggleSidebar'));

    initSidebarImageDrop(sidebar);
    initSidebarImagePaste(sidebar);

    let width = loadSidebarWidth();
    let collapsed = localStorage.getItem(COLLAPSED_STORAGE_KEY) === 'true';
    applySidebarState();

    function toggleCollapsed(): void {
        collapsed = !collapsed;
        localStorage.setItem(COLLAPSED_STORAGE_KEY, String(collapsed));
        applySidebarState();
    }
    toggleSidebarCollapseRef = toggleCollapsed;

    collapseButton.addEventListener('click', toggleCollapsed);
    expandButton.addEventListener('click', toggleCollapsed);

    handle.addEventListener('mousedown', function onDragStart(event) {
        event.preventDefault();
        handle.classList.add('dragging');
        document.body.style.cursor = 'col-resize';

        startDragSession(function onDragMove(moveEvent) {
            width = clampSidebarWidth(moveEvent.clientX - sidebar.getBoundingClientRect().left);
            applySidebarState();
        }, function onDragEnd() {
            handle.classList.remove('dragging');
            document.body.style.cursor = '';
            localStorage.setItem(WIDTH_STORAGE_KEY, String(width));
        });
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
        updateListScrollFade();
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
    updateListScrollFade();

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
    setLabelWithHint(checkbox, 'Select page', `${shortcutHint('toggleActivePageSelection')} to toggle active page's selection`);
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
        thumb.appendChild(iconSpan('icon-image-placeholder'));
    }

    return thumb;
}

function renderPageName(page: Page): HTMLSpanElement {
    const name = document.createElement('span');
    name.className = 'page-name';
    name.textContent = page.name;
    name.title = page.name;
    name.addEventListener('dblclick', function onDblClick(event) {
        event.stopPropagation();
        startPageRename(page, name);
    });
    return name;
}

function renderActions(page: Page, isFirst: boolean, isLast: boolean, nameEl: HTMLElement): HTMLDivElement {
    const actions = document.createElement('div');
    actions.className = 'page-actions';
    actions.append(
        renderMoveButton(page, -1, `Move page up (${shortcutHint('reorderPageUp')} to move active page)`, 'icon-move-up', isFirst),
        renderMoveButton(page, 1, `Move page down (${shortcutHint('reorderPageDown')} to move active page)`, 'icon-move-down', isLast),
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
    button.appendChild(iconSpan(iconClass));
    button.addEventListener('click', function onMove(event) {
        event.stopPropagation();
        movePage(page.id, direction);
    });
    return button;
}

function renderRenameButton(page: Page, nameEl: HTMLElement): HTMLButtonElement {
    const button = document.createElement('button');
    button.className = 'icon-button';
    setLabelWithHint(button, 'Rename page', `${shortcutHint('renameActivePage')} to rename active page`);
    button.appendChild(iconSpan('icon-rename'));
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
    setLabelWithHint(button, 'Delete page', `${shortcutHint('deleteActivePage')} to delete active page`);
    button.appendChild(iconSpan('icon-trash'));
    button.addEventListener('click', async function onDelete(event) {
        event.stopPropagation();
        await deletePageWithConfirm(page);
    });
    return button;
}
