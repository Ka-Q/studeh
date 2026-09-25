import { initScrollFade, requireElement, wireDialogClose } from '../dom';
import { registerShortcut } from '../shortcutDispatch';
import { SHORTCUTS, shortcutHint, type ShortcutGroup, type ShortcutId } from '../shortcuts';

const GROUP_TITLES: Record<ShortcutGroup, string> = {
    document: 'Document',
    pages: 'Pages',
    canvas: 'Canvas & Study Mode'
};

const GROUP_ORDER: ShortcutGroup[] = ['document', 'pages', 'canvas'];

const EXTRA_ROWS: Partial<Record<ShortcutGroup, { key: string; label: string }[]>> = {
    document: [{ key: 'Escape', label: 'Cancel an in-progress rename, or close an open dialog' }]
};

export function initHelpDialog(): void {
    const dialog = requireElement('help-dialog') as HTMLDialogElement;
    const closeButton = requireElement('btn-close-help-dialog');
    const helpButton = requireElement('btn-help');
    const groupsContainer = requireElement('help-shortcut-groups');
    const updateScrollFade = initScrollFade(requireElement('help-dialog-content'), requireElement('help-dialog-fade'));

    renderShortcutGroups(groupsContainer);
    updateScrollFade();

    const helpHint = `Help (${shortcutHint('openHelp')})`;
    helpButton.title = helpHint;
    helpButton.setAttribute('aria-label', helpHint);

    wireDialogClose(dialog, closeButton);
    helpButton.addEventListener('click', () => dialog.showModal());
    registerShortcut('openHelp', () => dialog.showModal());
}

function renderShortcutGroups(container: HTMLElement): void {
    for (const group of GROUP_ORDER) {
        container.appendChild(renderShortcutGroup(group));
    }
}

function renderShortcutGroup(group: ShortcutGroup): HTMLDivElement {
    const groupEl = document.createElement('div');
    groupEl.className = 'help-shortcut-group';

    const heading = document.createElement('h4');
    heading.textContent = GROUP_TITLES[group];
    groupEl.appendChild(heading);

    for (const id of shortcutIdsInGroup(group)) {
        groupEl.appendChild(renderShortcutRow(SHORTCUTS[id].label, shortcutHint(id)));
    }
    for (const extra of EXTRA_ROWS[group] ?? []) {
        groupEl.appendChild(renderShortcutRow(extra.label, extra.key));
    }
    return groupEl;
}

function shortcutIdsInGroup(group: ShortcutGroup): ShortcutId[] {
    return (Object.keys(SHORTCUTS) as ShortcutId[]).filter((id) => SHORTCUTS[id].group === group);
}

function renderShortcutRow(label: string, keyText: string): HTMLDivElement {
    const row = document.createElement('div');
    row.className = 'help-shortcut-row';

    const labelEl = document.createElement('span');
    labelEl.textContent = label;

    const keyEl = document.createElement('span');
    keyEl.className = 'help-shortcut-key';
    keyEl.textContent = keyText;

    row.append(labelEl, keyEl);
    return row;
}
