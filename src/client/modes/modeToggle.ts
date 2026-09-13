import { setMode, subscribe } from '../document/state.js';
import { requireElement } from '../dom.js';

export function initModeToggle(): void {
    const editButton = requireElement('btn-mode-edit');
    const studyButton = requireElement('btn-mode-study');

    editButton.addEventListener('click', function onEditClick() {
        setMode('edit');
    });
    studyButton.addEventListener('click', function onStudyClick() {
        setMode('study');
    });

    subscribe(function renderOnChange(state) {
        editButton.classList.toggle('active', state.mode === 'edit');
        studyButton.classList.toggle('active', state.mode === 'study');
        editButton.toggleAttribute('disabled', !state.document);
        studyButton.toggleAttribute('disabled', !state.document);
    });
}
