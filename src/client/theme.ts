import { requireElement } from './dom';

type Theme = 'light' | 'dark';

const STORAGE_KEY = 'studeh:theme';

export function initTheme(): void {
    const button = requireElement('btn-theme-toggle');
    const icon = requireElement('theme-icon');
    let theme = resolveInitialTheme();
    applyTheme(theme, button, icon);

    button.addEventListener('click', () => {
        theme = theme === 'dark' ? 'light' : 'dark';
        applyTheme(theme, button, icon);
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

function applyTheme(theme: Theme, button: HTMLElement, icon: HTMLElement): void {
    document.documentElement.setAttribute('data-theme', theme);
    const label = theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode';
    button.title = label;
    button.setAttribute('aria-label', label);
    icon.classList.toggle('icon-moon', theme === 'dark');
    icon.classList.toggle('icon-sun', theme !== 'dark');
}
