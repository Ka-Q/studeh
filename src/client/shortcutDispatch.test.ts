import assert from 'node:assert/strict';
import { test } from 'node:test';
import { matchShortcutId, resolveKey } from './shortcutDispatch';

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

test('resolveKey resolves Period by event.code regardless of the Shift-produced symbol', function () {
    assert.equal(resolveKey({ key: '.', code: 'Period' }), '.');
    assert.equal(resolveKey({ key: '>', code: 'Period' }), '.');
});

test('resolveKey falls back to event.key for keys with no code mapping', function () {
    assert.equal(resolveKey({ key: 'd', code: 'KeyD' }), 'd');
    assert.equal(resolveKey({ key: 'ArrowUp', code: 'ArrowUp' }), 'ArrowUp');
});
