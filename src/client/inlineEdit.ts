const MAX_NAME_LENGTH = 100;
const MIN_INPUT_WIDTH = 24;

let measureContext: CanvasRenderingContext2D | null = null;

export function sanitizeName(value: string): string | null {
    const trimmed = value.trim();
    return trimmed && trimmed.length <= MAX_NAME_LENGTH ? trimmed : null;
}

function getMeasureContext(): CanvasRenderingContext2D {
    if (!measureContext) {
        const context = document.createElement('canvas').getContext('2d');
        if (!context) {
            throw new Error('2d canvas context unavailable');
        }
        measureContext = context;
    }
    return measureContext;
}

function measureTextWidth(text: string, font: string): number {
    const context = getMeasureContext();
    context.font = font;
    return context.measureText(text).width;
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
    input.id = display.id;
    input.className = display.className ? `${display.className} inline-edit` : 'inline-edit';
    input.value = currentValue;
    input.maxLength = MAX_NAME_LENGTH;

    function resizeToContent(): void {
        input.style.width = `${Math.max(MIN_INPUT_WIDTH, measureTextWidth(input.value, font))}px`;
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

    input.addEventListener('click', function onClick(event) {
        event.stopPropagation();
    });

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
