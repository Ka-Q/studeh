import assert from 'node:assert/strict';
import { test } from 'node:test';
import { sanitizePercent } from './canvasZoom';

test('sanitizePercent rejects non-numeric and empty input', function () {
    assert.equal(sanitizePercent('abc'), null);
    assert.equal(sanitizePercent('   '), null);
    assert.equal(sanitizePercent(''), null);
});

test('sanitizePercent clamps numeric input to the 10-800 range', function () {
    assert.equal(sanitizePercent('5'), '10');
    assert.equal(sanitizePercent('900'), '800');
    assert.equal(sanitizePercent('250'), '250');
});

test('sanitizePercent rounds fractional input', function () {
    assert.equal(sanitizePercent('150.6'), '151');
});
