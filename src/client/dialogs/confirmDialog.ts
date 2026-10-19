import { requireElement, showDialog, wireDialogClose } from '../dom';

interface ConfirmOptions {
    title: string;
    message: string;
    confirmLabel?: string;
    confirmIcon?: string;
    danger?: boolean;
    // A second way to go ahead, shown between Cancel and the confirm button, always styled as dangerous.
    alternative?: { label: string; icon: string };
}

export type ConfirmChoice = 'confirmed' | 'alternative' | null;

const DEFAULT_CONFIRM_LABEL = 'Delete';
const DEFAULT_CONFIRM_ICON = 'icon-trash';

let dialog: HTMLDialogElement;
let titleEl: HTMLElement;
let messageEl: HTMLElement;
let confirmButton: HTMLButtonElement;
let confirmIconEl: HTMLElement;
let confirmLabelEl: HTMLElement;
let alternativeButton: HTMLButtonElement;
let alternativeIconEl: HTMLElement;
let alternativeLabelEl: HTMLElement;

export function initConfirmDialog(): void {
    dialog = requireElement('confirm-dialog') as HTMLDialogElement;
    titleEl = requireElement('confirm-dialog-title');
    messageEl = requireElement('confirm-dialog-message');
    confirmButton = requireElement('btn-confirm-delete') as HTMLButtonElement;
    confirmIconEl = requireElement('confirm-dialog-icon');
    confirmLabelEl = requireElement('confirm-dialog-label');
    alternativeButton = requireElement('btn-confirm-alternative') as HTMLButtonElement;
    alternativeIconEl = requireElement('confirm-alternative-icon');
    alternativeLabelEl = requireElement('confirm-alternative-label');
    const cancelButton = requireElement('btn-cancel-confirm');

    wireDialogClose(dialog, cancelButton);
    confirmButton.addEventListener('click', () => dialog.close('confirmed'));
    alternativeButton.addEventListener('click', () => dialog.close('alternative'));
}

export function confirmDialog(options: ConfirmOptions): Promise<boolean> {
    return confirmChoiceDialog(options).then((choice) => choice === 'confirmed');
}

export function confirmChoiceDialog(options: ConfirmOptions): Promise<ConfirmChoice> {
    return showDialog(dialog, function populate() {
        titleEl.textContent = options.title;
        messageEl.textContent = options.message;
        confirmLabelEl.textContent = options.confirmLabel ?? DEFAULT_CONFIRM_LABEL;
        confirmIconEl.className = `icon ${options.confirmIcon ?? DEFAULT_CONFIRM_ICON}`;
        confirmButton.classList.toggle('button-danger', options.danger ?? true);
        alternativeButton.hidden = !options.alternative;
        alternativeLabelEl.textContent = options.alternative?.label ?? '';
        alternativeIconEl.className = `icon ${options.alternative?.icon ?? ''}`;
    }).then(function toChoice(value) {
        return value === 'confirmed' || value === 'alternative' ? value : null;
    });
}
