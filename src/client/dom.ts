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
