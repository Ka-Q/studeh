import assert from 'node:assert/strict';
import { test } from 'node:test';
import { shortcutHint } from './shortcuts';

test('shortcutHint formats a single binding without a separator', function () {
    assert.equal(shortcutHint('renameDocument'), 'F2');
    assert.equal(shortcutHint('renameActivePage'), 'Ctrl+F2');
});

test('shortcutHint joins multiple bindings with " / "', function () {
    assert.equal(shortcutHint('selectPreviousPage'), 'Up arrow / Left arrow');
    assert.equal(shortcutHint('selectNextPage'), 'Down arrow / Right arrow');
});
