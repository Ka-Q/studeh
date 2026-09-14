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
