import { awaitDialogClose, closeOnBackdropClick, requireElement, waitForDialogFree } from '../dom.js';

let dialog: HTMLDialogElement;
let titleEl: HTMLElement;
let messageEl: HTMLElement;

export function initNoticeDialog(): void {
    dialog = requireElement('notice-dialog') as HTMLDialogElement;
    titleEl = requireElement('notice-dialog-title');
    messageEl = requireElement('notice-dialog-message');
    const okButton = requireElement('btn-notice-ok');

    okButton.addEventListener('click', function onOk() {
        dialog.close();
    });
    closeOnBackdropClick(dialog);
}

export function noticeDialog(title: string, message: string): Promise<void> {
    return waitForDialogFree(dialog).then(function afterFree() {
        titleEl.textContent = title;
        messageEl.textContent = message;
        dialog.showModal();
        return awaitDialogClose(dialog).then(function toVoid() {
            return undefined;
        });
    });
}
