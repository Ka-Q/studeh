import assert from 'node:assert/strict';
import { test } from 'node:test';
import { joystickSpeed } from './canvasPan';

test('joystickSpeed is still within the dead zone, then grows with the push up to a top speed', function () {
    assert.equal(joystickSpeed(0), 0);
    assert.equal(joystickSpeed(3), 0);
    assert.ok(joystickSpeed(10) > 0);
    assert.ok(joystickSpeed(20) > joystickSpeed(10));
    assert.equal(joystickSpeed(40), joystickSpeed(400));
});
