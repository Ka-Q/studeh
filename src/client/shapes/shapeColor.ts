export interface Hsl {
    // Degrees 0-360; saturation and lightness 0-1.
    hue: number;
    saturation: number;
    lightness: number;
}

export interface Hsv {
    // Degrees 0-360; saturation and value 0-1.
    hue: number;
    saturation: number;
    value: number;
}

// Share of a custom colour's saturation kept in a hidden shape's fill, so it hides its label like the default grey.
const HIDDEN_FILL_SATURATION = 0.2;
const SHORT_HEX_PATTERN = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i;
const LONG_HEX_PATTERN = /^#[0-9a-f]{6}$/i;
const RGB_PATTERN = /^rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/i;
const MAX_CHANNEL = 255;
// Past this relative luminance a colour counts as light.
const LIGHT_LUMINANCE = 0.4;

// A colour typed as #rgb, #rrggbb or rgb(r, g, b), as a lowercase #rrggbb; null when it is none of these.
export function parseColor(text: string): string | null {
    const trimmed = text.trim();
    const short = SHORT_HEX_PATTERN.exec(trimmed);
    if (short) {
        return `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}`.toLowerCase();
    }
    if (LONG_HEX_PATTERN.test(trimmed)) {
        return trimmed.toLowerCase();
    }
    const rgb = RGB_PATTERN.exec(trimmed);
    if (rgb) {
        const channels = rgb.slice(1).map(Number);
        return channels.every((channel) => channel <= MAX_CHANNEL) ? hexOf(channels) : null;
    }
    return null;
}

export function hslToHex({ hue, saturation, lightness }: Hsl): string {
    const chroma = saturation * Math.min(lightness, 1 - lightness);
    function channel(offset: number): number {
        const k = (offset + hue / 30) % 12;
        return (lightness - chroma * Math.max(-1, Math.min(k - 3, 9 - k, 1))) * MAX_CHANNEL;
    }
    return hexOf([channel(0), channel(8), channel(4)]);
}

export function hexToHsl(hex: string): Hsl {
    const [red, green, blue] = channelsOf(hex).map((channel) => channel / MAX_CHANNEL);
    const max = Math.max(red, green, blue);
    const min = Math.min(red, green, blue);
    const lightness = (max + min) / 2;
    const delta = max - min;
    if (delta === 0) {
        return { hue: 0, saturation: 0, lightness };
    }
    const saturation = delta / (1 - Math.abs(2 * lightness - 1));
    let hue: number;
    if (max === red) {
        hue = ((green - blue) / delta + 6) % 6;
    } else if (max === green) {
        hue = (blue - red) / delta + 2;
    } else {
        hue = (red - green) / delta + 4;
    }
    return { hue: hue * 60, saturation, lightness };
}

export function hsvToHex({ hue, saturation, value }: Hsv): string {
    const lightness = value * (1 - saturation / 2);
    const extent = Math.min(lightness, 1 - lightness);
    return hslToHex({ hue, saturation: extent === 0 ? 0 : (value - lightness) / extent, lightness });
}

export function hexToHsv(hex: string): Hsv {
    const { hue, saturation, lightness } = hexToHsl(hex);
    const value = lightness + saturation * Math.min(lightness, 1 - lightness);
    return { hue, saturation: value === 0 ? 0 : 2 * (1 - lightness / value), value };
}

export function isLightColor(hex: string): boolean {
    const [red, green, blue] = channelsOf(hex).map(function linear(channel) {
        const value = channel / MAX_CHANNEL;
        return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * red + 0.7152 * green + 0.0722 * blue > LIGHT_LUMINANCE;
}

// The fill of a hidden shape (study mode) with this outline colour.
export function hiddenFillOf(color: string): string {
    return mutedColor(color, HIDDEN_FILL_SATURATION);
}

// The colour with its saturation scaled to `retained` (0-1), towards grey.
export function mutedColor(hex: string, retained: number): string {
    const hsl = hexToHsl(hex);
    return hslToHex({ ...hsl, saturation: hsl.saturation * retained });
}

export function colorWithAlpha(hex: string, alpha: number): string {
    const [red, green, blue] = channelsOf(hex);
    return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

function channelsOf(hex: string): number[] {
    return [1, 3, 5].map((start) => parseInt(hex.slice(start, start + 2), 16));
}

function hexOf(channels: number[]): string {
    return `#${channels.map((channel) => Math.round(channel).toString(16).padStart(2, '0')).join('')}`;
}
