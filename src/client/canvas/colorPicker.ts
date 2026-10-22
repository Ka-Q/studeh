import { hexToHsv, hiddenFillOf, hsvToHex, parseColor, type Hsv } from '../shapes/shapeColor';
import { loadRecentColors, rememberColor } from '../shapes/recentColors';

export interface ColorPicker {
    element: HTMLElement;
    // Shows the picker, starting from the colour (or a default one); opens above the anchor's box when `opensUpward`.
    open(currentColor: string | undefined, opensUpward: boolean): void;
    close(): void;
    isOpen(): boolean;
}

const DEFAULT_COLOR = '#2563eb';
const MAX_HUE = 360;

// Colours join the recent ones when the picker closes, so trying colours doesn't push the others out.
// The colour is applied when a drag ends, a recent colour is clicked or a typed one is entered, so each is one undo step.
export function buildColorPicker(onPick: (color: string) => void): ColorPicker {
    let hsv: Hsv = hexToHsv(DEFAULT_COLOR);
    let pickedColor: string | null = null;

    const element = document.createElement('div');
    element.className = 'color-picker';
    element.hidden = true;
    element.setAttribute('role', 'dialog');
    element.setAttribute('aria-label', 'Shape colour');

    const recents = document.createElement('div');
    recents.className = 'color-picker-recents';

    const square = document.createElement('div');
    square.className = 'color-picker-square';
    const squareMarker = document.createElement('div');
    squareMarker.className = 'color-picker-marker';
    square.append(squareMarker);

    const hueSlider = document.createElement('input');
    hueSlider.type = 'range';
    hueSlider.min = '0';
    hueSlider.max = String(MAX_HUE);
    hueSlider.className = 'color-picker-hue';
    hueSlider.setAttribute('aria-label', 'Hue');

    const hexField = document.createElement('input');
    hexField.type = 'text';
    hexField.className = 'color-picker-hex';
    hexField.spellcheck = false;
    hexField.placeholder = '#rrggbb or rgb(r, g, b)';
    hexField.setAttribute('aria-label', 'Colour as hex or rgb()');
    const error = document.createElement('div');
    error.className = 'color-picker-error';
    error.id = 'color-picker-error';
    error.setAttribute('role', 'alert');
    error.hidden = true;
    error.textContent = 'Use #rgb, #rrggbb or rgb(r, g, b).';

    const preview = document.createElement('div');
    preview.className = 'color-picker-preview';
    preview.title = 'How a hidden shape looks in study mode';
    const hexRow = document.createElement('div');
    hexRow.className = 'color-picker-hex-row';
    hexRow.append(preview, hexField);

    element.append(recents, square, hueSlider, hexRow, error);

    function showHsl(): void {
        square.style.setProperty('--picker-hue', String(hsv.hue));
        squareMarker.style.left = `${hsv.saturation * 100}%`;
        squareMarker.style.top = `${(1 - hsv.value) * 100}%`;
        squareMarker.style.background = hsvToHex(hsv);
        hueSlider.value = String(Math.round(hsv.hue));
        const color = hsvToHex(hsv);
        hexField.value = color;
        preview.style.background = hiddenFillOf(color);
        preview.style.borderColor = color;
        setError(false);
    }

    function setError(hasError: boolean): void {
        error.hidden = !hasError;
        hexField.toggleAttribute('aria-invalid', hasError);
        if (hasError) {
            hexField.setAttribute('aria-describedby', error.id);
        } else {
            hexField.removeAttribute('aria-describedby');
        }
    }

    function showRecents(): void {
        recents.replaceChildren(...loadRecentColors().map(function swatchOf(color) {
            const swatch = document.createElement('button');
            swatch.type = 'button';
            swatch.className = 'color-picker-swatch';
            swatch.style.background = color;
            swatch.title = color;
            swatch.setAttribute('aria-label', `Recent colour ${color}`);
            swatch.addEventListener('click', () => pickTyped(color));
            return swatch;
        }));
        recents.hidden = recents.childElementCount === 0;
    }

    function pick(color: string): void {
        hsv = hexToHsv(color);
        showHsl();
        pickedColor = color;
        onPick(color);
    }

    // A colour not made with the square or slider has its hue read from itself.
    function pickTyped(color: string): void {
        hsv = hexToHsv(color);
        pick(color);
    }

    function moveToPoint(event: PointerEvent): void {
        const box = square.getBoundingClientRect();
        hsv = {
            ...hsv,
            saturation: clamp01((event.clientX - box.left) / box.width),
            value: clamp01(1 - (event.clientY - box.top) / box.height)
        };
        showHsl();
    }

    square.addEventListener('pointerdown', (event) => {
        event.preventDefault();
        square.setPointerCapture(event.pointerId);
        moveToPoint(event);
    });
    square.addEventListener('pointermove', (event) => {
        if (square.hasPointerCapture(event.pointerId)) {
            moveToPoint(event);
        }
    });
    square.addEventListener('pointerup', (event) => {
        moveToPoint(event);
        pick(hsvToHex(hsv));
    });

    hueSlider.addEventListener('input', () => {
        hsv = { ...hsv, hue: Number(hueSlider.value) };
        showHsl();
    });
    hueSlider.addEventListener('change', () => pick(hsvToHex(hsv)));

    hexField.addEventListener('input', () => setError(false));
    hexField.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
            applyTypedColor();
        }
    });
    hexField.addEventListener('change', applyTypedColor);

    function applyTypedColor(): void {
        const color = parseColor(hexField.value);
        if (color) {
            pickTyped(color);
        } else {
            setError(true);
        }
    }

    return {
        element,
        open(currentColor, opensUpward) {
            hsv = hexToHsv(currentColor ?? DEFAULT_COLOR);
            showHsl();
            showRecents();
            element.classList.toggle('opens-upward', opensUpward);
            pickedColor = null;
            element.hidden = false;
            hexField.focus();
        },
        close() {
            if (pickedColor) {
                rememberColor(pickedColor);
                pickedColor = null;
            }
            element.hidden = true;
        },
        isOpen() {
            return !element.hidden;
        }
    };
}

function clamp01(value: number): number {
    return Math.max(0, Math.min(1, value));
}
