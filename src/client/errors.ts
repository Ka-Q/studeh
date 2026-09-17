import { noticeDialog } from './dialogs/noticeDialog.js';

export function reportError(action: string, error: unknown): void {
    void noticeDialog('Something went wrong', `Failed to ${action}: ${error instanceof Error ? error.message : String(error)}`);
}
