const MAX_NAME_LENGTH = 100;

let measureMirror: HTMLSpanElement | null = null;

export function sanitizeName(value: string): string | null {
    const trimmed = value.trim();
    return trimmed && trimmed.length <= MAX_NAME_LENGTH ? trimmed : null;
}

function getMeasureMirror(): HTMLSpanElement {
    if (!measureMirror) {
        measureMirror = document.createElement('span');
        measureMirror.style.position = 'absolute';
        measureMirror.style.visibility = 'hidden';
        measureMirror.style.whiteSpace = 'pre';
        measureMirror.style.left = '-9999px';
        measureMirror.style.top = '0';
        document.body.appendChild(measureMirror);
    }
    return measureMirror;
}

function measureTextWidth(text: string, font: string): number {
    const mirror = getMeasureMirror();
    mirror.style.font = font;
    mirror.textContent = text;
    return mirror.getBoundingClientRect().width;
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
        input.style.width = `${measureTextWidth(input.value, font)}px`;
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
