(function applyStoredTheme(): void {
    const STORAGE_KEY = 'studeh:theme';
    const stored = localStorage.getItem(STORAGE_KEY);
    const theme = stored === 'light' || stored === 'dark'
        ? stored
        : window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', theme);
})();
