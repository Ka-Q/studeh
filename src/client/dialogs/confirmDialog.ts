import { requireElement, showDialog, wireDialogClose } from '../dom';

interface ConfirmOptions {
    title: string;
    message: string;
    confirmLabel?: string;
    confirmIcon?: string;
    danger?: boolean;
}

const DEFAULT_CONFIRM_LABEL = 'Delete';
const DEFAULT_CONFIRM_ICON = 'icon-trash';

let dialog: HTMLDialogElement;
let titleEl: HTMLElement;
let messageEl: HTMLElement;
let confirmButton: HTMLButtonElement;
let confirmIconEl: HTMLElement;
let confirmLabelEl: HTMLElement;

export function initConfirmDialog(): void {
    dialog = requireElement('confirm-dialog') as HTMLDialogElement;
    titleEl = requireElement('confirm-dialog-title');
    messageEl = requireElement('confirm-dialog-message');
    confirmButton = requireElement('btn-confirm-delete') as HTMLButtonElement;
    confirmIconEl = requireElement('confirm-dialog-icon');
    confirmLabelEl = requireElement('confirm-dialog-label');
    const cancelButton = requireElement('btn-cancel-confirm');

    wireDialogClose(dialog, cancelButton);
    confirmButton.addEventListener('click', function onConfirm() {
        dialog.close('confirmed');
    });
}

export function confirmDialog(options: ConfirmOptions): Promise<boolean> {
    return showDialog(dialog, function populate() {
        titleEl.textContent = options.title;
        messageEl.textContent = options.message;
        confirmLabelEl.textContent = options.confirmLabel ?? DEFAULT_CONFIRM_LABEL;
        confirmIconEl.className = `icon ${options.confirmIcon ?? DEFAULT_CONFIRM_ICON}`;
        confirmButton.classList.toggle('button-danger', options.danger ?? true);
    }).then(function toBoolean(value) {
        return value === 'confirmed';
    });
}
