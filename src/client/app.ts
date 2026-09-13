import { initToolbar } from './document/toolbar.js';
import { initOpenDialog } from './document/openDialog.js';
import { initModeToggle } from './modes/modeToggle.js';
import { initPageSidebar } from './pages/sidebar.js';
import { initStage } from './pages/stage.js';

function main(): void {
    initOpenDialog();
    initToolbar();
    initModeToggle();
    initPageSidebar();
    initStage();
}

main();
