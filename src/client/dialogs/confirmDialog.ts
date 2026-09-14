import { closeOnBackdropClick, requireElement } from '../dom.js';

interface ConfirmOptions {
    title: string;
    message: string;
}

let dialog: HTMLDialogElement;
let titleEl: HTMLElement;
let messageEl: HTMLElement;
let resolveCurrent: ((confirmed: boolean) => void) | null = null;
let pendingAnswer = false;

export function initConfirmDialog(): void {
    dialog = requireElement('confirm-dialog') as HTMLDialogElement;
    titleEl = requireElement('confirm-dialog-title');
    messageEl = requireElement('confirm-dialog-message');
    const cancelButton = requireElement('btn-cancel-confirm');
    const confirmButton = requireElement('btn-confirm-delete');

    cancelButton.addEventListener('click', function onCancel() {
        dialog.close();
    });
    confirmButton.addEventListener('click', function onConfirm() {
        pendingAnswer = true;
        dialog.close();
    });
    closeOnBackdropClick(dialog);
    dialog.addEventListener('close', function onClose() {
        resolveCurrent?.(pendingAnswer);
        resolveCurrent = null;
        pendingAnswer = false;
    });
}

export function confirmDialog(options: ConfirmOptions): Promise<boolean> {
    titleEl.textContent = options.title;
    messageEl.textContent = options.message;
    dialog.showModal();
    return new Promise(function executor(resolve) {
        resolveCurrent = resolve;
    });
}
