import { closeOnBackdropClick, requireElement } from '../dom.js';

const DEFAULT_NAME = 'Untitled document';

let dialog: HTMLDialogElement;
let form: HTMLFormElement;
let nameInput: HTMLInputElement;
let resolveCurrent: ((name: string | null) => void) | null = null;

export function initNewDocumentDialog(): void {
    dialog = requireElement('new-document-dialog') as HTMLDialogElement;
    form = requireElement('new-document-form') as HTMLFormElement;
    nameInput = requireElement('new-document-name') as HTMLInputElement;
    const cancelButton = requireElement('btn-cancel-new-document');

    cancelButton.addEventListener('click', function onCancel() {
        dialog.close();
    });
    form.addEventListener('submit', function onSubmit(event) {
        event.preventDefault();
        dialog.close(nameInput.value);
    });
    closeOnBackdropClick(dialog);
    dialog.addEventListener('close', function onClose() {
        resolveCurrent?.(dialog.returnValue || null);
        resolveCurrent = null;
    });
}

export function newDocumentDialog(): Promise<string | null> {
    dialog.returnValue = '';
    nameInput.value = DEFAULT_NAME;
    dialog.showModal();
    nameInput.select();
    return new Promise(function executor(resolve) {
        resolveCurrent = resolve;
    });
}
