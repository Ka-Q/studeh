import { getState, setMode, subscribe } from '../document/state.js';

export function createModeToggle(): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'canvas-mode-toggle';
    button.disabled = true;

    const icon = document.createElement('span');
    icon.className = 'icon icon-mode-toggle';
    icon.setAttribute('aria-hidden', 'true');

    const label = document.createElement('span');

    button.append(icon, label);

    button.addEventListener('click', function onToggleClick() {
        setMode(getState().mode === 'edit' ? 'study' : 'edit');
    });

    subscribe(function renderOnChange(state) {
        const toggleLabel = state.mode === 'edit' ? 'Switch to study mode' : 'Switch to edit mode';
        label.textContent = toggleLabel;
        button.title = toggleLabel;
        button.toggleAttribute('disabled', !state.document);
    });

    return button;
}
