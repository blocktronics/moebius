const rgb = (r, g, b) => ({r, g, b});

const black = rgb(0, 0, 0);
const blue = rgb(0, 0, 42);
const green = rgb(0, 42, 0);
const cyan = rgb(0, 42, 42);
const red = rgb(42, 0, 0);
const magenta = rgb(42, 0, 42);
const yellow = rgb(42, 21, 0);
const white = rgb(42, 42, 42);
const bright_black = rgb(21, 21, 21);
const bright_blue = rgb(21, 21, 63);
const bright_green = rgb(21, 63, 21);
const bright_cyan = rgb(21, 63, 63);
const bright_red = rgb(63, 21, 21);
const bright_magenta = rgb(63, 21, 63);
const bright_yellow = rgb(63, 63, 21);
const bright_white = rgb(63, 63, 63);

const c64_black = rgb(0, 0, 0);
const c64_white = rgb(63, 63, 63);
const c64_red = rgb(32, 13, 14);
const c64_cyan = rgb(29, 51, 50);
const c64_violet = rgb(35, 15, 37);
const c64_green = rgb(21, 43, 19);
const c64_blue = rgb(12, 11, 38);
const c64_yellow = rgb(59, 60, 28);
const c64_orange = rgb(35, 20, 10);
const c64_brown = rgb(21, 14, 0);
const c64_light_red = rgb(48, 27, 28);
const c64_dark_grey = rgb(19, 19, 18);
const c64_grey = rgb(31, 31, 31);
const c64_light_green = rgb(42, 63, 39);
const c64_light_blue = rgb(26, 27, 58);
const c64_light_grey = rgb(44, 44, 44);

const zx_black = rgb(0, 0, 0)
const zx_dark_blue = rgb(0, 0, 216)
const zx_blue = rgb(0, 0, 255)
const zx_dark_red = rgb(216, 0, 0)
const zx_red = rgb(255, 0, 0)
const zx_purple = rgb(216, 0, 216)
const zx_magenta = rgb(255, 0, 255)
const zx_dark_green = rgb(0, 216, 0)
const zx_green = rgb(0, 255, 0)
const zx_dark_cyan = rgb(0, 216, 216)
const zx_cyan = rgb(0, 255, 255)
const zx_dark_yellow = rgb(216, 216, 0)
const zx_yellow = rgb(255, 255, 0)
const zx_beige = rgb(216, 216, 216)
const zx_white = rgb(255, 255, 255)

const ega = [black, blue, green, cyan, red, magenta, yellow, white, bright_black, bright_blue, bright_green, bright_cyan, bright_red, bright_magenta, bright_yellow, bright_white];
const c64 = [c64_black, c64_white, c64_red, c64_cyan, c64_violet, c64_green, c64_blue, c64_yellow, c64_orange, c64_brown, c64_light_red, c64_dark_grey, c64_grey, c64_light_green, c64_light_blue, c64_light_grey];
const zx = [zx_black, zx_dark_blue, zx_blue, zx_dark_red, zx_red, zx_purple, zx_magenta, zx_dark_green, zx_green, zx_dark_cyan, zx_cyan, zx_dark_yellow, zx_yellow, zx_beige, zx_white, zx_white];

const palettes = {
    zx,
    default: ega
}

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

function has_ansi_palette(palette) {
    for (let i = 0; i < palette.length; i++) {
        if (palette[i].r != ega[i].r || palette[i].g != ega[i].g || palette[i].b != ega[i].b) return false;
    }
    return true;
}

function has_c64_palette(palette) {
    for (let i = 0; i < palette.length; i++) {
        if (palette[i].r != c64[i].r || palette[i].g != c64[i].g || palette[i].b != c64[i].b) return false;
    }
    return true;
}

module.exports = {white, bright_white, ega, c64, zx, palettes, get_rgba, convert_ega_to_vga, convert_ega_to_style, has_ansi_palette, has_c64_palette};
