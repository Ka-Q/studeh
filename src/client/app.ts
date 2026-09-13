import { getDocument } from './document/api.js';
import { initToolbar } from './document/toolbar.js';
import { initOpenDialog } from './document/openDialog.js';
import { setDocument } from './document/state.js';
import { initModeToggle } from './modes/modeToggle.js';
import { initPageSidebar } from './pages/sidebar.js';
import { initStage } from './pages/stage.js';

function main(): void {
    initOpenDialog();
    initToolbar();
    initModeToggle();
    initPageSidebar();
    initStage();
    restoreDocumentFromUrl();
}

async function restoreDocumentFromUrl(): Promise<void> {
    const id = location.pathname.slice(1);
    if (!id) {
        return;
    }
    try {
        setDocument(await getDocument(id));
    } catch {
        history.replaceState(null, '', '/');
    }
}

main();
