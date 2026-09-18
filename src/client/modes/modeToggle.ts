import { getState, setMode, subscribe } from '../document/state.js';
import { iconSpan } from '../dom.js';

export interface ModeToggleHandle {
    button: HTMLButtonElement;
    setFullscreen(isFullscreen: boolean): void;
}

export function createModeToggle(): ModeToggleHandle {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'canvas-mode-toggle';
    button.disabled = true;
    button.hidden = true;

    const icon = iconSpan('icon-mode-toggle');
    const label = document.createElement('span');

    button.append(icon, label);

    let isFullscreen = false;
    let hasDocument = false;

    function updateVisibility(): void {
        button.hidden = isFullscreen || !hasDocument;
    }

    button.addEventListener('click', function onToggleClick() {
        setMode(getState().mode === 'edit' ? 'study' : 'edit');
    });

    subscribe(function renderOnChange(state) {
        const toggleLabel = state.mode === 'edit' ? 'Switch to study mode' : 'Switch to edit mode';
        label.textContent = toggleLabel;
        button.title = toggleLabel;
        button.toggleAttribute('disabled', !state.document);
        hasDocument = !!state.document;
        updateVisibility();
    });

    return {
        button,
        setFullscreen(nextIsFullscreen: boolean): void {
            isFullscreen = nextIsFullscreen;
            updateVisibility();
        }
    };
}
