const MAX_NAME_LENGTH = 100;

export function sanitizeName(value: string): string | null {
    const trimmed = value.trim();
    return trimmed && trimmed.length <= MAX_NAME_LENGTH ? trimmed : null;
}

export function startInlineEdit(
    display: HTMLElement,
    currentValue: string,
    onCommit: (value: string) => void
): void {
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'inline-edit';
    input.style.fontSize = getComputedStyle(display).fontSize;
    input.value = currentValue;
    input.maxLength = MAX_NAME_LENGTH;
    input.size = Math.max(currentValue.length + 2, 10);

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
