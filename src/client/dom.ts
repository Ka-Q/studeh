export function isFileDrag(event: DragEvent): boolean {
    return event.dataTransfer !== null && Array.from(event.dataTransfer.types).includes('Files');
}

export function getDroppedImageFiles(event: DragEvent): File[] {
    return Array.from(event.dataTransfer?.files ?? []).filter(function isImage(file) {
        return file.type.startsWith('image/');
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
