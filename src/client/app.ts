import { getDocument } from './document/api';
import { initToolbar } from './document/toolbar';
import { initBrowseDialog } from './document/browseDialog';
import { getState, setDocument } from './document/state';
import { initNavigationGuard } from './document/navigation';
import { initConfirmDialog } from './dialogs/confirmDialog';
import { initNewDocumentDialog } from './dialogs/newDocumentDialog';
import { initNoticeDialog } from './dialogs/noticeDialog';
import { initPageSidebar } from './pages/sidebar';
import { initStage } from './pages/stage';
import { initTheme } from './theme';
import { initKeyboardNav } from './keyboardNav';
import { initGlobalShortcuts } from './globalShortcuts';
import { initShortcutDispatch } from './shortcutDispatch';
import { reportError } from './errors';

function main(): void {
    initTheme();
    initShortcutDispatch();
    initNoticeDialog();
    initConfirmDialog();
    initNewDocumentDialog();
    initBrowseDialog();
    initToolbar();
    initPageSidebar();
    initStage();
    initKeyboardNav();
    initGlobalShortcuts();
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
