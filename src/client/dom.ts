import { isBlockedByInputOrDialog } from './keyboardNav.js';

export function isFileDrag(event: DragEvent): boolean {
    return event.dataTransfer !== null && Array.from(event.dataTransfer.types).includes('Files');
}

const IS_MAC_PLATFORM = navigator.platform.toUpperCase().indexOf('MAC') >= 0;

export function isPrimaryModifierPressed(event: MouseEvent | KeyboardEvent): boolean {
    return IS_MAC_PLATFORM ? event.metaKey : event.ctrlKey;
}

export function isPrimaryModifierKey(event: KeyboardEvent): boolean {
    return event.key === (IS_MAC_PLATFORM ? 'Meta' : 'Control');
}

export function primaryModifierLabel(): 'Ctrl' | 'Cmd' {
    return IS_MAC_PLATFORM ? 'Cmd' : 'Ctrl';
}

export function getDroppedImageFiles(event: DragEvent): File[] {
    return Array.from(event.dataTransfer?.files ?? []).filter(function isImage(file) {
        return file.type.startsWith('image/');
    });
}

export function firstImageFile(items: DataTransferItemList | undefined): File | null {
    if (!items) {
        return null;
    }
    for (const item of items) {
        if (item.type.startsWith('image/')) {
            return item.getAsFile();
        }
    }
    return null;
}

export function initHoverScopedPaste(element: HTMLElement, onFile: (file: File) => void, guard?: () => boolean): void {
    let isHovering = false;
    element.addEventListener('mouseenter', function onMouseEnter() {
        isHovering = true;
    });
    element.addEventListener('mouseleave', function onMouseLeave() {
        isHovering = false;
    });
    document.addEventListener('paste', function onPaste(event) {
        if (!isHovering || isBlockedByInputOrDialog() || (guard && !guard())) {
            return;
        }
        const file = firstImageFile(event.clipboardData?.items);
        if (file) {
            onFile(file);
        }
    });
}

export function iconSpan(className: string): HTMLSpanElement {
    const icon = document.createElement('span');
    icon.className = `icon ${className}`;
    icon.setAttribute('aria-hidden', 'true');
    return icon;
}

export function requireElement(id: string): HTMLElement {
    const element = document.getElementById(id);
    if (!element) {
        throw new Error(`Missing element #${id}`);
    }
    return element;
}

export function closeOnBackdropClick(dialog: HTMLDialogElement): void {
    dialog.addEventListener('click', function onBackdropClick(event) {
        if (event.target === dialog) {
            dialog.close();
        }
    });
}

export function wireDialogClose(dialog: HTMLDialogElement, cancelButton: HTMLElement): void {
    cancelButton.addEventListener('click', function onCancel() {
        dialog.close();
    });
    closeOnBackdropClick(dialog);
}

export function awaitDialogClose(dialog: HTMLDialogElement): Promise<string> {
    return new Promise(function executor(resolve) {
        dialog.addEventListener('close', function onClose() {
            resolve(dialog.returnValue);
        }, { once: true });
    });
}

const dialogQueues = new WeakMap<HTMLDialogElement, Promise<void>>();

export function showDialog(
    dialog: HTMLDialogElement,
    populate: () => void,
    afterShow?: () => void
): Promise<string> {
    const previous = dialogQueues.get(dialog) ?? Promise.resolve();
    const opened = previous.then(function open(): Promise<string> {
        dialog.returnValue = '';
        populate();
        dialog.showModal();
        afterShow?.();
        return awaitDialogClose(dialog);
    });
    dialogQueues.set(dialog, opened.then(function toSettled() {
        return undefined;
    }, function toSettled() {
        return undefined;
    }));
    return opened;
}

export function startDragSession(
    onMove: (event: MouseEvent) => void,
    onUp: (event: MouseEvent) => void,
    onSettle?: () => void
): () => void {
    let settled = false;
    function handleMouseMove(event: MouseEvent): void {
        onMove(event);
    }
    function handleMouseUp(event: MouseEvent): void {
        settle();
        onUp(event);
    }
    function settle(): void {
        if (settled) {
            return;
        }
        settled = true;
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
        onSettle?.();
    }
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return settle;
}

export function initScrollFade(scrollEl: HTMLElement, fadeEl: HTMLElement): () => void {
    function update(): void {
        const scrollable = scrollEl.scrollHeight > scrollEl.clientHeight;
        const atBottom = scrollEl.scrollHeight - scrollEl.scrollTop - scrollEl.clientHeight <= 1;
        fadeEl.classList.toggle('visible', scrollable && !atBottom);
    }
    scrollEl.addEventListener('scroll', update);
    new ResizeObserver(update).observe(scrollEl);
    update();
    return update;
}
