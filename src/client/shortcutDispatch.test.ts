import assert from 'node:assert/strict';
import { test } from 'node:test';
import { matchShortcutId } from './shortcutDispatch';
import { Modifier } from './shortcuts';

test('matchShortcutId matches key+modifier combos independently of case', function () {
    assert.equal(matchShortcutId('D', Modifier.PRIMARY), 'new');
    assert.equal(matchShortcutId('d', Modifier.PRIMARY), 'new');
});

test('matchShortcutId distinguishes shortcuts sharing a key by modifier', function () {
    assert.equal(matchShortcutId('F2', Modifier.NONE), 'renameDocument');
    assert.equal(matchShortcutId('F2', Modifier.PRIMARY), 'renameActivePage');
    assert.equal(matchShortcutId('h', Modifier.PRIMARY), 'toggleSidebar');
    assert.equal(matchShortcutId('h', Modifier.NONE), 'toggleCanvasHints');
});

test('matchShortcutId returns null when no modifier combo matches', function () {
    assert.equal(matchShortcutId('d', Modifier.NONE), null);
    assert.equal(matchShortcutId('d', Modifier.PRIMARY_SHIFT), null);
    assert.equal(matchShortcutId('q', Modifier.NONE), null);
});

test('matchShortcutId matches an ANY-modifier binding whether or not Shift is held', function () {
    assert.equal(matchShortcutId('+', Modifier.NONE), 'zoomIn');
    assert.equal(matchShortcutId('+', Modifier.SHIFT), 'zoomIn');
    assert.equal(matchShortcutId('-', Modifier.NONE), 'zoomOut');
    assert.equal(matchShortcutId('-', Modifier.SHIFT), 'zoomOut');
    assert.equal(matchShortcutId('.', Modifier.NONE), 'hideAll');
    assert.equal(matchShortcutId('.', Modifier.SHIFT), 'hideAll');
    assert.equal(matchShortcutId(',', Modifier.NONE), 'revealAll');
    assert.equal(matchShortcutId(',', Modifier.SHIFT), 'revealAll');
    assert.equal(matchShortcutId('0', Modifier.NONE), 'resetZoom');
    assert.equal(matchShortcutId('0', Modifier.SHIFT), 'resetZoom');
    assert.equal(matchShortcutId('=', Modifier.NONE), 'fitToView');
    assert.equal(matchShortcutId('=', Modifier.SHIFT), 'fitToView');
});
