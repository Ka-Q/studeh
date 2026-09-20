import assert from 'node:assert/strict';
import { test } from 'node:test';
import { sanitizeName } from './inlineEdit';

test('sanitizeName rejects whitespace-only and empty input', function () {
    assert.equal(sanitizeName('   '), null);
    assert.equal(sanitizeName(''), null);
});
