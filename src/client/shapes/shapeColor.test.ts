import assert from 'node:assert/strict';
import { test } from 'node:test';
import { colorWithAlpha, mutedColor, hexToHsl, hexToHsv, hslToHex, hsvToHex, isLightColor, parseColor } from './shapeColor';

test('parseColor reads #rgb, #rrggbb and rgb() into lowercase #rrggbb', function () {
    assert.equal(parseColor('#F0a'), '#ff00aa');
    assert.equal(parseColor(' #A1B2C3 '), '#a1b2c3');
    assert.equal(parseColor('rgb(255, 0,16)'), '#ff0010');
    assert.equal(parseColor('RGB( 1 , 2 , 3 )'), '#010203');
});

test('parseColor rejects anything else', function () {
    for (const text of ['', 'red', '#ff', '#fffff', '#ggg', 'rgb(256, 0, 0)', 'rgb(1, 2)', 'rgba(1, 2, 3, 1)', 'ff0000']) {
        assert.equal(parseColor(text), null, text);
    }
});

test('hslToHex and hexToHsl round-trip', function () {
    assert.equal(hslToHex({ hue: 0, saturation: 1, lightness: 0.5 }), '#ff0000');
    assert.equal(hslToHex({ hue: 120, saturation: 1, lightness: 0.5 }), '#00ff00');
    assert.equal(hslToHex({ hue: 240, saturation: 0, lightness: 1 }), '#ffffff');
    for (const hex of ['#2563eb', '#a1b2c3', '#000000', '#ffffff', '#12ab34']) {
        assert.equal(hslToHex(hexToHsl(hex)), hex);
    }
});

test('hsvToHex puts the pure hue at full saturation and value, and round-trips', function () {
    assert.equal(hsvToHex({ hue: 0, saturation: 1, value: 1 }), '#ff0000');
    assert.equal(hsvToHex({ hue: 200, saturation: 0, value: 1 }), '#ffffff');
    assert.equal(hsvToHex({ hue: 200, saturation: 1, value: 0 }), '#000000');
    for (const hex of ['#2563eb', '#a1b2c3', '#ff8800', '#12ab34']) {
        assert.equal(hsvToHex(hexToHsv(hex)), hex);
    }
});

test('isLightColor separates light from dark colours', function () {
    assert.equal(isLightColor('#ffffff'), true);
    assert.equal(isLightColor('#ffee00'), true);
    assert.equal(isLightColor('#000000'), false);
    assert.equal(isLightColor('#0f2350'), false);
});

test('mutedColor scales saturation and colorWithAlpha gives rgba', function () {
    assert.equal(mutedColor('#ff0000', 0), '#808080');
    assert.equal(mutedColor('#ff0000', 1), '#ff0000');
    assert.equal(colorWithAlpha('#ff0010', 0.25), 'rgba(255, 0, 16, 0.25)');
});
