import { getActivePage, getState, subscribe } from '../document/state.js';
import { requireElement } from '../dom.js';

export function initStage(): void {
    const container = requireElement('canvas-area');
    subscribe(function renderOnChange() {
        render(container);
    });
    render(container);
}

function render(container: HTMLElement): void {
    const { document: doc } = getState();
    if (!doc) {
        container.textContent = 'No document open. Use New or Open to get started.';
        return;
    }

    const page = getActivePage();
    if (!page) {
        container.textContent = 'This document has no pages yet. Add one from the sidebar.';
        return;
    }

    container.textContent = page.image
        ? `Active page: ${page.name} (image assigned)`
        : `Active page: ${page.name} (no image yet)`;
}
