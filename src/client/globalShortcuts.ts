import { onNew, onSave } from './document/toolbar';
import { browseDialog } from './document/browseDialog';
import {
    deleteActivePage,
    deleteSelectedPagesWithConfirm,
    onAddFromImages,
    onAddPage,
    renameActivePage,
    toggleActivePageSelection,
    toggleSelectAllPages,
    toggleSidebarCollapse
} from './pages/sidebar';
import { registerShortcut } from './shortcutDispatch';

export function initGlobalShortcuts(): void {
    registerShortcut('new', onNew);
    registerShortcut('browse', browseDialog);
    registerShortcut('save', onSave);
    registerShortcut('newPage', onAddPage);
    registerShortcut('newPageFromImages', onAddFromImages);
    registerShortcut('toggleActivePageSelection', toggleActivePageSelection);
    registerShortcut('toggleSelectAllPages', toggleSelectAllPages);
    registerShortcut('deleteActivePage', deleteActivePage);
    registerShortcut('deleteSelectedPages', deleteSelectedPagesWithConfirm);
    registerShortcut('renameActivePage', renameActivePage);
    registerShortcut('toggleSidebar', toggleSidebarCollapse);
}
