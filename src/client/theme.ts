import { requireElement } from './dom.js';

type Theme = 'light' | 'dark';

const STORAGE_KEY = 'studeh:theme';

export function initTheme(): void {
    const button = requireElement('btn-theme-toggle');
    let theme = resolveInitialTheme();
    applyTheme(theme);

    button.addEventListener('click', function onToggleTheme() {
        theme = theme === 'dark' ? 'light' : 'dark';
        applyTheme(theme);
        localStorage.setItem(STORAGE_KEY, theme);
    });
}

function resolveInitialTheme(): Theme {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'light' || stored === 'dark') {
        return stored;
    }
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function applyTheme(theme: Theme): void {
    document.documentElement.setAttribute('data-theme', theme);
    requireElement('btn-theme-toggle').textContent = theme === 'dark' ? 'Light mode' : 'Dark mode';
}
