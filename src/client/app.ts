import { getDocument } from './document/api.js';
import { initToolbar } from './document/toolbar.js';
import { initOpenDialog } from './document/openDialog.js';
import { getState, setDocument } from './document/state.js';
import { initNavigationGuard } from './document/navigation.js';
import { initConfirmDialog } from './dialogs/confirmDialog.js';
import { initNewDocumentDialog } from './dialogs/newDocumentDialog.js';
import { initNoticeDialog } from './dialogs/noticeDialog.js';
import { initPageSidebar } from './pages/sidebar.js';
import { initStage } from './pages/stage.js';
import { initTheme } from './theme.js';
import { initKeyboardNav } from './keyboardNav.js';
import { reportError } from './errors.js';

function main(): void {
    initTheme();
    initNoticeDialog();
    initConfirmDialog();
    initNewDocumentDialog();
    initOpenDialog();
    initToolbar();
    initPageSidebar();
    initStage();
    initKeyboardNav();
    initNavigationGuard();
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
