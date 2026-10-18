import { getDocument } from './document/api';
import { initToolbar } from './document/toolbar';
import { initBrowseDialog } from './document/browseDialog';
import { getState, setDocument, setMode, subscribe } from './document/state';
import { initNavigationGuard } from './document/navigation';
import { initConfirmDialog } from './dialogs/confirmDialog';
import { initHelpDialog } from './dialogs/helpDialog';
import { initNewDocumentDialog } from './dialogs/newDocumentDialog';
import { initNoticeDialog } from './dialogs/noticeDialog';
import { initPageSidebar } from './pages/sidebar';
import { initStage } from './pages/stage';
import { initTheme } from './theme';
import { initKeyboardNav } from './keyboardNav';
import { initGlobalShortcuts } from './globalShortcuts';
import { initShortcutDispatch } from './shortcutDispatch';
import { reportError } from './errors';

// Kept for the tab only, so a reload returns to the same mode while a newly opened app starts in edit mode.
const MODE_STORAGE_KEY = 'studeh:mode';

function main(): void {
    initTheme();
    initShortcutDispatch();
    initNoticeDialog();
    initConfirmDialog();
    initNewDocumentDialog();
    initHelpDialog();
    initBrowseDialog();
    initToolbar();
    initPageSidebar();
    initStage();
    initKeyboardNav();
    initGlobalShortcuts();
    initNavigationGuard();
    const modeBeforeReload = sessionStorage.getItem(MODE_STORAGE_KEY);
    subscribe((state) => sessionStorage.setItem(MODE_STORAGE_KEY, state.mode));
    restoreDocumentFromUrl(modeBeforeReload === 'study');
}

async function restoreDocumentFromUrl(isStudyMode: boolean): Promise<void> {
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
        if (isStudyMode) {
            setMode('study');
        }
    } catch (error) {
        history.replaceState(null, '', '/');
        reportError('open document', error);
    }
}

main();
