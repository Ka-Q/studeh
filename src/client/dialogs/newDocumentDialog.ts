import { requireElement, showDialog, wireDialogClose } from '../dom';
import { MAX_NAME_LENGTH, sanitizeName } from '../inlineEdit';

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
    nameInput.addEventListener('input', () => {
        nameInput.setCustomValidity('');
    });
    form.addEventListener('submit', (event) => {
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
    return showDialog(dialog, function populate() {
        nameInput.setCustomValidity('');
        nameInput.value = DEFAULT_NAME;
    }, function afterShow() {
        nameInput.select();
    }).then(function toNameOrNull(value) {
        return value || null;
    });
}
