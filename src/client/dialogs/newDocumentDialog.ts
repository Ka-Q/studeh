import { awaitDialogClose, requireElement, wireDialogClose } from '../dom.js';
import { MAX_NAME_LENGTH, sanitizeName } from '../inlineEdit.js';

const DEFAULT_NAME = 'Untitled document';

let dialog: HTMLDialogElement;
let nameInput: HTMLInputElement;

export function initNewDocumentDialog(): void {
    dialog = requireElement('new-document-dialog') as HTMLDialogElement;
    const form = requireElement('new-document-form') as HTMLFormElement;
    nameInput = requireElement('new-document-name') as HTMLInputElement;
    nameInput.maxLength = MAX_NAME_LENGTH;
    const cancelButton = requireElement('btn-cancel-new-document');

    wireDialogClose(dialog, cancelButton);
    nameInput.addEventListener('input', function onInput() {
        nameInput.setCustomValidity('');
    });
    form.addEventListener('submit', function onSubmit(event) {
        event.preventDefault();
        const sanitized = sanitizeName(nameInput.value);
        if (sanitized) {
            dialog.close(sanitized);
        } else {
            nameInput.setCustomValidity('Enter a name for the document.');
            nameInput.reportValidity();
        }
    });
}

export function newDocumentDialog(): Promise<string | null> {
    if (dialog.open) {
        return Promise.resolve(null);
    }
    dialog.returnValue = '';
    nameInput.value = DEFAULT_NAME;
    dialog.showModal();
    nameInput.select();
    return awaitDialogClose(dialog).then(function toNameOrNull(value) {
        return value || null;
    });
}
