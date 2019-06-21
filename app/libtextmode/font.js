const {white, bright_white, get_rgba, convert_ega_to_vga, ega} = require("./palette");
const {create_canvas} = require("./canvas");

function generate_font_canvas(bitmask, height, length) {
    const {canvas, ctx, image_data} = create_canvas(8 * length, height);
    const rgba = get_rgba(convert_ega_to_vga(bright_white));
    for (let i = 0, y = 0, char = 0; i < bitmask.length; i++) {
        for (let x = 0, byte = bitmask[i]; x < 8; x++) {
            if (byte >> x & 1) {
                image_data.data.set(rgba, (y * canvas.width + (8 - 1 - x) + char * 8) * 4);
            }
        }
        if ((i + 1) % height == 0) {
            y = 0;
            char++;
        } else {
            y++;
        }
    }
    ctx.putImageData(image_data, 0, 0);
    return canvas;
}

function add_ninth_bit_to_canvas(canvas, length) {
    const {canvas: new_canvas, ctx} = create_canvas(9 * length, canvas.height);
    for (let char = 0; char < length; char++) {
        ctx.drawImage(canvas, char * 8, 0, 8, canvas.height, char * 9, 0, 8, canvas.height);
        if (char >= 0xc0 && char <= 0xdf) {
            ctx.drawImage(canvas, char * 8 + 8 - 1, 0, 1, canvas.height, char * 9 + 8, 0, 1, canvas.height);
        }
    }
    return new_canvas;
}

function coloured_glyphs(canvas, rgb) {
    const image_data = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height);
    const {canvas: coloured_canvas, ctx} = create_canvas(canvas.width, canvas.height);
    const rgba = get_rgba(rgb);
    for (let i = 0; i < image_data.data.length; i += 4) {
        if (image_data.data[i + 3]) {
            image_data.data.set(rgba, i);
        }
    }
    ctx.putImageData(image_data, 0, 0);
    return coloured_canvas;
}

function coloured_background(font_width, height, rgb) {
    const {canvas, ctx, image_data} = create_canvas(font_width, height);
    const rgba = get_rgba(rgb);
    for (let i = 0; i < image_data.data.length; i += 4) {
        image_data.data.set(rgba, i);
    }
    ctx.putImageData(image_data, 0, 0);
    return canvas;
}

function create_coloured_glyph({canvas: glyphs_canvas, code, rgb, width, height}) {
    const {canvas, ctx} = create_canvas(width, height);
    const image_data = glyphs_canvas.getContext("2d").getImageData(code * width, 0, width, height);
    const rgba = get_rgba(rgb);
    for (let i = 0; i < image_data.data.length; i += 4) {
        if (image_data.data[i + 3]) {
            image_data.data.set(rgba, i);
        }
    }
    ctx.putImageData(image_data, 0, 0);
    return canvas;
}

function lookup_url(font_name) {
    switch (font_name) {
    case "IBM VGA":               return "../fonts/ibm/CP437.F16";
    case "IBM VGA50":             return "../fonts/ibm/CP437.F08";
    case "IBM VGA25G":            return "../fonts/ibm/CP437.F19";
    case "IBM EGA":               return "../fonts/ibm/CP437.F14";
    case "IBM EGA43":             return "../fonts/ibm/CP437.F08";
    case "IBM VGA 437":           return "../fonts/ibm/CP437.F16";
    case "IBM VGA50 437":         return "../fonts/ibm/CP437.F08";
    case "IBM VGA25G 437":        return "../fonts/ibm/CP437.F19";
    case "IBM EGA 437":           return "../fonts/ibm/CP437.F14";
    case "IBM EGA43 437":         return "../fonts/ibm/CP437.F08";
    case "IBM VGA 720":           return "../fonts/ibm/CP720.F16";
    case "IBM VGA50 720":         return "../fonts/ibm/CP720.F08";
    case "IBM VGA25G 720":        return "../fonts/ibm/CP720.F19";
    case "IBM EGA 720":           return "../fonts/ibm/CP720.F14";
    case "IBM EGA43 720":         return "../fonts/ibm/CP720.F08";
    case "IBM VGA 737":           return "../fonts/ibm/CP737.F16";
    case "IBM VGA50 737":         return "../fonts/ibm/CP737.F08";
    case "IBM VGA25G 737":        return "../fonts/ibm/CP737.F19";
    case "IBM EGA 737":           return "../fonts/ibm/CP737.F14";
    case "IBM EGA43 737":         return "../fonts/ibm/CP737.F08";
    case "IBM VGA 775":           return "../fonts/ibm/CP775.F16";
    case "IBM VGA50 775":         return "../fonts/ibm/CP775.F08";
    case "IBM VGA25G 775":        return "../fonts/ibm/CP775.F19";
    case "IBM EGA 775":           return "../fonts/ibm/CP775.F14";
    case "IBM EGA43 775":         return "../fonts/ibm/CP775.F08";
    case "IBM VGA 819":           return "../fonts/ibm/CP819.F16";
    case "IBM VGA50 819":         return "../fonts/ibm/CP819.F08";
    case "IBM VGA25G 819":        return "../fonts/ibm/CP819.F19";
    case "IBM EGA 819":           return "../fonts/ibm/CP819.F14";
    case "IBM EGA43 819":         return "../fonts/ibm/CP819.F08";
    case "IBM VGA 850":           return "../fonts/ibm/CP850.F16";
    case "IBM VGA50 850":         return "../fonts/ibm/CP850.F08";
    case "IBM VGA25G 850":        return "../fonts/ibm/CP850.F19";
    case "IBM EGA 850":           return "../fonts/ibm/CP850.F14";
    case "IBM EGA43 850":         return "../fonts/ibm/CP850.F08";
    case "IBM VGA 852":           return "../fonts/ibm/CP852.F16";
    case "IBM VGA50 852":         return "../fonts/ibm/CP852.F08";
    case "IBM VGA25G 852":        return "../fonts/ibm/CP852.F19";
    case "IBM EGA 852":           return "../fonts/ibm/CP852.F14";
    case "IBM EGA43 852":         return "../fonts/ibm/CP852.F08";
    case "IBM VGA 855":           return "../fonts/ibm/CP855.F16";
    case "IBM VGA50 855":         return "../fonts/ibm/CP855.F08";
    case "IBM VGA25G 855":        return "../fonts/ibm/CP855.F19";
    case "IBM EGA 855":           return "../fonts/ibm/CP855.F14";
    case "IBM EGA43 855":         return "../fonts/ibm/CP855.F08";
    case "IBM VGA 857":           return "../fonts/ibm/CP857.F16";
    case "IBM VGA50 857":         return "../fonts/ibm/CP857.F08";
    case "IBM VGA25G 857":        return "../fonts/ibm/CP857.F19";
    case "IBM EGA 857":           return "../fonts/ibm/CP857.F14";
    case "IBM EGA43 857":         return "../fonts/ibm/CP857.F08";
    case "IBM VGA 858":           return "../fonts/ibm/CP858.F16";
    case "IBM VGA50 858":         return "../fonts/ibm/CP858.F08";
    case "IBM VGA25G 858":        return "../fonts/ibm/CP858.F19";
    case "IBM EGA 858":           return "../fonts/ibm/CP858.F14";
    case "IBM EGA43 858":         return "../fonts/ibm/CP858.F08";
    case "IBM VGA 860":           return "../fonts/ibm/CP860.F16";
    case "IBM VGA50 860":         return "../fonts/ibm/CP860.F08";
    case "IBM VGA25G 860":        return "../fonts/ibm/CP860.F19";
    case "IBM EGA 860":           return "../fonts/ibm/CP860.F14";
    case "IBM EGA43 860":         return "../fonts/ibm/CP860.F08";
    case "IBM VGA 861":           return "../fonts/ibm/CP861.F16";
    case "IBM VGA50 861":         return "../fonts/ibm/CP861.F08";
    case "IBM VGA25G 861":        return "../fonts/ibm/CP861.F19";
    case "IBM EGA 861":           return "../fonts/ibm/CP861.F14";
    case "IBM EGA43 861":         return "../fonts/ibm/CP861.F08";
    case "IBM VGA 862":           return "../fonts/ibm/CP862.F16";
    case "IBM VGA50 862":         return "../fonts/ibm/CP862.F08";
    case "IBM VGA25G 862":        return "../fonts/ibm/CP862.F19";
    case "IBM EGA 862":           return "../fonts/ibm/CP862.F14";
    case "IBM EGA43 862":         return "../fonts/ibm/CP862.F08";
    case "IBM VGA 863":           return "../fonts/ibm/CP863.F16";
    case "IBM VGA50 863":         return "../fonts/ibm/CP863.F08";
    case "IBM VGA25G 863":        return "../fonts/ibm/CP863.F19";
    case "IBM EGA 863":           return "../fonts/ibm/CP863.F14";
    case "IBM EGA43 863":         return "../fonts/ibm/CP863.F08";
    case "IBM VGA 864":           return "../fonts/ibm/CP864.F16";
    case "IBM VGA50 864":         return "../fonts/ibm/CP864.F08";
    case "IBM VGA25G 864":        return "../fonts/ibm/CP864.F19";
    case "IBM EGA 864":           return "../fonts/ibm/CP864.F14";
    case "IBM EGA43 864":         return "../fonts/ibm/CP864.F08";
    case "IBM VGA 865":           return "../fonts/ibm/CP865.F16";
    case "IBM VGA50 865":         return "../fonts/ibm/CP865.F08";
    case "IBM VGA25G 865":        return "../fonts/ibm/CP865.F19";
    case "IBM EGA 865":           return "../fonts/ibm/CP865.F14";
    case "IBM EGA43 865":         return "../fonts/ibm/CP865.F08";
    case "IBM VGA 866":           return "../fonts/ibm/CP866.F16";
    case "IBM VGA50 866":         return "../fonts/ibm/CP866.F08";
    case "IBM VGA25G 866":        return "../fonts/ibm/CP866.F19";
    case "IBM EGA 866":           return "../fonts/ibm/CP866.F14";
    case "IBM EGA43 866":         return "../fonts/ibm/CP866.F08";
    case "IBM VGA 869":           return "../fonts/ibm/CP869.F16";
    case "IBM VGA50 869":         return "../fonts/ibm/CP869.F08";
    case "IBM VGA25G 869":        return "../fonts/ibm/CP869.F19";
    case "IBM EGA 869":           return "../fonts/ibm/CP869.F14";
    case "IBM EGA43 869":         return "../fonts/ibm/CP869.F08";
    case "IBM VGA 872":           return "../fonts/ibm/CP872.F16";
    case "IBM VGA50 872":         return "../fonts/ibm/CP872.F08";
    case "IBM VGA25G 872":        return "../fonts/ibm/CP872.F19";
    case "IBM EGA 872":           return "../fonts/ibm/CP872.F14";
    case "IBM EGA43 872":         return "../fonts/ibm/CP872.F08";
    case "IBM VGA KAM":           return "../fonts/ibm/CP867.F16";
    case "IBM VGA50 KAM":         return "../fonts/ibm/CP867.F08";
    case "IBM VGA25G KAM":        return "../fonts/ibm/CP867.F19";
    case "IBM EGA KAM":           return "../fonts/ibm/CP867.F14";
    case "IBM EGA43 KAM":         return "../fonts/ibm/CP867.F08";
    case "IBM VGA MAZ":           return "../fonts/ibm/CP667.F16";
    case "IBM VGA50 MAZ":         return "../fonts/ibm/CP667.F08";
    case "IBM VGA25G MAZ":        return "../fonts/ibm/CP667.F19";
    case "IBM EGA MAZ":           return "../fonts/ibm/CP667.F14";
    case "IBM EGA43 MAZ":         return "../fonts/ibm/CP667.F08";
    case "IBM VGA MIK":           return "../fonts/ibm/CP866.F16";
    case "IBM VGA50 MIK":         return "../fonts/ibm/CP866.F08";
    case "IBM VGA25G MIK":        return "../fonts/ibm/CP866.F19";
    case "IBM EGA MIK":           return "../fonts/ibm/CP866.F14";
    case "IBM EGA43 MIK":         return "../fonts/ibm/CP866.F08";
    case "IBM VGA 667":           return "../fonts/ibm/CP667.F16";
    case "IBM VGA50 667":         return "../fonts/ibm/CP667.F08";
    case "IBM VGA25G 667":        return "../fonts/ibm/CP667.F19";
    case "IBM EGA 667":           return "../fonts/ibm/CP667.F14";
    case "IBM EGA43 667":         return "../fonts/ibm/CP667.F08";
    case "IBM VGA 790":           return "../fonts/ibm/CP790.F16";
    case "IBM VGA50 790":         return "../fonts/ibm/CP790.F08";
    case "IBM VGA25G 790":        return "../fonts/ibm/CP790.F19";
    case "IBM EGA 790":           return "../fonts/ibm/CP790.F14";
    case "IBM EGA43 790":         return "../fonts/ibm/CP790.F08";
    case "IBM VGA 866":           return "../fonts/ibm/CP866.F16";
    case "IBM VGA50 866":         return "../fonts/ibm/CP866.F08";
    case "IBM VGA25G 866":        return "../fonts/ibm/CP866.F19";
    case "IBM EGA 866":           return "../fonts/ibm/CP866.F14";
    case "IBM EGA43 866":         return "../fonts/ibm/CP866.F08";
    case "IBM VGA 867":           return "../fonts/ibm/CP867.F16";
    case "IBM VGA50 867":         return "../fonts/ibm/CP867.F08";
    case "IBM VGA25G 867":        return "../fonts/ibm/CP867.F19";
    case "IBM EGA 867":           return "../fonts/ibm/CP867.F14";
    case "IBM EGA43 867":         return "../fonts/ibm/CP867.F08";
    case "IBM VGA 895":           return "../fonts/ibm/CP895.F16";
    case "IBM VGA50 895":         return "../fonts/ibm/CP895.F08";
    case "IBM VGA25G 895":        return "../fonts/ibm/CP895.F19";
    case "IBM EGA 895":           return "../fonts/ibm/CP895.F14";
    case "IBM EGA43 895":         return "../fonts/ibm/CP895.F08";
    case "IBM VGA 991":           return "../fonts/ibm/CP991.F16";
    case "IBM VGA50 991":         return "../fonts/ibm/CP991.F08";
    case "IBM VGA25G 991":        return "../fonts/ibm/CP991.F19";
    case "IBM EGA 991":           return "../fonts/ibm/CP991.F14";
    case "IBM EGA43 991":         return "../fonts/ibm/CP991.F08";
    case "Amiga Topaz 1":         return "../fonts/amiga/Topaz_a500.F16";
    case "Amiga Topaz 1+":        return "../fonts/amiga/TopazPlus_a500.F16";
    case "Amiga Topaz 2":         return "../fonts/amiga/Topaz_a1200.F16";
    case "Amiga Topaz 2+":        return "../fonts/amiga/TopazPlus_a1200.F16";
    case "Amiga P0T-NOoDLE":      return "../fonts/amiga/P0T-NOoDLE.F16";
    case "Amiga MicroKnight":     return "../fonts/amiga/MicroKnight.F16";
    case "Amiga MicroKnight+":    return "../fonts/amiga/MicroKnightPlus.F16";
    case "Amiga mOsOul":          return "../fonts/amiga/mO'sOul.F16";
    case "C64 PETSCII unshifted": return "../fonts/c64/unshifted.F08";
    case "C64 PETSCII shifted":   return "../fonts/c64/shifted.F08";
    case "Atari ATASCII":         return "../fonts/atari/atascii.F08";
    default:                      return "../fonts/ibm/CP437.F16";
    }
}

class Font {
    async load({name = "IBM VGA", bytes, use_9px_font = true}) {
        if (bytes) {
            this.name = "Custom";
        } else {
            this.name = name;
            let req = new Request(lookup_url(name));
            let resp = await fetch(req);
            bytes = new Uint8Array(await resp.arrayBuffer());
        }
        const font_height = bytes.length / 256;
        if (font_height % 1 != 0) {
            throw("Error loading font.");
        }
        this.height = font_height;
        this.bitmask = bytes;
        this.width = 8;
        this.length = 256;
        this.use_9px_font = use_9px_font;
        this.canvas = generate_font_canvas(this.bitmask, this.height, this.length);
        if (this.use_9px_font) {
            this.width += 1;
            this.canvas = add_ninth_bit_to_canvas(this.canvas, this.length);
        }
        this.glyphs = this.palette.map(rgb => coloured_glyphs(this.canvas, convert_ega_to_vga(rgb)));
        this.backgrounds = this.palette.map(rgb => coloured_background(this.width, this.height, convert_ega_to_vga(rgb)));
        this.cursor = coloured_background(this.width, 2, convert_ega_to_vga(bright_white));
    }

    draw(ctx, block, x, y) {
        if (block.bg_rgb) {
            ctx.drawImage(coloured_background(this.width, this.height, block.bg_rgb), x, y);
        } else {
            ctx.drawImage(this.backgrounds[block.bg], x, y);
        }
        if (block.fg_rgb) {
            ctx.drawImage(create_coloured_glyph({canvas: this.canvas, code: block.code, rgb: block.fg_rgb, width: this.width, height: this.height}), x, y);
        } else {
            ctx.drawImage(this.glyphs[block.fg], block.code * this.width, 0, this.width, this.height, x, y, this.width, this.height);
        }
    }

    draw_raw(ctx, block, x, y) {
        ctx.drawImage(create_coloured_glyph({canvas: this.canvas, code: block.code, rgb: convert_ega_to_vga(white), width: this.width, height: this.height}), x, y);
    }

    get_rgb(i) {
        return convert_ega_to_vga(this.palette[i]);
    }

    draw_bg(ctx, bg, x, y) {
        ctx.drawImage(this.backgrounds[bg], x, y);
    }

    draw_cursor(ctx, x, y) {
        ctx.drawImage(this.cursor, x, y);
    }

    constructor(palette = ega) {
        this.palette = palette;
    }
}

module.exports = {Font};
