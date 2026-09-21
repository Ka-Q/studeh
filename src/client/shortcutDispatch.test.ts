import assert from 'node:assert/strict';
import { test } from 'node:test';
import { matchShortcutId } from './shortcutDispatch';

test('matchShortcutId matches key+modifier combos independently of case', function () {
    assert.equal(matchShortcutId('D', 'primary'), 'new');
    assert.equal(matchShortcutId('d', 'primary'), 'new');
});

test('matchShortcutId distinguishes shortcuts sharing a key by modifier', function () {
    assert.equal(matchShortcutId('F2', 'none'), 'renameDocument');
    assert.equal(matchShortcutId('F2', 'primary'), 'renameActivePage');
    assert.equal(matchShortcutId('h', 'primary'), 'toggleSidebar');
    assert.equal(matchShortcutId('h', 'none'), 'toggleCanvasHints');
});

test('matchShortcutId returns null when no modifier combo matches', function () {
    assert.equal(matchShortcutId('d', 'none'), null);
    assert.equal(matchShortcutId('d', 'primaryShift'), null);
    assert.equal(matchShortcutId('q', 'none'), null);
});
