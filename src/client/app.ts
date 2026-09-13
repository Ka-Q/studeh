import { getDocument } from './document/api.js';
import { initToolbar } from './document/toolbar.js';
import { initOpenDialog } from './document/openDialog.js';
import { getState, setDocument } from './document/state.js';
import { initModeToggle } from './modes/modeToggle.js';
import { initPageSidebar } from './pages/sidebar.js';
import { initStage } from './pages/stage.js';
import { reportError } from './errors.js';

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
        const document = await getDocument(id);
        if (getState().document) {
            return;
        }
        setDocument(document);
    } catch (error) {
        history.replaceState(null, '', '/');
        reportError('open document', error);
    }
}

main();
