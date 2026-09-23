import { iconSpan } from '../dom';
import { startInlineEdit } from '../inlineEdit';
import { shortcutHint } from '../shortcuts';
import { MAX_ZOOM, MIN_ZOOM } from './viewport';
import type { ImageCanvasHandle } from './imageCanvas';

export interface CanvasZoomHandle {
    setSource(source: ImageCanvasHandle | null): void;
    zoomIn(): void;
    zoomOut(): void;
    resetZoom(): void;
    fitToView(): void;
}

const ZOOM_STEP_PERCENT = 10;
const DEFAULT_ZOOM_PERCENT = 100;
const MIN_ZOOM_PERCENT = Math.round(MIN_ZOOM * 100);
const MAX_ZOOM_PERCENT = Math.round(MAX_ZOOM * 100);

export function initCanvasZoom(container: HTMLElement): CanvasZoomHandle {
    const bar = document.createElement('div');
    bar.className = 'canvas-zoom';
    bar.hidden = true;

    const zoomInButton = document.createElement('button');
    zoomInButton.type = 'button';
    zoomInButton.className = 'canvas-zoom-button canvas-zoom-step';
    zoomInButton.title = `Zoom in (Scroll up / ${shortcutHint('zoomIn')})`;
    zoomInButton.setAttribute('aria-label', 'Zoom in');
    zoomInButton.append(iconSpan('icon-plus'));

    const percentEl = document.createElement('span');
    percentEl.className = 'canvas-zoom-percent';
    percentEl.title = 'Double-click to enter a zoom percentage';

    const zoomOutButton = document.createElement('button');
    zoomOutButton.type = 'button';
    zoomOutButton.className = 'canvas-zoom-button canvas-zoom-step';
    zoomOutButton.title = `Zoom out (Scroll down / ${shortcutHint('zoomOut')})`;
    zoomOutButton.setAttribute('aria-label', 'Zoom out');
    zoomOutButton.append(iconSpan('icon-minus'));

    const stepperGroup = document.createElement('div');
    stepperGroup.className = 'canvas-zoom-group';
    stepperGroup.append(zoomInButton, percentEl, zoomOutButton);

    const resetButton = document.createElement('button');
    resetButton.type = 'button';
    resetButton.className = 'canvas-zoom-button';
    resetButton.title = `Reset zoom to 100% (${shortcutHint('resetZoom')})`;
    resetButton.setAttribute('aria-label', 'Reset zoom to 100%');
    resetButton.append(iconSpan('icon-reset'));

    const fitButton = document.createElement('button');
    fitButton.type = 'button';
    fitButton.className = 'canvas-zoom-button';
    fitButton.title = `Fit to view (reset zoom and pan) (${shortcutHint('fitToView')})`;
    fitButton.setAttribute('aria-label', 'Fit to view');
    fitButton.append(iconSpan('icon-fit'));

    const actionsGroup = document.createElement('div');
    actionsGroup.className = 'canvas-zoom-group canvas-zoom-actions';
    actionsGroup.append(resetButton, fitButton);

    bar.append(stepperGroup, actionsGroup);
    container.append(bar);

    let source: ImageCanvasHandle | null = null;
    let unsubscribe: (() => void) | null = null;
    let lastRenderedPercent: number | null = null;
    let lastRenderedReady: boolean | null = null;

    function currentPercent(): number {
        return Math.round((source?.getZoom() ?? 1) * 100);
    }

    function isSourceReady(): boolean {
        return source !== null && source.isReady();
    }

    function refresh(): void {
        const ready = isSourceReady();
        const percent = currentPercent();
        if (percent === lastRenderedPercent && ready === lastRenderedReady) {
            return;
        }
        lastRenderedPercent = percent;
        lastRenderedReady = ready;
        bar.hidden = !ready;
        percentEl.textContent = `${percent}`;
        zoomOutButton.disabled = !ready || percent <= MIN_ZOOM_PERCENT;
        zoomInButton.disabled = !ready || percent >= MAX_ZOOM_PERCENT;
        resetButton.disabled = !ready || percent === DEFAULT_ZOOM_PERCENT;
        fitButton.disabled = !ready;
    }

    function applyPercent(percent: number): void {
        source?.setZoom(percent / 100);
    }

    function stepZoomIn(): void {
        applyPercent(currentPercent() + ZOOM_STEP_PERCENT);
    }

    function stepZoomOut(): void {
        applyPercent(currentPercent() - ZOOM_STEP_PERCENT);
    }

    function resetZoom(): void {
        applyPercent(DEFAULT_ZOOM_PERCENT);
    }

    function fitToView(): void {
        source?.fitToView();
    }

    zoomOutButton.addEventListener('click', stepZoomOut);
    zoomInButton.addEventListener('click', stepZoomIn);
    resetButton.addEventListener('click', resetZoom);
    fitButton.addEventListener('click', fitToView);

    percentEl.addEventListener('dblclick', () => {
        if (!isSourceReady()) {
            return;
        }
        startInlineEdit(
            percentEl,
            String(currentPercent()),
            function onCommit(value) {
                applyPercent(Number(value));
            },
            sanitizePercent,
            String(MAX_ZOOM_PERCENT).length,
            true
        );
    });

    refresh();

    return {
        setSource(nextSource: ImageCanvasHandle | null): void {
            unsubscribe?.();
            unsubscribe = null;
            source = nextSource;
            lastRenderedPercent = null;
            lastRenderedReady = null;
            if (source) {
                unsubscribe = source.onViewportChange(refresh);
            }
            refresh();
        },
        zoomIn: stepZoomIn,
        zoomOut: stepZoomOut,
        resetZoom,
        fitToView
    };
}

export function sanitizePercent(value: string): string | null {
    const trimmed = value.trim();
    if (!trimmed) {
        return null;
    }
    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed)) {
        return null;
    }
    const clamped = Math.min(MAX_ZOOM_PERCENT, Math.max(MIN_ZOOM_PERCENT, Math.round(parsed)));
    return String(clamped);
}
