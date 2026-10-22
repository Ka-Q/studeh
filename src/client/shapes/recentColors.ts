const STORAGE_KEY = 'studeh:recentShapeColors';
const MAX_RECENT_COLORS = 5;

export function loadRecentColors(): string[] {
    try {
        const stored: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');
        return Array.isArray(stored) ? stored.filter(isStoredColor).slice(0, MAX_RECENT_COLORS) : [];
    } catch {
        return [];
    }
}

// The colour goes first; one already in the list moves up rather than appearing twice.
export function rememberColor(color: string): string[] {
    const recent = [color, ...loadRecentColors().filter((other) => other !== color)].slice(0, MAX_RECENT_COLORS);
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(recent));
    } catch {
        // The page works without remembering.
    }
    return recent;
}

function isStoredColor(value: unknown): value is string {
    return typeof value === 'string' && /^#[0-9a-f]{6}$/.test(value);
}
