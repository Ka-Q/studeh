const MAX_NAME_LENGTH = 100;
const CARET_WIDTH_BUFFER = 3;

let measureContext: CanvasRenderingContext2D | null = null;

export function sanitizeName(value: string): string | null {
    const trimmed = value.trim();
    return trimmed && trimmed.length <= MAX_NAME_LENGTH ? trimmed : null;
}

function measureTextWidth(text: string, font: string): number {
    if (!measureContext) {
        measureContext = document.createElement('canvas').getContext('2d');
    }
    if (!measureContext) {
        return 0;
    }
    measureContext.font = font;
    return measureContext.measureText(text).width;
}

export function startInlineEdit(
    display: HTMLElement,
    currentValue: string,
    onCommit: (value: string) => void
): void {
    const displayStyle = getComputedStyle(display);
    const font = `${displayStyle.fontWeight} ${displayStyle.fontSize} ${displayStyle.fontFamily}`;

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'inline-edit';
    input.style.fontSize = displayStyle.fontSize;
    input.value = currentValue;
    input.maxLength = MAX_NAME_LENGTH;

    function resizeToContent(): void {
        input.style.width = `${measureTextWidth(input.value, font) + CARET_WIDTH_BUFFER}px`;
    }

    resizeToContent();
    input.addEventListener('input', resizeToContent);

    let settled = false;

    function finish(): void {
        input.replaceWith(display);
    }

    function commit(): void {
        if (settled) {
            return;
        }
        settled = true;
        finish();
        const sanitized = sanitizeName(input.value);
        if (sanitized && sanitized !== currentValue) {
            onCommit(sanitized);
        }
    }

    function cancel(): void {
        if (settled) {
            return;
        }
        settled = true;
        finish();
    }

    input.addEventListener('keydown', function onKeyDown(event) {
        if (event.key === 'Enter') {
            event.preventDefault();
            commit();
        } else if (event.key === 'Escape') {
            event.preventDefault();
            cancel();
        }
    });
    input.addEventListener('blur', commit);

    display.replaceWith(input);
    input.focus();
    input.select();
}
