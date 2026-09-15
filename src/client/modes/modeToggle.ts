import { getState, setMode, subscribe } from '../document/state.js';
import { requireElement } from '../dom.js';

export function initModeToggle(): void {
    const toggleButton = requireElement('btn-mode-toggle');
    const toggleLabel = requireElement('mode-toggle-label');

    toggleButton.addEventListener('click', function onToggleClick() {
        setMode(getState().mode === 'edit' ? 'study' : 'edit');
    });

    subscribe(function renderOnChange(state) {
        toggleLabel.textContent = state.mode === 'edit' ? 'Edit mode' : 'Study mode';
        toggleButton.title = state.mode === 'edit' ? 'Switch to study mode' : 'Switch to edit mode';
        toggleButton.toggleAttribute('disabled', !state.document);
    });
}
