import { pageImageUrl, uploadPageImage } from '../document/api';
import {
    addPage,
    deletePage,
    deletePages,
    getActivePage,
    getState,
    movePage,
    newPageId,
    renamePage,
    setActivePage,
    subscribe
} from '../document/state';
import type { Page } from '../../shared/types';
import { confirmDialog } from '../dialogs/confirmDialog';
import { getDroppedImageFiles, iconSpan, initHoverScopedPaste, isFileDrag, requireElement, startDragSession } from '../dom';
import { reportError } from '../errors';
import { startInlineEdit } from '../inlineEdit';
import { shortcutHint } from '../shortcuts';
import { initPageListDrag } from './pageListDrag';
import {
    captureItemTops,
    followPageListChanges,
    initPageListScroll,
    selectPageWithPointer,
    updatePageListFade
} from './pageListScroll';

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
let toggleSidebarCollapseRef: (() => void) | null = null;
const selectedPageIds = new Set<string>();
// A page's list item outlives a render: reordering moves the item rather than building it again, which keeps its
// thumbnail from loading again (it would flicker) and is much less work in a long list.
interface PageRow {
    item: HTMLLIElement;
    checkbox: HTMLInputElement;
    thumbnail: HTMLSpanElement;
    thumbnailKey: string | null;
    nameEl: HTMLSpanElement;
    moveUpButton: HTMLButtonElement;
    moveDownButton: HTMLButtonElement;
}
const pageRows = new Map<string, PageRow>();
let pageRowsDocumentId: string | null = null;

export function initPageSidebar(): void {
    listEl = requireElement('page-list');
    initPageListScroll(listEl, requireElement('page-list-fade'));
    initPageListDrag(listEl, () => renderPageList(listEl));
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
    input.addEventListener('change', () => {
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
        const pageId = newPageId();
        try {
            const image = await uploadPageImage(documentId, pageId, file);
            const doc = getState().document;
            if (doc?.id === documentId && addPage(`Page ${doc.pages.length + 1}`, image, pageId)) {
                createdCount += 1;
            }
        } catch (error) {
            reportError('add page from image', error);
        }
    }
    if (createdCount === 1) {
        pendingAutoRename = true;
        renderPageList(listEl);
    }
}

function initSidebarImageDrop(sidebar: HTMLElement): void {
    sidebar.addEventListener('dragenter', (event) => {
        if (!isFileDrag(event)) {
            return;
        }
        event.preventDefault();
        sidebar.classList.add('drag-over');
    });
    sidebar.addEventListener('dragover', (event) => {
        if (!isFileDrag(event)) {
            return;
        }
        event.preventDefault();
    });
    sidebar.addEventListener('dragleave', (event) => {
        const relatedTarget = event.relatedTarget as Node | null;
        if (!relatedTarget || !sidebar.contains(relatedTarget)) {
            sidebar.classList.remove('drag-over');
        }
    });
    sidebar.addEventListener('drop', (event) => {
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
    const topsBefore = captureItemTops();
    const focusedControl = focusedPageControl();

    if (!doc) {
        pendingAutoRename = false;
        selectedPageIds.clear();
        pageRows.clear();
        listEl.replaceChildren();
        updateSelectionControls(0, 0);
        updatePageListFade();
        return;
    }

    if (doc.id !== pageRowsDocumentId) {
        pageRows.clear();
        listEl.replaceChildren();
        pageRowsDocumentId = doc.id;
    }
    const pageIds = new Set(doc.pages.map(function toId(page) {
        return page.id;
    }));
    for (const selectedId of selectedPageIds) {
        if (!pageIds.has(selectedId)) {
            selectedPageIds.delete(selectedId);
        }
    }
    for (const [pageId, row] of pageRows) {
        if (!pageIds.has(pageId)) {
            row.item.remove();
            pageRows.delete(pageId);
        }
    }

    doc.pages.forEach(function placeItem(page, index) {
        const row = pageRows.get(page.id) ?? createPageRow(page.id);
        pageRows.set(page.id, row);
        updatePageRow(row, doc.id, page, page.id === activePageId, index === 0, index === doc.pages.length - 1);
        if (listEl.children[index] !== row.item) {
            listEl.insertBefore(row.item, listEl.children[index] ?? null);
        }
    });

    updateSelectionControls(selectedPageIds.size, doc.pages.length);
    restoreFocusedPageControl(focusedControl);
    followPageListChanges(doc.pages, activePageId, topsBefore);
    updatePageListFade();

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

interface FocusedPageControl {
    pageId: string;
    // The control's place among its page's checkbox and buttons.
    index: number;
}

const PAGE_CONTROLS = '.page-select-checkbox, .page-actions button';

// A render moves the page's controls around in the list, which can drop the keyboard focus from the one it is on.
function focusedPageControl(): FocusedPageControl | null {
    const focused = document.activeElement;
    const item = focused instanceof HTMLElement ? focused.closest<HTMLElement>('.page-item') : null;
    if (!item || !listEl.contains(item) || !focused?.matches(PAGE_CONTROLS)) {
        return null;
    }
    return { pageId: item.dataset.pageId!, index: [...item.querySelectorAll(PAGE_CONTROLS)].indexOf(focused) };
}

// A control now disabled (a page moved to an end can't move further) hands its focus to the page's next one.
function restoreFocusedPageControl(control: FocusedPageControl | null): void {
    const item = control ? listEl.querySelector(`[data-page-id="${control.pageId}"]`) : null;
    if (!control || !item) {
        return;
    }
    const controls = [...item.querySelectorAll<HTMLElement>(PAGE_CONTROLS)];
    const target = [controls[control.index], ...controls.slice(control.index + 1), ...controls.slice(0, control.index).reverse()].find(function isEnabled(candidate) {
        return !(candidate as HTMLButtonElement).disabled;
    });
    target?.focus({ preventScroll: true });
}

function updateSelectionControls(selectedCount: number, totalCount: number): void {
    selectAllCheckbox.checked = totalCount > 0 && selectedCount === totalCount;
    selectAllCheckbox.indeterminate = selectedCount > 0 && selectedCount < totalCount;
    deleteSelectedButton.disabled = selectedCount === 0;
}

function currentPage(pageId: string): Page {
    return getState().document!.pages.find(function matchesId(page) {
        return page.id === pageId;
    })!;
}

function createPageRow(pageId: string): PageRow {
    const item = document.createElement('li');
    item.dataset.pageId = pageId;
    item.title = 'Drag to reorder';
    item.addEventListener('click', () => {
        selectPageWithPointer(() => setActivePage(pageId));
    });

    const checkbox = renderSelectCheckbox(pageId);
    const thumbnail = document.createElement('span');
    const nameEl = renderPageName(pageId);
    const moveUpButton = renderMoveButton(pageId, -1, `Move page up (${shortcutHint('reorderPageUp')} to move active page, or drag the page)`, 'icon-move-up');
    const moveDownButton = renderMoveButton(pageId, 1, `Move page down (${shortcutHint('reorderPageDown')} to move active page, or drag the page)`, 'icon-move-down');
    const actions = document.createElement('div');
    actions.className = 'page-actions';
    actions.append(moveUpButton, moveDownButton, renderRenameButton(pageId, nameEl), renderDeleteButton(pageId));
    const body = document.createElement('div');
    body.className = 'page-body';
    body.append(nameEl, actions);

    item.append(renderLeadingColumn(checkbox), thumbnail, body);
    return { item, checkbox, thumbnail, thumbnailKey: null, nameEl, moveUpButton, moveDownButton };
}

function updatePageRow(row: PageRow, documentId: string, page: Page, isActive: boolean, isFirst: boolean, isLast: boolean): void {
    // A slide still running from the last move would offset the positions measured for the next one.
    for (const slide of row.item.getAnimations()) {
        slide.cancel();
    }
    row.item.className = isActive ? 'page-item active' : 'page-item';
    row.checkbox.checked = selectedPageIds.has(page.id);
    row.moveUpButton.disabled = isFirst;
    row.moveDownButton.disabled = isLast;
    if (row.nameEl.textContent !== page.name) {
        row.nameEl.textContent = page.name;
        row.nameEl.title = page.name;
    }
    const thumbnailKey = page.image?.file ?? '';
    if (thumbnailKey !== row.thumbnailKey) {
        const thumbnail = renderThumbnail(documentId, page);
        row.thumbnail.replaceWith(thumbnail);
        row.thumbnail = thumbnail;
        row.thumbnailKey = thumbnailKey;
    }
}

function renderLeadingColumn(checkbox: HTMLInputElement): HTMLSpanElement {
    const grip = document.createElement('span');
    grip.className = 'page-grip';
    grip.appendChild(iconSpan('icon-grip'));
    const column = document.createElement('span');
    column.className = 'page-leading';
    column.append(grip, checkbox);
    return column;
}

function renderSelectCheckbox(pageId: string): HTMLInputElement {
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'page-select-checkbox';
    setLabelWithHint(checkbox, 'Select page', `${shortcutHint('toggleActivePageSelection')} to toggle active page's selection`);
    checkbox.addEventListener('click', (event) => {
        event.stopPropagation();
    });
    checkbox.addEventListener('change', () => {
        if (checkbox.checked) {
            selectedPageIds.add(pageId);
        } else {
            selectedPageIds.delete(pageId);
        }
        renderPageList(listEl);
    });
    return checkbox;
}

export function renderThumbnail(documentId: string, page: Page): HTMLSpanElement {
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

function renderPageName(pageId: string): HTMLSpanElement {
    const name = document.createElement('span');
    name.className = 'page-name';
    name.addEventListener('dblclick', (event) => {
        event.stopPropagation();
        startPageRename(currentPage(pageId), name);
    });
    return name;
}

function renderMoveButton(pageId: string, direction: -1 | 1, label: string, iconClass: string): HTMLButtonElement {
    const button = document.createElement('button');
    button.className = 'icon-button';
    button.title = label;
    button.setAttribute('aria-label', label);
    button.appendChild(iconSpan(iconClass));
    button.addEventListener('click', (event) => {
        event.stopPropagation();
        movePage(pageId, direction);
    });
    return button;
}

function renderRenameButton(pageId: string, nameEl: HTMLElement): HTMLButtonElement {
    const button = document.createElement('button');
    button.className = 'icon-button';
    setLabelWithHint(button, 'Rename page', `${shortcutHint('renameActivePage')} to rename active page`);
    button.appendChild(iconSpan('icon-rename'));
    button.addEventListener('click', (event) => {
        event.stopPropagation();
        startPageRename(currentPage(pageId), nameEl);
    });
    return button;
}

function startPageRename(page: Page, nameEl: HTMLElement): void {
    startInlineEdit(nameEl, page.name, function onCommit(name) {
        renamePage(page.id, name);
    });
}

function renderDeleteButton(pageId: string): HTMLButtonElement {
    const button = document.createElement('button');
    button.className = 'icon-button';
    setLabelWithHint(button, 'Delete page', `${shortcutHint('deleteActivePage')} to delete active page`);
    button.appendChild(iconSpan('icon-trash'));
    button.addEventListener('click', async (event) => {
        event.stopPropagation();
        await deletePageWithConfirm(currentPage(pageId));
    });
    return button;
}
