import { getState, setMode, subscribe } from '../document/state.js';
import { iconSpan } from '../dom.js';
import { isBlockedByInputOrDialog } from '../keyboardNav.js';

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
    let hasPages = false;

    function isSwitchable(): boolean {
        return !isFullscreen && hasDocument && hasPages;
    }

    function updateVisibility(): void {
        button.hidden = !isSwitchable();
    }

    function toggleMode(): void {
        setMode(getState().mode === 'edit' ? 'study' : 'edit');
    }

    button.addEventListener('click', function onToggleClick() {
        toggleMode();
    });

    document.addEventListener('keydown', function onKeyDown(event) {
        if (event.key.toLowerCase() !== 'm' || isBlockedByInputOrDialog() || !isSwitchable()) {
            return;
        }
        toggleMode();
    });

    subscribe(function renderOnChange(state) {
        const toggleLabel = state.mode === 'edit' ? 'Switch to study mode' : 'Switch to edit mode';
        label.textContent = toggleLabel;
        button.title = toggleLabel;
        button.toggleAttribute('disabled', !state.document);
        hasDocument = !!state.document;
        hasPages = (state.document?.pages.length ?? 0) > 0;
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
