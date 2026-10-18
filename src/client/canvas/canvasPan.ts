import { iconSpan, startDragSession } from '../dom';
import { shortcutHint, type ShortcutId } from '../shortcuts';
import type { ImageCanvasHandle } from './imageCanvas';

export interface CanvasPanHandle {
    setSource(source: ImageCanvasHandle | null): void;
}

// Holding an arrow keeps panning: a first step at once, then repeats after the delay, as a held key does.
const HOLD_REPEAT_DELAY_MS = 350;
const HOLD_REPEAT_INTERVAL_MS = 60;
// The knob is a joystick: pushed, the view keeps panning that way while held, faster the further it is pushed, so a
// little room is enough (the pad sits in a corner, where screen edges would soon stop a dragged image).
// A push within the dead zone doesn't pan, so a grab that wobbles doesn't drift the view.
const JOYSTICK_DEAD_ZONE_PX = 3;
// Pushed this far or further, the view pans at the top speed.
const JOYSTICK_FULL_PUSH_PX = 40;
const JOYSTICK_MAX_SPEED_PX_PER_S = 1500;
// How far the knob's hand leans towards the push.
const KNOB_LEAN_PX = 4;

interface PanArrow {
    className: string;
    label: string;
    shortcut: ShortcutId;
    x: number;
    y: number;
}

const PAN_ARROWS: PanArrow[] = [
    { className: 'canvas-pan-up', label: 'Pan up', shortcut: 'panUp', x: 0, y: -1 },
    { className: 'canvas-pan-left', label: 'Pan left', shortcut: 'panLeft', x: -1, y: 0 },
    { className: 'canvas-pan-right', label: 'Pan right', shortcut: 'panRight', x: 1, y: 0 },
    { className: 'canvas-pan-down', label: 'Pan down', shortcut: 'panDown', x: 0, y: 1 }
];

// Arrow buttons round a joystick knob, for panning without a middle button or the keyboard: an arrow pans a step
// (held, it keeps going); the knob pans the way it is pushed, as the arrows do.
export function initCanvasPan(container: HTMLElement): CanvasPanHandle {
    const pad = document.createElement('div');
    pad.className = 'canvas-pan';
    pad.hidden = true;

    let source: ImageCanvasHandle | null = null;
    let unsubscribe: (() => void) | null = null;

    for (const arrow of PAN_ARROWS) {
        pad.append(buildArrowButton(arrow));
    }

    const knob = document.createElement('div');
    knob.className = 'canvas-pan-knob';
    knob.title = 'Drag to pan';
    const knobHand = iconSpan('icon-hand');
    knob.append(knobHand);
    knob.addEventListener('mousedown', (event) => {
        event.preventDefault();
        const start = { x: event.clientX, y: event.clientY };
        let push = { x: 0, y: 0 };
        let lastFrameAt = performance.now();
        let frame = requestAnimationFrame(panWhilePushed);
        knob.classList.add('dragging');

        function panWhilePushed(now: number): void {
            const length = Math.hypot(push.x, push.y);
            const distance = joystickSpeed(length) * (now - lastFrameAt) / 1000;
            if (distance > 0) {
                source?.panBy(-push.x / length * distance, -push.y / length * distance);
            }
            lastFrameAt = now;
            frame = requestAnimationFrame(panWhilePushed);
        }

        startDragSession((moveEvent) => {
            push = { x: moveEvent.clientX - start.x, y: moveEvent.clientY - start.y };
            const lean = leanTowards(push.x, push.y);
            knobHand.style.transform = `translate(${lean.x}px, ${lean.y}px)`;
        }, () => {
            cancelAnimationFrame(frame);
            knob.classList.remove('dragging');
            knobHand.style.transform = '';
        });
    });
    pad.append(knob);
    container.append(pad);

    function buildArrowButton(arrow: PanArrow): HTMLButtonElement {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = `canvas-pan-button ${arrow.className}`;
        const hint = `${arrow.label} (${shortcutHint(arrow.shortcut)})`;
        button.title = hint;
        button.setAttribute('aria-label', hint);
        button.append(iconSpan('icon-chevron-right'));
        // Keyboard activation pans one step; pointer presses are handled on mousedown so a hold can repeat.
        button.addEventListener('click', (event) => {
            if (event.detail === 0) {
                source?.panByStep(arrow.x, arrow.y);
            }
        });
        button.addEventListener('mousedown', (event) => {
            event.preventDefault();
            holdToRepeat(() => source?.panByStep(arrow.x, arrow.y));
        });
        return button;
    }

    function refresh(): void {
        pad.hidden = !source?.isReady();
    }

    return {
        setSource(nextSource: ImageCanvasHandle | null): void {
            unsubscribe?.();
            unsubscribe = null;
            source = nextSource;
            if (source) {
                unsubscribe = source.onViewportChange(refresh);
            }
            refresh();
        }
    };
}

// Pixels per second the view pans with the knob pushed this far from where it was grabbed.
export function joystickSpeed(push: number): number {
    const share = (push - JOYSTICK_DEAD_ZONE_PX) / (JOYSTICK_FULL_PUSH_PX - JOYSTICK_DEAD_ZONE_PX);
    return JOYSTICK_MAX_SPEED_PX_PER_S * Math.min(1, Math.max(0, share));
}

// The push, shortened to the knob's lean where it reaches further.
function leanTowards(dx: number, dy: number): { x: number; y: number } {
    const scale = Math.min(1, KNOB_LEAN_PX / (Math.hypot(dx, dy) || 1));
    return { x: dx * scale, y: dy * scale };
}

function holdToRepeat(action: () => void): void {
    action();
    let repeat: number | null = null;
    const delay = window.setTimeout(() => {
        repeat = window.setInterval(action, HOLD_REPEAT_INTERVAL_MS);
    }, HOLD_REPEAT_DELAY_MS);
    startDragSession(() => {}, () => {
        window.clearTimeout(delay);
        if (repeat !== null) {
            window.clearInterval(repeat);
        }
    });
}
