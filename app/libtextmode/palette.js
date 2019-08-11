const black = {r: 0, g: 0, b: 0};
const blue = {r: 0, g: 0, b: 42};
const green = {r: 0, g: 42, b:   0};
const cyan = {r: 0, g: 42, b: 42};
const red = {r: 42, g: 0, b: 0};
const magenta = {r: 42, g: 0, b: 42};
const yellow = {r: 42, g: 21, b: 0};
const white = {r: 42, g: 42, b: 42};
const bright_black = {r: 21, g: 21, b: 21};
const bright_blue = {r: 21, g: 21, b: 63};
const bright_green = {r: 21, g: 63, b: 21};
const bright_cyan = {r: 21, g: 63, b: 63};
const bright_red = {r: 63, g: 21, b: 21};
const bright_magenta = {r: 63, g: 21, b: 63};
const bright_yellow = {r: 63, g: 63, b: 21};
const bright_white = {r: 63, g: 63, b: 63};

const ega = [black, blue, green, cyan, red, magenta, yellow, white, bright_black, bright_blue, bright_green, bright_cyan, bright_red, bright_magenta, bright_yellow, bright_white];

function get_rgba(rgb) {
    return new Uint8Array([rgb.r, rgb.g, rgb.b, 255]);
}

function convert_6bits_to_8bits(value) {
    return (value << 2) | ((value & 0x30) >> 4);
}

function convert_ega_to_vga(rgb) {
    return {
        r: convert_6bits_to_8bits(rgb.r),
        g: convert_6bits_to_8bits(rgb.g),
        b: convert_6bits_to_8bits(rgb.b)
    };
}

function convert_rgb_to_style(rgb) {
    return `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`;
}

function convert_ega_to_style(rgb) {
    return convert_rgb_to_style(convert_ega_to_vga(rgb));
}

function has_default_palette(palette) {
    for (let i = 0; i < palette.length; i++) {
        if (palette[i].r != ega[i].r || palette[i].g != ega[i].g || palette[i].b != ega[i].b) return false;
    }
    return true;
}
module.exports = {white, bright_white, ega, get_rgba, convert_ega_to_vga, convert_ega_to_style, has_default_palette};
