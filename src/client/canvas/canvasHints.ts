import type { Mode } from '../document/state';
import { iconSpan } from '../dom';
import { registerShortcut } from '../shortcutDispatch';
import { shortcutHint } from '../shortcuts';

export interface CanvasHintsHandle {
    setMode(mode: Mode): void;
}

interface HintRow {
    label: string;
    keys: string;
}

const COLLAPSED_STORAGE_KEY = 'studeh:canvasHintsCollapsed';

const HINTS: Record<Mode, HintRow[]> = {
    edit: [
        { label: 'Pan', keys: 'Middle drag / Ctrl+drag' },
        { label: 'Zoom', keys: 'Scroll' },
        { label: 'Draw', keys: 'Left drag' }
    ],
    study: [
        { label: 'Pan', keys: 'Middle drag / Ctrl+drag' },
        { label: 'Zoom', keys: 'Scroll' },
        { label: 'Toggle', keys: 'Click' },
        { label: 'Reveal all', keys: shortcutHint('revealAll') },
        { label: 'Hide all', keys: shortcutHint('hideAll') },
        { label: 'Fullscreen', keys: shortcutHint('toggleFullscreen') }
    ]
};

export function initCanvasHints(container: HTMLElement, mode: Mode): CanvasHintsHandle {
    const bar = document.createElement('div');
    bar.className = 'canvas-hints';

    const rowsEl = document.createElement('div');
    rowsEl.className = 'canvas-hints-rows';

    const toggleButton = document.createElement('button');
    toggleButton.type = 'button';
    toggleButton.className = 'icon-button canvas-hints-toggle';
    toggleButton.append(iconSpan('icon-chevron-right'));

    bar.append(rowsEl, toggleButton);
    container.append(bar);

    let collapsed = localStorage.getItem(COLLAPSED_STORAGE_KEY) === 'true';
    let renderedMode = mode;

    function renderRows(currentMode: Mode): void {
        rowsEl.innerHTML = '';
        for (const row of HINTS[currentMode]) {
            const rowEl = document.createElement('span');
            rowEl.className = 'canvas-hints-row';
            rowEl.textContent = `${row.label}: ${row.keys}`;
            rowsEl.append(rowEl);
        }
    }

    function applyCollapsedState(): void {
        bar.classList.toggle('collapsed', collapsed);
        const toggleAction = collapsed ? 'Show shortcuts' : 'Hide shortcuts';
        toggleButton.title = `${toggleAction} (${shortcutHint('toggleCanvasHints')})`;
    }

    function toggleCollapsed(): void {
        collapsed = !collapsed;
        localStorage.setItem(COLLAPSED_STORAGE_KEY, String(collapsed));
        applyCollapsedState();
    }

    toggleButton.addEventListener('click', toggleCollapsed);

    registerShortcut('toggleCanvasHints', toggleCollapsed);

    renderRows(mode);
    applyCollapsedState();

    return {
        setMode(nextMode: Mode): void {
            if (nextMode === renderedMode) {
                return;
            }
            renderedMode = nextMode;
            renderRows(nextMode);
        }
    };
}
