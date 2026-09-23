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

test('shortcutHint formats the zoom shortcuts', function () {
    assert.equal(shortcutHint('zoomIn'), '+');
    assert.equal(shortcutHint('zoomOut'), '-');
    assert.equal(shortcutHint('resetZoom'), '0');
    assert.equal(shortcutHint('fitToView'), '=');
});

test('shortcutHint formats the hide/reveal-all shortcuts', function () {
    assert.equal(shortcutHint('hideAll'), '.');
    assert.equal(shortcutHint('revealAll'), ',');
});
