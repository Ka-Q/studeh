import { requireElement, showDialog, wireDialogClose } from '../dom.js';

let dialog: HTMLDialogElement;
let titleEl: HTMLElement;
let messageEl: HTMLElement;

export function initNoticeDialog(): void {
    dialog = requireElement('notice-dialog') as HTMLDialogElement;
    titleEl = requireElement('notice-dialog-title');
    messageEl = requireElement('notice-dialog-message');
    const okButton = requireElement('btn-notice-ok');

    wireDialogClose(dialog, okButton);
}

export function noticeDialog(title: string, message: string): Promise<void> {
    return showDialog(dialog, function populate() {
        titleEl.textContent = title;
        messageEl.textContent = message;
    }).then(function toVoid() {
        return undefined;
    });
}
