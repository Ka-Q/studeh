import { getState, setMode, subscribe } from '../document/state';
import { iconSpan } from '../dom';
import { registerShortcut } from '../shortcutDispatch';
import { shortcutHint } from '../shortcuts';

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

    registerShortcut('toggleMode', function onToggleModeShortcut() {
        if (isSwitchable()) {
            toggleMode();
        }
    });

    subscribe(function renderOnChange(state) {
        const toggleLabel = state.mode === 'edit' ? 'Switch to study mode' : 'Switch to edit mode';
        label.textContent = toggleLabel;
        button.title = `${toggleLabel} (${shortcutHint('toggleMode')})`;
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
