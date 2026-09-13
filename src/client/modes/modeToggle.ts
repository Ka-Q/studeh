import { getState, setMode, subscribe } from '../document/state.js';
import { requireElement } from '../dom.js';

export function initModeToggle(): void {
    const statusEl = requireElement('mode-status');
    const toggleButton = requireElement('btn-mode-toggle');

    toggleButton.addEventListener('click', function onToggleClick() {
        setMode(getState().mode === 'edit' ? 'study' : 'edit');
    });

    subscribe(function renderOnChange(state) {
        statusEl.textContent = state.mode === 'edit' ? 'Currently editing' : 'Currently studying';
        toggleButton.textContent = state.mode === 'edit' ? 'Switch to studying' : 'Switch to editing';
        toggleButton.toggleAttribute('disabled', !state.document);
    });
}
