import { getState } from './state';
import { confirmDialog } from '../dialogs/confirmDialog';

export function confirmDiscardIfDirty(): Promise<boolean> {
    if (!getState().dirty) {
        return Promise.resolve(true);
    }
    return confirmDialog({
        title: 'Discard changes?',
        message: 'You have unsaved changes. Discard them?',
        confirmLabel: 'Discard',
        confirmIcon: 'icon-trash',
        danger: true
    });
}
